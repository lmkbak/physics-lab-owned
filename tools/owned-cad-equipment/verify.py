"""Read-only by default: reimport STEP/GLB, independent predeclared specification oracles."""
import json, math, argparse, base64
from pathlib import Path
import cadquery as cq
import numpy as np
import trimesh
ROOT=Path(__file__).resolve().parent
SPEC=json.loads((ROOT/'specs.json').read_text(encoding='utf-8'))
NEXT=ROOT/'specs-next.json'
if NEXT.exists():SPEC['assets'].update(json.loads(NEXT.read_text(encoding='utf-8'))['assets'])
SPEC['assets'].update(json.loads((ROOT/'specs-glassware.json').read_text(encoding='utf-8'))['assets'])
SPEC['assets'].update(json.loads((ROOT/'specs-filtration.json').read_text(encoding='utf-8'))['assets'])
SPEC['assets'].update(json.loads((ROOT/'specs-mechanisms.json').read_text(encoding='utf-8'))['assets'])
SPEC['assets'].update(json.loads((ROOT/'specs-assemblies.json').read_text(encoding='utf-8'))['assets'])
def inside(shape,p):return any(s.isInside(cq.Vector(*p),1e-6)for s in shape.Solids())
def surface_distance(shape,p):
    vertex=cq.Vertex.makeVertex(*p)
    return min(vertex.distance(face)for face in shape.Faces())
