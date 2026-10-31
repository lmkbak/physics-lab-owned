"""Independent BRep CAD. Inputs only specs.json and own helpers; no legacy media/CAD."""
import json, math, hashlib, argparse, base64
from pathlib import Path
import cadquery as cq
import numpy as np
import trimesh
import families
import glassware
import mechanisms
import filtration
import assemblies
import instruments
from OCP.BRepTools import BRepTools
from OCP.BRepMesh import BRepMesh_IncrementalMesh
ROOT=Path(__file__).resolve().parent
SPEC=json.loads((ROOT/'specs.json').read_text(encoding='utf-8'))
SPEC['assets'].update(json.loads((ROOT/'specs-next.json').read_text(encoding='utf-8'))['assets'])
SPEC['assets'].update(json.loads((ROOT/'specs-glassware.json').read_text(encoding='utf-8'))['assets'])
SPEC['assets'].update(json.loads((ROOT/'specs-mechanisms.json').read_text(encoding='utf-8'))['assets'])
SPEC['assets'].update(json.loads((ROOT/'specs-filtration.json').read_text(encoding='utf-8'))['assets'])
SPEC['assets'].update(json.loads((ROOT/'specs-assemblies.json').read_text(encoding='utf-8'))['assets'])
MATERIALS={
 'steel':dict(color=[.65,.69,.73],opacity=1,metal=True,glass=False,roughness=.28),
 'insulator':dict(color=[.24,.20,.16],opacity=1,metal=False,glass=False,roughness=.76),
 'glass':dict(color=[.69,.89,.94],opacity=.3,metal=False,glass=True,roughness=.12),
 'nickel':dict(color=[.73,.72,.64],opacity=1,metal=True,glass=False,roughness=.3),
 'wood':dict(color=[.60,.38,.18],opacity=1,metal=False,glass=False,roughness=.85),
 'rubber':dict(color=[.12,.14,.15],opacity=1,metal=False,glass=False,roughness=.88),
 'ceramic':dict(color=[.91,.88,.79],opacity=1,metal=False,glass=False,roughness=.43),
 'cork':dict(color=[.65,.43,.22],opacity=1,metal=False,glass=False,roughness=.94),
 'copper':dict(color=[.76,.38,.19],opacity=1,metal=True,glass=False,roughness=.32),
 'zinc':dict(color=[.58,.64,.68],opacity=1,metal=True,glass=False,roughness=.49),
 'graphite':dict(color=[.13,.15,.16],opacity=1,metal=False,glass=False,roughness=.8),
 'membrane':dict(color=[.86,.84,.69],opacity=.45,metal=False,glass=False,roughness=.4),
 'foam':dict(color=[.91,.90,.84],opacity=1,metal=False,glass=False,roughness=.97),
 'paper':dict(color=[.95,.94,.85],opacity=1,metal=False,glass=False,roughness=.95),
 'ink':dict(color=[.32,.18,.56],opacity=1,metal=False,glass=False,roughness=.8),
 'blue':dict(color=[.16,.40,.78],opacity=1,metal=False,glass=False,roughness=.45),
 'green':dict(color=[.20,.61,.38],opacity=1,metal=False,glass=False,roughness=.45)}
def cylinder(r,h,z=0,x=0,y=0):return cq.Solid.makeCylinder(r,h,cq.Vector(x,y,z))
def box(x,y,z,origin=(0,0,0)):
 return cq.Workplane('XY').box(x,y,z,centered=(True,True,False)).val().translate(cq.Vector(*origin))
def shape_sum(shapes):
 result=shapes[0]
 for s in shapes[1:]:result=result.fuse(s)
 return result.clean()
def build_c26(s):
 b=s['bowl'];centre=cq.Vector(0,0,b['sphereCentreZ'])
 outer=cq.Solid.makeSphere(b['outerRadius'],centre,angleDegrees1=-90,angleDegrees2=90)
 inner=cq.Solid.makeSphere(b['innerRadius'],centre,angleDegrees1=-90,angleDegrees2=90)
 bowl=outer.cut(inner).intersect(box(40,40,b['rimZ']))
 d=s['stem'];stem=cylinder(d['radius'],d['z1']-d['z0'],d['z0'],d['x'])
 spoon=bowl.fuse(stem).clean()
 d=s['shield'];shield=cylinder(d['radius'],d['thickness'],d['z0'],d['x']).cut(cylinder(d['holeRadius'],d['thickness']+2,d['z0']-1,d['x']))
 return [('spoon',spoon,'steel',[0,0,0]),('shield',shield,'steel',[45,0,0])]
def build_c54(s):
 d=s['handle'];handle=cylinder(d['radius'],d['height']);chuck=cylinder(d['chuckRadius'],d['chuckHeight'],d['height']).cut(cylinder(d['boreRadius'],d['chuckHeight']+1,d['height']))
 w=s['wire'];stem=cylinder(w['radius'],w['stemZ1']-w['stemZ0'],w['stemZ0'])
 loop=cq.Solid.makeTorus(w['loopMajorRadius'],w['radius'],cq.Vector(0,0,w['loopCentreZ']),cq.Vector(0,1,0)).fuse(stem).clean()
 spare=cylinder(w['radius'],w['spareLength'])
 d=s['stand'];stand=box(d['width'],d['depth'],d['height'])
 for x in d['grooveXs']:
  cut=cq.Solid.makeCylinder(d['grooveRadius'],d['depth']+2,cq.Vector(x,-d['depth']/2-1,d['grooveCentreZ']),cq.Vector(0,1,0));stand=stand.cut(cut)
 return [('handle',handle,'insulator',[0,0,0]),('handle',chuck,'steel',[0,0,0]),('loop',loop,'nickel',[0,0,0]),('spare',spare,'nickel',[25,0,0]),('stand',stand,'wood',[0,40,0])]
