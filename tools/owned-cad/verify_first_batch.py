"""Read only isolated owned outputs; independent volume/profile oracle.
No import of the CAD generator: analytic primitives and adaptive integration live here.
"""
from __future__ import annotations
import argparse
import base64
import json
import math
from pathlib import Path
import cadquery as cq
import numpy as np
import trimesh
HERE=Path(__file__).resolve().parent
S=json.loads((HERE/'first-batch-specs.json').read_text(encoding='utf-8'))
OUT=HERE/'out'


def primitive(z,r):
 # Exact antiderivative on a segment is evaluated as frustum volume below.
 return math.pi*r*r*z


def linear_profile_volume(points,h):
 total=0
 for (z0,r0),(z1,r1) in zip(points,points[1:]):
  if h<=z0:break
  dz=min(h,z1)-z0
  if dz<=0:continue
  radius=r0+(r1-r0)*dz/(z1-z0)
  total+=math.pi*dz*(r0*r0+r0*radius+radius*radius)/3
 return total


def simpson(f,a,b,n=2000):
 if b<=a:return 0
 n=n+(n%2);step=(b-a)/n
 return step/3*(f(a)+f(b)+4*sum(f(a+i*step) for i in range(1,n,2))+2*sum(f(a+i*step) for i in range(2,n,2)))


def exact_oracle(profile,h):
 p=profile['analytic'];typ=p['type']
 if typ in ['hemisphere-cylinder','sphere-cylinder']:
  r=p['radius_mm'];bottom=p['sphereCenterZ_mm']-r;t=max(0,h-bottom)
  limit=r if typ=='hemisphere-cylinder' else p['sphereJoinZ_mm']-bottom
  cap=min(t,limit);neck=r if typ=='hemisphere-cylinder' else p['neckRadius_mm']
  return math.pi*cap*cap*(r-cap/3)+math.pi*neck*neck*max(0,t-limit)
 if typ=='cylinder-with-polar-spout':
  r,b,s,top,L,a=[p[k] for k in ['radius_mm','bottom_mm','spoutStart_mm','rim_mm','reach_mm','halfAngle_rad']]
  hc=max(b,min(h,top));vol=math.pi*r*r*(hc-b)
  if hc>s:
   # Integral compact radial bump A=1/2 int (r+L*t*(1-u²)^3)^2 dtheta.
   i1=16/35;i2=1024/3003;span=hc-s;D=top-s
   vol+=2*a*r*L*i1*span*span/(2*D)+a*L*L*i2*span**3/(3*D*D)
  return vol
 if typ=='piecewise-linear-with-polar-spout':
  s=p['spoutStart_mm'];top=p['rim_mm'];D=top-s;x=max(0,min(h,top)-s);L=p['reach_mm'];a=p['halfAngle_rad'];(z0,r0),(z1,r1)=profile['inner'][-2:];k=(r1-r0)/D
  extra=2*a*L*(16/35)/D*(r0*x*x/2+k*x**3/3)+a*L*L*(1024/3003)*x**3/(3*D*D)
  return linear_profile_volume(profile['inner'],h)+extra
 return linear_profile_volume(profile['inner'],h)


def section_area_oracle(profile,z):
 # Independently sample angular area for asymmetric spouts; do not use exact integral constants.
 p=profile['analytic'];typ=p['type']
 if typ in ['hemisphere-cylinder','sphere-cylinder']:
  r=p['radius_mm'];c=p['sphereCenterZ_mm'];end=c if typ=='hemisphere-cylinder' else p['sphereJoinZ_mm'];neck=r if typ=='hemisphere-cylinder' else p['neckRadius_mm'];return math.pi*max(0,r*r-(z-c)**2) if z<end else math.pi*neck*neck
 if typ=='cylinder-with-polar-spout':
  r=p['radius_mm'];s=p['spoutStart_mm'];top=p['rim_mm'];reach=p['reach_mm'];a=p['halfAngle_rad'];t=max(0,(z-s)/(top-s))
  angles=np.linspace(-math.pi,math.pi,8193);u=np.abs(angles)/a;bump=np.where(u<1,reach*t*np.maximum(0,1-u*u)**3,0);rr=r+bump
  return float(np.trapz(rr*rr/2,angles)) if hasattr(np,'trapz') else float(np.trapezoid(rr*rr/2,angles))
 inner=profile['inner']
 for (z0,r0),(z1,r1) in zip(inner,inner[1:]):
  if z<=z1:
   radius=r0+(r1-r0)*(z-z0)/(z1-z0);area=math.pi*radius*radius
   if typ=='piecewise-linear-with-polar-spout' and z>p['spoutStart_mm']:
    angles=np.linspace(-math.pi,math.pi,8193);u=np.abs(angles)/p['halfAngle_rad'];bump=np.where(u<1,p['reach_mm']*(z-p['spoutStart_mm'])/(p['rim_mm']-p['spoutStart_mm'])*np.maximum(0,1-u*u)**3,0)
    area=float(np.trapezoid((radius+bump)**2/2,angles))
   return area
 return 0


def inverse_volume(profile,target):
 lo=profile['inner'][0][0];hi=profile['inner'][-1][0]
 for _ in range(70):
  mid=(lo+hi)/2
  if exact_oracle(profile,mid)<target:lo=mid
  else:hi=mid
 return (lo+hi)/2


