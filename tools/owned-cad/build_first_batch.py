"""Independent first-batch CAD. Inputs: this source + first-batch-specs.json only.
No old models, images, caches, network, or original vendor construction code.
Writes an isolated tools/owned-cad/out tree unless Lead invokes with an explicit --output.
All outputs remain replacementReady=False pending integration and ownership review.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import math
from pathlib import Path
import sys
import cadquery as cq
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual import TextureVisuals

HERE = Path(__file__).resolve().parent
SPEC = json.loads((HERE / 'first-batch-specs.json').read_text(encoding='utf-8'))
MATERIALS = {
 'glass': dict(baseColorFactor=[205,235,240,95],metallicFactor=0,roughnessFactor=.12,alphaMode='BLEND',doubleSided=True),
 'amber': dict(baseColorFactor=[121,61,12,160],metallicFactor=0,roughnessFactor=.16,alphaMode='BLEND',doubleSided=True),
 'wood': dict(baseColorFactor=[161,112,66,255],metallicFactor=0,roughnessFactor=.83),
 'rubber':dict(baseColorFactor=[49,57,54,255],metallicFactor=0,roughnessFactor=.9),
 'steel':dict(baseColorFactor=[150,166,171,255],metallicFactor=.85,roughnessFactor=.32),
 'scale':dict(baseColorFactor=[22,65,76,255],metallicFactor=0,roughnessFactor=.76),
 'polymer':dict(baseColorFactor=[60,91,102,255],metallicFactor=0,roughnessFactor=.65),
}


def cylinder(r,h,z=0):
 return cq.Workplane('XY').circle(r).extrude(h).translate((0,0,z))


def lathe(points):
 return cq.Workplane('XZ').polyline(points).close().revolve(360,(0,0),(0,1))


def round_box(w,d,h,z=0,r=1):
 return cq.Workplane('XY').box(w,d,h,centered=(True,True,False)).edges('|Z').fillet(r).translate((0,0,z))


def spout_wire(radius,z,reach,half_angle):
 # Smooth compact bump, zero first derivative at join. Independent polar construction.
 pts=[]
 for i in range(192):
  a=2*math.pi*i/192
  signed=(a+math.pi)%(2*math.pi)-math.pi
  u=abs(signed)/half_angle
  bump=reach*(1-u*u)**3 if u<1 else 0
  rr=radius+bump
  pts.append(cq.Vector(rr*math.cos(a),rr*math.sin(a),z))
 return cq.Wire.assembleEdges([cq.Edge.makeSpline(pts,periodic=True)])


def beaker(p):
 r,w,h,b=p['innerRadius'],p['wall'],p['height'],p['bottom']
 start=h-p['spoutStartsBelowRim']; angle=math.radians(p['spoutHalfAngle_deg'])
 outer_base=cylinder(r+w,start).edges('<Z').chamfer(p['baseChamfer'])
 outer_top=cq.Solid.makeLoft([spout_wire(r+w,start,0,angle),spout_wire(r+w,h,p['spoutReach'],angle)])
 outer=outer_base.union(cq.Workplane(obj=outer_top))
 inner=cylinder(r,start-b,b).union(cq.Workplane(obj=cq.Solid.makeLoft([spout_wire(r,start,0,angle),spout_wire(r,h+.05,p['spoutReach'],angle)])))
 return outer.cut(inner), inner


def tube(p):
 ro=p['outerRadius']; ri=ro-p['wall']; h=p['height']
 # True hemispherical bottom tangent to cylindrical barrel; smooth inner/outer BRep.
 outer=cq.Workplane('XZ').moveTo(0,0).threePointArc((ro/math.sqrt(2),ro-ro/math.sqrt(2)),(ro,ro)).lineTo(ro,h).lineTo(0,h).close().revolve(360,(0,0),(0,1))
 inner=cq.Workplane('XZ').moveTo(0,ro-ri).threePointArc((ri/math.sqrt(2),ro-ri/math.sqrt(2)),(ri,ro)).lineTo(ri,h+.1).lineTo(0,h+.1).close().revolve(360,(0,0),(0,1))
 return outer.cut(inner),inner


def cylinder_vessel(p):
 r,w,b,h=p['innerRadius'],p['wall'],p['bottom'],p['height']
 # A genuine smooth pouring spout, separate foot, same topology as beaker family.
 q={**p,'spoutStartsBelowRim':6,'spoutReach':3,'spoutHalfAngle_deg':24,'baseChamfer':.2}
 body,cavity=beaker(q)
 return body,cavity


def bottle(p,wide):
 R=p['outerRadius']; r=R-p['wall']; n=p['neckInnerRadiusWide' if wide else 'neckInnerRadiusNarrow']; w=p['wall']
 b,s0,s1,h=p['bottom'],p['shoulderStarts'],p['shoulderEnds'],p['height']
 taper=math.tan(math.radians(p['neckTaper_deg']))
 lower=n-p['stopperEngagement']*taper
 # Body remains a single watertight glass solid; connector is an independently dimensioned teaching cone.
 outer=lathe([(0,0),(R-.4,0),(R,.4),(R,s0),(n+w,s1),(n+w,h),(0,h)])
 cavity=lathe([(0,b),(r,b),(r,s0),(lower,s1),(lower,h-p['stopperEngagement']),(n,h),(0,h)])
 body=outer.cut(cavity)
 gap=p['stopperRadialClearance']; engagement=p['stopperEngagement']
 stopper=lathe([(0,h-engagement),(lower-gap,h-engagement),(n-gap,h),(n+2,h),(n+2,h+2),(7,h+2),(7,h+8),(6.6,h+8.4),(0,h+8.4)])
 return body,cavity,stopper


# Original seven-segment numerals plus simple line-letter symbols. No font or external raster.
SEGMENTS={
 '0':'abcedf','1':'bc','2':'abged','3':'abgcd','4':'fgbc','5':'afgcd','6':'afgecd','7':'abc','8':'abcdefg','9':'abfgcd',
}
STROKES={'a':[(0,1),(1,1)],'b':[(1,1),(1,.5)],'c':[(1,.5),(1,0)],'d':[(0,0),(1,0)],'e':[(0,0),(0,.5)],'f':[(0,.5),(0,1)],'g':[(0,.5),(1,.5)]}
LETTERS={'I':[[(.5,0),(.5,1)],[(0,1),(1,1)],[(0,0),(1,0)]], 'N':[[(0,0),(0,1),(1,0),(1,1)]], 'm':[[(0,0),(0,.65),(.5,.3),(1,.65),(1,0)]], 'L':[[(0,1),(0,0),(1,0)]], 'C':[[(1,1),(0,1),(0,0),(1,0)]], '/':[[(0,0),(1,1)]], '°':[[(.3,.75),(.3,1),(.7,1),(.7,.75),(.3,.75)]], '.':[[(.4,0),(.6,0)]]}


def marking_mesh(radius,ticks,texts):
 meshes=[]
 def stroke(x0,z0,x1,z1,thickness=.15):
  length=math.hypot(x1-x0,z1-z0)
  if length<1e-9:return
  count=max(1,math.ceil(abs(x1-x0)/.6))
  for i in range(count):
   t0=i/count;t1=(i+1)/count
   a=x0+(x1-x0)*t0; b=x0+(x1-x0)*t1; za=z0+(z1-z0)*t0; zb=z0+(z1-z0)*t1
   mesh=trimesh.creation.box([max(.06,math.hypot(b-a,zb-za)),.07,thickness])
   az=(a+b)/2/radius
   center=np.array([radius*math.sin(az),-radius*math.cos(az),(za+zb)/2])
   tangent=np.array([math.cos(az),math.sin(az),0]); up=np.array([0,0,1]); outward=np.array([math.sin(az),-math.cos(az),0])
   slope=math.atan2(zb-za,b-a); u=tangent*math.cos(slope)+up*math.sin(slope); v=-outward; zz=np.cross(u,v)
   matrix=np.eye(4);matrix[:3,:3]=np.column_stack([u,v,zz]);matrix[:3,3]=center;mesh.apply_transform(matrix);meshes.append(mesh)
 for z,length in ticks:stroke(-length/2,z,length/2,z,.18)
 for value,z,center_x,size in texts:
  value=str(value);width=size*.6; advance=width*1.3;xstart=center_x-(len(value)-1)*advance/2-width/2
  for i,ch in enumerate(value):
   glyph=[STROKES[k] for k in SEGMENTS[ch]] if ch in SEGMENTS else LETTERS.get(ch,[])
   for poly in glyph:
    for a,b in zip(poly,poly[1:]):stroke(xstart+i*advance+a[0]*width,z+a[1]*size,xstart+i*advance+b[0]*width,z+b[1]*size,.13)
 return trimesh.util.concatenate(meshes) if meshes else None


def mesh_from_shape(shape):
 from OCP.BRepMesh import BRepMesh_IncrementalMesh
 from OCP.BRepTools import BRepTools
 BRepTools.Clean_s(shape.val().wrapped)
 # Explicit absolute-mm deflection: CadQuery's default relative meshing makes tiny
 # fillets and swept wire faces explode in triangle count.
 BRepMesh_IncrementalMesh(shape.val().wrapped,0.02,False,0.08,True)
 vs,fs_=shape.val().tessellate(0.02,0.08)
 mesh=trimesh.Trimesh(vertices=[v.toTuple() for v in vs],faces=fs_,process=True,validate=True)
 mesh.update_faces(mesh.nondegenerate_faces() & mesh.unique_faces())
 mesh.remove_unreferenced_vertices()
 mesh.merge_vertices(digits_vertex=7)
 # OCC already orients inner cavity shells inward; per-component normal repair would
 # flip sealed void shells and silently add their volume instead of subtracting it.
 return mesh


def revolved_mesh(profile,segments=96):
 vertices=[];rings=[]
 for r,z in profile:
  if abs(r)<1e-10:
   rings.append([len(vertices)]);vertices.append([0,0,z])
  else:
   rings.append(list(range(len(vertices),len(vertices)+segments)))
   vertices.extend([[r*math.cos(2*math.pi*i/segments),r*math.sin(2*math.pi*i/segments),z] for i in range(segments)])
 faces=[]
 for a,b in zip(rings,rings[1:]+rings[:1]):
  for i in range(segments):
   j=(i+1)%segments
   if len(a)==1 and len(b)==1:continue
   if len(a)==1:faces.append([a[0],b[j],b[i]])
   elif len(b)==1:faces.append([a[i],a[j],b[0]])
   else:faces.extend([[a[i],a[j],b[i]],[a[j],b[j],b[i]]])
 mesh=trimesh.Trimesh(vertices,faces,process=True,validate=True)
 if mesh.volume<0:mesh.invert()
 return mesh


def swept_round_mesh(wire,radius,inner_radius=None,samples=160,sections=48):
 vertices=[];radii=[radius] if inner_radius is None else [radius,inner_radius]
 sample_points=np.array([wire.positionAt(k/20).toTuple() for k in range(21)])
 binormal=np.eye(3)[int(np.argmin(np.ptp(sample_points,axis=0)))]
 for rr in radii:
  for k in range(samples+1):
   t=k/samples;p=wire.positionAt(t);tv=wire.tangentAt(t);tangent=np.array(tv.toTuple());tangent/=np.linalg.norm(tangent)
   v=binormal.copy();v-=tangent*np.dot(v,tangent)
   if np.linalg.norm(v)<.01:v=np.array([1.,0.,0.]);v-=tangent*np.dot(v,tangent)
   v/=np.linalg.norm(v);u=np.cross(v,tangent)
   for j in range(sections):vertices.append((np.array(p.toTuple())+rr*(u*math.cos(2*math.pi*j/sections)+v*math.sin(2*math.pi*j/sections))).tolist())
 faces=[];stride=(samples+1)*sections
 for layer in range(len(radii)):
  off=layer*stride
  for k in range(samples):
   for j in range(sections):
    a=off+k*sections+j;b=off+k*sections+(j+1)%sections;c=off+(k+1)*sections+j;d=off+(k+1)*sections+(j+1)%sections
    fs=[[a,b,c],[b,d,c]]
    faces.extend(fs if layer==0 else [list(reversed(f)) for f in fs])
 if inner_radius is None:
  for end in [0,samples]:
   center=len(vertices);vertices.append(np.mean(np.array(vertices)[end*sections:(end+1)*sections],axis=0).tolist())
   for j in range(sections):faces.append([center,end*sections+(j+1)%sections,end*sections+j] if end==0 else [center,end*sections+j,end*sections+(j+1)%sections])
 else:
  for end in [0,samples]:
   for j in range(sections):
    a=end*sections+j;b=end*sections+(j+1)%sections;c=stride+a;d=stride+b
    fs=[[a,c,b],[b,c,d]];faces.extend(fs if end==0 else [list(reversed(f)) for f in fs])
 mesh=trimesh.Trimesh(vertices,faces,process=True,validate=True)
 if mesh.volume<0:mesh.invert()
 return mesh


def add_part(scene,name,shape,material,offset=(0,0,0),report=None,out=None,mesh_override=None):
 assert shape.val().isValid(),f'Invalid BRep {name}'
 mesh=mesh_override if mesh_override is not None else mesh_from_shape(shape)
 vol=float(shape.val().Volume());error=abs(abs(mesh.volume)-vol)/vol*100 if vol else 0
 assert mesh.is_watertight,f'Non watertight {name}'
 assert error<=.2,f'Volume tolerance {name}: {error}'
 mesh.visual=TextureVisuals(material=PBRMaterial(name=material,**MATERIALS[material]))
 transform=np.eye(4);transform[:3,3]=offset
 scene.add_geometry(mesh,node_name=name,geom_name=name,transform=transform)
 if out:cq.exporters.export(shape,str(out/f'{name}.step'))
 row={'group':name,'material':material,'brepValid':True,'meshWatertight':bool(mesh.is_watertight),'brepVolume_mm3':vol,'meshVolume_mm3':abs(float(mesh.volume)),'meshVolumeError_pct':error,'triangles':len(mesh.faces),'localBounds_mm':mesh.bounds.tolist(),'assemblyOffset_mm':list(offset)}
 if report is not None:report.append(row)
 return row


def add_marks(scene,name,mesh,report,offset=(0,0,0)):
 if mesh is None:return
 mesh.visual=TextureVisuals(material=PBRMaterial(name='scale',**MATERIALS['scale']))
 transform=np.eye(4);transform[:3,3]=offset
 scene.add_geometry(mesh,node_name=name,geom_name=name,transform=transform)
 report.append({'group':name,'material':'scale','originalVectorMarkings':True,'triangles':len(mesh.faces),'assemblyOffset_mm':list(offset)})


def public_profiles(key):
 profiles={}
 def rec(inner,nominal=None,analytic=None,markings=None):
  return {'type':'piecewise-linear-radius','inner':inner,'nominalMl':nominal,'analytic':analytic,'markings':markings or {},'source':'independent-new-design','units':'mm','replacementReady':False}
 if key=='chem_beakers_owned':
  for name in ['beaker100','beaker250']:
   p=SPEC['C01'][name];r=p['innerRadius'];b=p['bottom'];h=p['height'];s=h-p['spoutStartsBelowRim']
   profiles[name]=rec([[b,r],[s,r],[h,r]],p['nominal_ml'],{'type':'cylinder-with-polar-spout','radius_mm':r,'bottom_mm':b,'spoutStart_mm':s,'rim_mm':h,'reach_mm':p['spoutReach'],'halfAngle_rad':math.radians(p['spoutHalfAngle_deg']),'bump':'reach*t*(1-u^2)^3; abs(theta)<halfAngle; u=abs(theta)/halfAngle'}, {'estimatedOnly':True,'nominalLineZ_mm':b+p['nominal_ml']*1000/(math.pi*r*r)})
 elif key=='chem_test_tubes_owned':
  for name in ['tube100','tube120','tube150']:
   p=SPEC['C02'][name];R=p['outerRadius'];ri=R-p['wall'];inner=[]
   for i in range(65):
    z=R-ri+ri*i/64;inner.append([z,math.sqrt(max(0,ri*ri-(z-R)**2))])
   inner.append([p['height'],ri])
   profiles[name]=rec(inner,None,{'type':'hemisphere-cylinder','radius_mm':ri,'sphereCenterZ_mm':R,'rim_mm':p['height']})
   profiles[name]['type']='analytic-radius-segments'
   profiles[name]['segments']=[{'kind':'sphere','z0':R-ri,'z1':R,'centerZ':R,'radius':ri},{'kind':'linear','z0':R,'z1':p['height'],'r0':ri,'r1':ri}]
 elif key=='chem_graduated_cylinders_owned':
  for name in ['cylinder50','cylinder100']:
   p=SPEC['C04'][name];r=p['innerRadius'];b=p['bottom'];h=p['height']
   profiles[name]=rec([[b,r],[h-6,r],[h,r]],p['nominal_ml'],{'type':'cylinder-with-polar-spout','radius_mm':r,'bottom_mm':b,'spoutStart_mm':h-6,'rim_mm':h,'reach_mm':3,'halfAngle_rad':math.radians(24)}, {'incrementMl':1,'numbersEveryMl':p['numberEvery_ml'],'direction':'bottom-up','nominalLineZ_mm':b+p['nominal_ml']*1000/(math.pi*r*r),'IN':True,'temperatureC':20})
 elif key=='chem_reagent_bottles_owned':
  p=SPEC['C22']['body'];r=p['outerRadius']-p['wall'];h=p['height'];b=p['bottom'];s0=p['shoulderStarts'];s1=p['shoulderEnds'];eng=p['stopperEngagement']
  for v in SPEC['C22']['variants']:
   n=p['neckInnerRadiusWide' if v['neck']=='wide' else 'neckInnerRadiusNarrow'];lower=n-eng*math.tan(math.radians(p['neckTaper_deg']))
   profiles[f'bottle_{v["id"]}']=rec([[b,r],[s0,r],[s1,lower],[h-eng,lower],[h,n]],None,{'type':'piecewise-linear-radius'})
 return profiles


def canonical_group(name):
 if name.startswith('gauze_'):return 'gauze'
 if name.startswith('tripod_leg_'):return 'tripod'
 for prefix in ['rack_posts','rack_guides','rack_pad','rack_screw']:
  if name.startswith(prefix):return {'rack_pad':'rack_base','rack_screw':'rack_posts'}.get(prefix,prefix)
 return name.removesuffix('_scale')


def export_asset(out,key,scene,rows,parameters,profiles=None,source_inputs=None):
 folder=out/key;folder.mkdir(parents=True,exist_ok=True)
 scene.export(str(folder/f'{key}.glb'))
 meshes=[]
 for row in rows:
  name=row['group'];mesh=scene.geometry[name];material=MATERIALS[row['material']]
  meshes.append({'name':name,'group':canonical_group(name),'posB64':base64.b64encode(np.asarray(mesh.vertices,dtype='<f4').tobytes()).decode('ascii'),'idxB64':base64.b64encode(np.asarray(mesh.faces,dtype='<u4').tobytes()).decode('ascii'),'color':[v/255 for v in material['baseColorFactor'][:3]],'opacity':material['baseColorFactor'][3]/255,'metal':material['metallicFactor']>0,'glass':row['material'] in ['glass','amber'],'roughness':material['roughnessFactor'],'assemblyOffset_mm':row['assemblyOffset_mm'],'role':'stopper' if name.startswith('stopper_') else None,'marking':row.get('originalVectorMarkings',False)})
 scene_contract={'schema':'owned-cad-scene/1','asset':key,'units':'mm','up':'Z','origin':'local part construction origin; assembly offsets are display-only','meshes':meshes,'profiles':public_profiles(key) if profiles is None else profiles,'replacementReady':False}
 encoded=json.dumps(scene_contract,ensure_ascii=False,separators=(',',':'))+'\n'
 triangles=sum(len(scene.geometry[r['group']].faces) for r in rows)
 assert triangles<=60000,f'Asset triangle budget exceeded {key}: {triangles}'
 assert len(encoded.encode('utf-8'))<=3000000,f'Scene byte budget exceeded {key}'
 (folder/'scene.json').write_text(encoded,encoding='utf-8')
 # STEP parts remain individual; the GLB has stable semantic node names and display transforms.
 manifest={'asset':key,'status':'isolated-development-unverified','units':'mm','upAxis':'Z','replacementReady':False,'sourceInputs':source_inputs or ['tools/owned-cad/build_first_batch.py','tools/owned-cad/first-batch-specs.json'],'parameters':parameters,'groups':rows,'integrationEvidence':[]}
 (folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 return manifest


def build_c01(out):
 key='chem_beakers_owned';folder=out/key;folder.mkdir(parents=True,exist_ok=True);scene=trimesh.Scene();rows=[]
 for name,offset in [('beaker100',(-55,0,0)),('beaker250',(45,0,0))]:
  p=SPEC['C01'][name];shape,_=beaker(p);add_part(scene,name,shape,'glass',offset,rows,folder)
  interval=20 if name=='beaker100' else 50
  ticks=[(p['bottom']+v*1000/(math.pi*p['innerRadius']**2),10 if v%interval==0 else 6) for v in range(interval,int(p['nominal_ml'])+1,interval)]
  texts=[(v,z,11,3) for v,(z,_) in zip(range(interval,int(p['nominal_ml'])+1,interval),ticks)]+[('mL',p['height']-16,-1,3)]
  add_marks(scene,name+'_scale',marking_mesh(p['innerRadius']+p['wall']+.06,ticks,texts),rows,offset)
 stirrer=cq.Workplane('XZ').moveTo(0,0).threePointArc((3/math.sqrt(2),3-3/math.sqrt(2)),(3,3)).lineTo(3,177).threePointArc((3/math.sqrt(2),177+3/math.sqrt(2)),(0,180)).close().revolve(360,(0,0),(0,1))
 add_part(scene,'stirrer',stirrer,'glass',(105,0,0),rows,folder)
 return export_asset(out,key,scene,rows,SPEC['C01'])


def build_c02(out):
 key='chem_test_tubes_owned';folder=out/key;folder.mkdir(parents=True,exist_ok=True);scene=trimesh.Scene();rows=[];p=SPEC['C02']['rack']
 add_part(scene,'rack_base',round_box(p['baseWidth'],p['baseDepth'],p['baseThickness'],0,3),'wood',report=rows,out=folder)
 for x in p['holeX']:
  pad=cylinder(8.2,2,10).cut(cq.Workplane('XY').sphere(8.3).translate((0,0,19)))
  add_part(scene,f'rack_pad_{x}',pad,'rubber',(x,0,0),rows,folder)
 for i,x in enumerate(p['postCentersX']):
  post=round_box(p['postWidth'],26,p['postHeight'],p['baseThickness'],1)
  add_part(scene,f'rack_posts_{i}',post,'wood',(x,0,0),rows,folder)
 for i,z in enumerate(p['guideBottoms']):
  guide=round_box(p['guideWidth'],p['guideDepth'],p['guideThickness'],z,2)
  for x in p['holeX']:guide=guide.cut(cylinder(p['holeDiameter']/2,p['guideThickness']+2,z-1).translate((x,0,0)))
  add_part(scene,f'rack_guides_{i}',guide,'wood',report=rows,out=folder)
  for j,x in enumerate(p['postCentersX']):
   screw=cylinder(1.4,6,z-2).union(cylinder(2.3,1,z+4)).cut(cq.Workplane('XY').box(4,.6,.8).translate((0,0,z+4.9)))
   add_part(scene,f'rack_screw_{i}_{j}',screw,'steel',(x,0,0),rows,folder)
 for i,name in enumerate(['tube100','tube120','tube150']):
  q=SPEC['C02'][name];shape,_=tube(q);R=q['outerRadius'];ri=R-q['wall'];H=q['height']
  outer=[(R*math.sin(math.pi/2*j/24),R-R*math.cos(math.pi/2*j/24)) for j in range(25)]
  inner=[(ri*math.sin(math.pi/2*j/24),R-ri*math.cos(math.pi/2*j/24)) for j in range(25)]
  contour=outer+[(R,H),(ri,H)]+list(reversed(inner))
  add_part(scene,name,shape,'glass',(p['holeX'][i],0,12),rows,folder,mesh_override=revolved_mesh(contour,96))
 return export_asset(out,key,scene,rows,SPEC['C02'])


def build_c04(out):
 key='chem_graduated_cylinders_owned';folder=out/key;folder.mkdir(parents=True,exist_ok=True);scene=trimesh.Scene();rows=[]
 for name,x in [('cylinder50',-35),('cylinder100',35)]:
  p=SPEC['C04'][name];shape,_=cylinder_vessel(p);r=p['innerRadius'];ro=r+p['wall'];foot=p['footThickness']
  add_part(scene,name,shape,'glass',(x,0,foot),rows,folder)
  # Hexagonal cup with a real seating well, 0.2mm radial fit clearance.
  diameter=p['footApothem']*2/math.cos(math.pi/6)
  base=cq.Workplane('XY').polygon(6,diameter).extrude(foot+2).edges('|Z').chamfer(.5).cut(cylinder(ro+p['footRadialClearance'],3,foot))
  add_part(scene,'foot'+name.removeprefix('cylinder'),base,'polymer',(x,0,0),rows,folder)
  ticks=[];texts=[]
  for v in range(1,p['nominal_ml']+1):
   z=p['bottom']+v*1000/(math.pi*r*r)
   ticks.append((z,6 if v%p['numberEvery_ml']==0 else 3))
   if v%p['numberEvery_ml']==0:texts.append((v,z-.7,9,2.5))
  texts.extend([('mL',p['height']-10,0,3),('IN',18,0,2.5),('20°C',12,0,2.5)])
  add_marks(scene,name+'_scale',marking_mesh(ro+.06,ticks,texts),rows,(x,0,foot))
 return export_asset(out,key,scene,rows,SPEC['C04'])


def build_c22(out):
 key='chem_reagent_bottles_owned';folder=out/key;folder.mkdir(parents=True,exist_ok=True);scene=trimesh.Scene();rows=[];p=SPEC['C22']['body']
 for variant in SPEC['C22']['variants']:
  i=variant['id'];offset=((i-1.5)*65,0,0);mat='amber' if variant['glass']=='amber' else 'glass'
  shape,_,stop=bottle(p,variant['neck']=='wide')
  add_part(scene,f'bottle_{i}',shape,mat,offset,rows,folder)
  add_part(scene,f'stopper_{i}',stop,mat,offset,rows,folder)
 return export_asset(out,key,scene,rows,SPEC['C22'])


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='+',choices=['C01','C02','C04','C22'],default=['C01','C02','C04','C22']);parser.add_argument('--output',type=Path,default=HERE/'out');args=parser.parse_args()
 out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
 manifest=[]
 for key in args.only:
  result={'C01':build_c01,'C02':build_c02,'C04':build_c04,'C22':build_c22}[key](out);manifest.append(result)
  print(json.dumps({'built':key,'groups':len(result['groups']),'replacementReady':False}),flush=True)
 receipt={'schema':'owned-cad-isolated-build/1','status':'geometry-built-integration-pending','replacementReady':False,'cadquery':cq.__version__,'trimesh':trimesh.__version__,'python':sys.version.split()[0],'inputHashes':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in [Path(__file__),HERE/'first-batch-specs.json']},'assets':[m['asset'] for m in manifest],'forbiddenResourcesRead':False,'fontDependency':None}
 (out/'build-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