BUILDERS={'C26':build_c26,'C54':build_c54,**families.BUILDERS,**glassware.BUILDERS,**mechanisms.BUILDERS,**filtration.BUILDERS,**assemblies.BUILDERS,**instruments.BUILDERS}
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def export_asset(number):
 s=SPEC['assets'][number];out=ROOT/'out'/s['asset'];out.mkdir(parents=True,exist_ok=True)
 components=BUILDERS[number](s);groups={};meshes=[];visual=trimesh.Scene();stats=[]
 for idx,(group,shape,material,offset)in enumerate(components):
  if not shape.isValid():raise ValueError(f'{number}/{group} invalid BRep')
  BRepTools.Clean_s(shape.wrapped)
  groups.setdefault(group,[]).append(shape)
  linear=.006 if number in ['C33','C41','C48','C61'] else (.008 if number=='C30' else .015)
  angular=.06 if number in ['C30','C41','C48','C61'] else .08
  BRepMesh_IncrementalMesh(shape.wrapped,linear,False,angular)
  vertices,triangles=shape.tessellate(linear,angular)
  positions=np.array([v.toTuple() for v in vertices],dtype=float);indices=np.array(triangles,dtype=int)
  mesh=trimesh.Trimesh(positions,indices,process=True)
  mesh.update_faces(mesh.nondegenerate_faces(height=1e-8));mesh.remove_unreferenced_vertices();mesh.merge_vertices(digits_vertex=6)
  if mesh.volume<0:mesh.invert()
  positions=mesh.vertices;indices=mesh.faces
  if len(indices)>60000:raise ValueError(f'{number}/{group}: component triangle limit 60000')
  name=f'{group}_{idx}';entry=dict(name=name,group=group,posB64=base64.b64encode(np.asarray(positions,dtype='<f4').tobytes()).decode('ascii'),idxB64=base64.b64encode(np.asarray(indices,dtype='<u4').tobytes()).decode('ascii'),vertexCount=len(positions),triangleCount=len(indices),assemblyOffset_mm=offset,**MATERIALS[material])
  meshes.append(entry)
  gl=mesh.copy();gl.apply_translation(offset);gl.apply_transform(np.array([[.001,0,0,0],[0,0,.001,0],[0,-.001,0,0],[0,0,0,1]]));gl.visual=trimesh.visual.ColorVisuals(gl,vertex_colors=np.tile(np.array([*MATERIALS[material]['color'],MATERIALS[material]['opacity']])*255,(len(gl.vertices),1)).astype(np.uint8));visual.add_geometry(gl,node_name=name,geom_name=name)
  stats.append(dict(name=name,group=group,brepVolume=shape.Volume(),meshVolume=mesh.volume,triangles=len(mesh.faces),watertight=mesh.is_watertight))
 for group,shapes in groups.items():
  compound=cq.Compound.makeCompound(shapes);cq.exporters.export(compound,str(out/f'{group}.step'))
 scene=dict(schema='owned-cad-scene/1',units='mm',up='Z',asset=s['asset'],ready=False,meshes=meshes,profiles={},runtime=s.get('runtime',{}))
 if sum(x['triangles']for x in stats)>120000:raise ValueError(f'{number}: compound triangle limit 120000')
 encoded=json.dumps(scene,separators=(',',':'))
 if len(encoded.encode('utf-8'))>3000000:raise ValueError(f'{number}: scene size limit 3MB')
 (out/'scene.json').write_text(encoded,encoding='utf-8')
 (out/(s['asset']+'.glb')).write_bytes(visual.export(file_type='glb'))
 manifest=dict(number=number,asset=s['asset'],ready=False,design=s['design'],source='independent new geometry; no third party media or original modeling scripts',license='not specified by user',inputs=[dict(path=p.name,sha256=digest(p))for p in [ROOT/'build.py',ROOT/'families.py',ROOT/'glassware.py',ROOT/'mechanisms.py',ROOT/'filtration.py',ROOT/'assemblies.py',ROOT/'instruments.py',ROOT/'specs-assemblies.json',ROOT/'specs.json',ROOT/'specs-next.json',ROOT/'specs-glassware.json',ROOT/'specs-mechanisms.json',ROOT/'specs-filtration.json']],specification=s,groupMap=s['groups'],stats=stats,tessellation=dict(linear_mm=.015,angular_rad=.08,componentTriangleMax=60000,compoundTriangleMax=120000,sceneBytesMax=3000000),coordinateTransform='local scene mm Z-up; display-only assemblyOffset; GLB display offsets then mm->m Z->Y [x,z,-y]',pending=['runtime placement/pivots','interaction','conservation','visual review','performance','production approval'])
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 print(json.dumps(dict(number=number,asset=s['asset'],groups=list(groups),triangles=sum(x['triangles']for x in stats),ready=False)),flush=True)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('numbers',nargs='*');args=parser.parse_args()
 failed=[]
 for number in args.numbers or list(SPEC['assets']):
  try:export_asset(number)
  except Exception as error:
   print(json.dumps(dict(number=number,error=str(error))),flush=True);failed.append(number)
 if failed:raise SystemExit(1)