def verify_asset(folder):
 scene=json.loads((folder/'scene.json').read_text(encoding='utf-8'));manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
 assert scene['replacementReady'] is False
 results=[]
 for group,profile in scene['profiles'].items():
  lo=profile['inner'][0][0];hi=profile['inner'][-1][0];levels=np.linspace(lo,hi,101)
  vols=[exact_oracle(profile,float(z)) for z in levels]
  assert all(b>=a-1e-7 for a,b in zip(vols,vols[1:])),group
  numerical=simpson(lambda z:section_area_oracle(profile,z),lo,hi,1000)
  exact=vols[-1]; rel=abs(numerical-exact)/exact
  assert rel<2e-5,(group,rel)
  errors=[abs(inverse_volume(profile,v)-z) for z,v in zip(levels[1:],vols[1:])]
  assert max(errors)<.00001
  nominal=profile.get('nominalMl');mark=profile.get('markings',{}).get('nominalLineZ_mm')
  if nominal and mark is not None:
   assert abs(exact_oracle(profile,mark)/1000-nominal)<1e-7,(group,nominal,exact_oracle(profile,mark)/1000)
  mesh_rows=[m for m in scene['meshes'] if m['name']==group]
  assert len(mesh_rows)==1
  m=mesh_rows[0];mesh=trimesh.Trimesh(np.frombuffer(base64.b64decode(m['posB64']),dtype='<f4').reshape(-1,3),np.frombuffer(base64.b64decode(m['idxB64']),dtype='<u4').reshape(-1,3),process=False,validate=False)
  assert mesh.is_watertight,group
  # Independently inspect horizontal CAD section loops: annulus proves real cavity and thin wall.
  brep=cq.importers.importStep(str(folder/f'{group}.step')).val();samples=[]
  heights=[lo+(hi-lo)*q for q in [.1,.4,.7,.9]]
  analytic=profile['analytic']
  if analytic['type']=='hemisphere-cylinder':
   center=analytic['sphereCenterZ_mm'];rad=analytic['radius_mm']
   heights.extend([lo+rad*q for q in [.0001,.25,.5,.75,.9999]])
  for z,_ in profile['inner'][1:-1]:
   heights.extend([max(lo+.0001,z-.001),min(hi-.0001,z+.001)])
  for z in sorted(set(heights)):
   section=cq.Workplane(obj=brep).section(z)
   ws=section.vals();assert ws,(group,'missing section',z)
   wires=[]
   for sh in ws:wires.extend(sh.Wires())
   assert len(wires)>=2,(group,'no real inner+outer section',z,len(wires))
   areas=sorted(abs(cq.Face.makeFromWires(w).Area()) for w in wires)
   expected=section_area_oracle(profile,z);area_error=abs(areas[0]-expected)/expected
   assert area_error<.002,(group,z,area_error)
   samples.append({'z_mm':z,'innerArea_mm2':areas[0],'oracleArea_mm2':expected,'relativeError':area_error,'wireCount':len(wires)})
  results.append({'group':group,'capacityToRim_ml':exact/1000,'nominalMl':nominal,'volumeIntegralRelativeError':rel,'profileSamples':101,'maxInverseHeightError_mm':max(errors),'nominalLineError_ml':abs(exact_oracle(profile,mark)/1000-nominal) if nominal and mark is not None else None,'sections':samples,'realCavitySectionsPassed':True,'meshWatertight':True})
 # Recompute every exported BRep/mesh pair; do not trust build manifest assertions.
 metrology=[]
 for r in manifest['groups']:
  if 'brepValid' not in r:continue
  name=r['group'];cad=cq.importers.importStep(str(folder/f'{name}.step')).val()
  m=next(m for m in scene['meshes'] if m['name']==name)
  mesh=trimesh.Trimesh(np.frombuffer(base64.b64decode(m['posB64']),dtype='<f4').reshape(-1,3),np.frombuffer(base64.b64decode(m['idxB64']),dtype='<u4').reshape(-1,3),process=False,validate=False)
  assert cad.isValid() and mesh.is_watertight,name
  error=abs(abs(float(mesh.volume))-cad.Volume())/cad.Volume()*100
  assert error<=.2,(name,error)
  metrology.append({'group':name,'brepValidRechecked':True,'meshWatertightRechecked':True,'recomputedMeshVolumeError_pct':error})
 return {'asset':scene['asset'],'groups':len(manifest['groups']),'profiles':results,'allGroupMetrology':metrology,'replacementReady':False,'testsPassed':['oracle-101-level-self-consistency-only','oracle-independent-numerical-integral-selfcheck','oracle-inverse-selfcheck','nominal-mark-oracle-selfcheck','cad-section-inner-and-outer-wires-including-transitions','mesh-manifold-all-exported-brep-groups','recomputed-mesh-vs-brep-volume-all-groups'],'pending':['exported profile vs runtime volumeAt/levelFor at 101 levels','independent local wall thickness and chordal deviation','runtime Y-up/m conversion','stopper/socket/pouring interaction','tilted-volume and transfer conservation','visual material/marking screenshots','performance','review-production-signoff']}


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');parser.add_argument('--full',action='store_true');args=parser.parse_args()
 folders=[OUT/k for k in ['chem_beakers_owned','chem_test_tubes_owned','chem_graduated_cylinders_owned','chem_reagent_bottles_owned']]
 results=[verify_asset(f) for f in folders]
 receipt={'schema':'owned-cad-oracle-verification/1','result':'PASS_LOCAL_BREP_SECTIONS_AND_ORACLE_SELFCHECK_ONLY','replacementReady':False,'runtimeProfileVerified':False,'localThicknessVerified':False,'chordalDeviationVerified':False,'assets':results}
 if args.write:(OUT/'verification.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(receipt if args.full else {'result':receipt['result'],'assets':len(results),'profiles':sum(len(r['profiles']) for r in results),'allReplacementReady':False,'runtimeProfileVerified':False,'wroteReceipt':args.write}))
if __name__=='__main__':main()