def verify(number,write=False):
    spec=SPEC['assets'][number];out=ROOT/'out'/spec['asset'];scene=json.loads((out/'scene.json').read_text(encoding='utf-8'));results=[];fails=[]
    def check(label,ok,actual=None):
        results.append({'check':label,'pass':bool(ok),'actual':actual})
        if not ok:fails.append(label)
    check('scene schema',scene['schema']=='owned-cad-scene/1' and scene['units']=='mm' and scene['up']=='Z' and scene['ready']==False)
    check('scene <=3MB',(out/'scene.json').stat().st_size<=3000000)
    check('compound <=120k triangles',sum(m['triangleCount']for m in scene['meshes'])<=120000)
    check('functional group present',set(spec['groups'])==set(m['group']for m in scene['meshes']),dict(expected=list(spec['groups']),actual=sorted(set(m['group']for m in scene['meshes']))))
    check('predeclared independent dimensional oracles present',bool(spec['checks']))
    for group in spec['groups']:
        tests=spec['checks'].get(group,{})
        shape=cq.importers.importStep(str(out/f'{group}.step')).val();check(group+' STEP valid',shape.isValid()and len(shape.Solids())>0)
        bounds=shape.BoundingBox();actual=np.array([[bounds.xmin,bounds.ymin,bounds.zmin],[bounds.xmax,bounds.ymax,bounds.zmax]])
        if 'bounds_mm'in tests:
            delta=float(np.max(np.abs(actual-np.array(tests['bounds_mm']))));check(group+' independent bounds <=.1mm',delta<=.1,dict(actual=actual.tolist(),maxError_mm=delta))
        else:check(group+' independent dimensional oracle',False,'missing predeclared bounds; current geometry is preliminary')
        for kind,expected in [('solid',True),('void',False)]:
            for point in tests.get(kind,[]):check(f'{group} {kind} {point}',inside(shape,point)==expected)
        components=[]
        for mesh in [m for m in scene['meshes']if m['group']==group]:
            xyz=np.frombuffer(base64.b64decode(mesh['posB64']),dtype='<f4').reshape(-1,3).astype(float);faces=np.frombuffer(base64.b64decode(mesh['idxB64']),dtype='<u4').reshape(-1,3)
            check(mesh['name']+' compact encoding and triangles',not('positions'in mesh or 'indices'in mesh)and len(faces)<=60000)
            check(mesh['name']+' finite/index',np.isfinite(xyz).all()and faces.min()>=0 and faces.max()<len(xyz))
            tri=trimesh.Trimesh(xyz,faces,process=False);components.append(tri)
            check(mesh['name']+' watertight',tri.is_watertight);check(mesh['name']+' nondegenerate',bool((tri.area_faces>1e-12).all()))
            check(mesh['name']+' RGB',len(mesh['color'])==3 and all(0<=v<=1 for v in mesh['color']))
        volume=sum(m.volume for m in components);err=abs(volume-shape.Volume())/shape.Volume();check(group+' mesh/STEP volume <=.2%',err<=.002,err)
        meshbounds=np.array([np.min([m.bounds[0]for m in components],axis=0),np.max([m.bounds[1]for m in components],axis=0)])
        check(group+' local mesh bounds <=.05mm',float(np.max(np.abs(meshbounds-actual)))<=.05)
        points=[]
        for m in components:
            centres=m.triangles_center
            for axis in range(3):
                lo,hi=m.bounds[:,axis]
                for band in range(12):
                    candidates=np.flatnonzero((centres[:,axis]>=lo+(hi-lo)*band/12)&(centres[:,axis]<=lo+(hi-lo)*(band+1)/12))
                    if len(candidates):
                        for j in candidates[np.linspace(0,len(candidates)-1,min(6,len(candidates)),dtype=int)]:points.append(centres[j])
        distances=[surface_distance(shape,p)for p in points]
        check(group+' sampled-only FACE chord <=.02mm',max(distances)<=.02,dict(max_mm=max(distances),sampleCount=len(points),coverage='12 layers per XYZ axis; up to 6 centroids/layer; sampled-only, full gate pending'))
    control=cq.Solid.makeSphere(10,cq.Vector(),angleDegrees1=-90,angleDegrees2=90)
    check('FACE distance inner .1mm negative control',abs(surface_distance(control,[9.9,0,0])-.1)<1e-6)
    check('FACE distance exact sphere positive control',surface_distance(control,[10,0,0])<1e-6)
    glb=trimesh.load(out/(spec['asset']+'.glb'),force='scene');check('GLB geometry count',len(glb.geometry)==len(scene['meshes']))
    for entry in scene['meshes']:
        check(entry['name']+' GLB group membership',entry['name']in glb.geometry)
        xyz=np.frombuffer(base64.b64decode(entry['posB64']),dtype='<f4').reshape(-1,3).astype(float);expected=xyz+np.array(entry['assemblyOffset_mm']);expected=expected[:,[0,2,1]]*np.array([.001,.001,-.001]);actual=glb.geometry[entry['name']].vertices
        error=float(np.max(np.abs(actual-expected)))if actual.shape==expected.shape else 1e9
        check(entry['name']+' GLB actual vertices mm->m Z->Y',error<1e-7,error)
    if number=='C26':
        b=spec['bowl'];sphere=lambda r,z:math.pi*(r*r*(z-(b['sphereCentreZ']-r))-(z-b['sphereCentreZ'])**3/3-r**3/3)
        outer=sphere(b['outerRadius'],b['rimZ']);inner=sphere(b['innerRadius'],b['rimZ']);stem=math.pi*spec['stem']['radius']**2*(spec['stem']['z1']-spec['stem']['z0'])
        body=cq.importers.importStep(str(out/'spoon.step')).val();oracle=outer-inner+stem;relative=abs(body.Volume()-oracle)/oracle
        check('spoon composite analytic volume <=1% (fusion overlap)',relative<=.01,dict(oracle_mm3=oracle,step_mm3=body.Volume(),relative=relative))
        d=spec['shield'];oracle=math.pi*(d['radius']**2-d['holeRadius']**2)*d['thickness'];sh=cq.importers.importStep(str(out/'shield.step')).val();check('shield annulus volume <=.01%',abs(sh.Volume()-oracle)/oracle<=.0001)
    if number=='C54':
        d=spec['wire'];oracle=math.pi*d['radius']**2*d['spareLength'];sh=cq.importers.importStep(str(out/'spare.step')).val();check('spare cylinder volume <=.01%',abs(sh.Volume()-oracle)/oracle<=.0001)
    result=dict(number=number,asset=spec['asset'],localChecksPass=not fails,ready=False,checks=results,failures=fails,pending=['full MESH-PRECISION including key cross-sections','all group analytic oracles','runtime pivots/interaction','visual review','fresh rebuild','performance','production approval'])
    if write:(out/'verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result),flush=True);return result
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');parser.add_argument('numbers',nargs='*');args=parser.parse_args()
    reports=[verify(n,args.write)for n in args.numbers or SPEC['assets']];raise SystemExit(0 if all(r['localChecksPass']for r in reports)else 1)
