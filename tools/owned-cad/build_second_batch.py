"""Independent second batch: C03/C06/C12/C19. No reference mesh/image reads."""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
import hashlib
import cadquery as cq
import trimesh
import numpy as np
from build_first_batch import cylinder,lathe,round_box,add_part,add_marks,marking_mesh,export_asset,MATERIALS,revolved_mesh,swept_round_mesh,spout_wire
HERE=Path(__file__).resolve().parent
S=json.loads((HERE/'second-batch-specs.json').read_text(encoding='utf-8'))
MATERIALS.update({'ceramic':dict(baseColorFactor=[231,232,218,255],metallicFactor=0,roughnessFactor=.3),'cork':dict(baseColorFactor=[151,110,59,255],metallicFactor=0,roughnessFactor=.95),'cotton':dict(baseColorFactor=[225,216,192,255],metallicFactor=0,roughnessFactor=.95)})
INPUTS=['tools/owned-cad/build_second_batch.py','tools/owned-cad/second-batch-specs.json','tools/owned-cad/build_first_batch.py','tools/owned-cad/first-batch-specs.json']

def profile(points,nominal=None,markings=None):
 return {'type':'piecewise-linear-radius','inner':points,'nominalMl':nominal,'analytic':{'type':'piecewise-linear-radius'},'markings':markings or {},'source':'independent-new-design','replacementReady':False}


def capacity(points,h):
 total=0
 for (a,r),(b,R) in zip(points,points[1:]):
  dz=max(0,min(h,b)-a)
  if dz<=0:continue
  rr=r+(R-r)*dz/(b-a);total+=math.pi*dz*(r*r+r*rr+rr*rr)/3
 return total/1000


def level(points,ml):
 a=points[0][0];b=points[-1][0]
 for _ in range(60):
  m=(a+b)/2
  if capacity(points,m)<ml:a=m
  else:b=m
 return (a+b)/2


def bent_pipe(ro,ri,R,vertical,horizontal):
 # A single continuous swept annulus; tangent line/arc joins.
 wire=cq.Workplane('XZ').moveTo(0,0).lineTo(0,vertical).threePointArc((R-R/math.sqrt(2),vertical+R/math.sqrt(2)),(R,vertical+R)).lineTo(R+horizontal,vertical+R).wire()
 return cq.Workplane('XY').circle(ro).circle(ri).sweep(wire,isFrenet=True)


def start(out,key):
 folder=out/key;folder.mkdir(parents=True,exist_ok=True);return folder,trimesh.Scene(),[]


def finish(out,key,scene,rows,params,profiles):
 return export_asset(out,key,scene,rows,params,profiles,INPUTS)


def conical(out):
 key='chem_conical_flask_owned';folder,scene,rows=start(out,key);p=S['C03']['flask'];h=p['height'];b=p['bottom'];ri=p['innerBaseRadius'];n=p['innerNeckRadius'];w=p['wall'];s=p['shoulderStart'];neck=p['neckStart']
 outer=lathe([(0,0),(p['outerBaseRadius']-.5,0),(p['outerBaseRadius'],.5),(p['outerBaseRadius'],s),(n+w,neck),(n+w,h),(n+w+.8,h),(n+w+.8,h+1),(0,h+1)])
 points=[[b,ri],[s,ri],[neck,n],[h+1,n]]
 cavity=lathe([(0,b),(ri,b),(ri,s),(n,neck),(n,h+1.1),(0,h+1.1)])
 body=outer.cut(cavity);add_part(scene,'flask',body,'glass',report=rows,out=folder)
 for name,bored,x in [('stopper',False,65),('bored_stopper',True,100)]:
  q=S['C03']['boredStopper' if bored else 'solidStopper'];r0=q['bottomRadius'];r1=q['topRadius'];H=q['height']
  shape=lathe([(0,0),(r0,0),(r1,H),(0,H)])
  if bored:shape=shape.cut(cylinder(q['boreDiameter']/2,H+2,-1))
  add_part(scene,name,shape,'rubber',(x,0,0),rows,folder)
 q=S['C03']['bentTube'];pipe=bent_pipe(q['outerRadius'],q['innerRadius'],q['bendRadius'],q['verticalLength'],q['horizontalLength'])
 add_part(scene,'bent_tube',pipe,'glass',(100,0,5),rows,folder)
 markings=[];ticks=[]
 for v in [50,100,150,200,250]:
  z=level(points,v);ticks.append((z,10));markings.append((v,z,14,3))
 marks=marking_mesh(ri+w+.06,ticks,markings)
 # Each original numeral vertex is conformed to the independently defined sloped outer wall.
 for v in marks.vertices:
  z=v[2];target=p['outerBaseRadius'] if z<=s else (p['outerBaseRadius']+(n+w-p['outerBaseRadius'])*(z-s)/(neck-s) if z<neck else n+w)
  old=math.hypot(v[0],v[1]);v[:2]*=(target+.07)/old
 add_marks(scene,'flask_scale',marks,rows)
 return finish(out,key,scene,rows,S['C03'],{'flask':profile(points,250,{'estimatedOnly':True,'nominalLineZ_mm':level(points,250)})})


def dropper_bottles(out):
 key='chem_droppers_owned';folder,scene,rows=start(out,key);p=S['C06']['body'];r=p['outerRadius'];ri=r-p['wall'];n=p['innerNeckRadius'];w=p['wall'];b=p['bottom'];s=p['shoulderStart'];neck=p['neckStart'];h=p['height'];profiles={}
 for prefix,mat,x in [('clear','glass',-32),('amber','amber',32)]:
  outer=lathe([(0,0),(r,0),(r,s),(n+w,neck),(n+w,h),(0,h)])
  cavity=lathe([(0,b),(ri,b),(ri,s),(n,neck),(n,h+.1),(0,h+.1)])
  add_part(scene,prefix+'_bottle',outer.cut(cavity),mat,(x,0,0),rows,folder)
  q=S['C06']['dropper'];z=q['tipZ'];zc=q['coneEndZ'];top=q['topZ'];ro=q['shaftOuterRadius'];rr=q['shaftInnerRadius']
  tube=lathe([(q['tipOuterRadius'],z),(ro,zc),(ro,top),(rr,top),(rr,zc),(q['tipInnerRadius'],z)])
  add_part(scene,prefix+'_tube',tube,mat,(x,0,0),rows,folder)
  q=S['C06']['cap'];cap=cylinder(q['outerRadius'],q['height'],q['bottomZ']).cut(cylinder(q['internalRadius'],q['height']-2,q['bottomZ']-.1)).cut(cylinder(q['topBoreRadius'],q['height']+2,q['bottomZ']-1))
  # Knurl geometry on cap without reusing any existing part.
  for i in range(24):
   a=2*math.pi*i/24
   cap=cap.cut(cylinder(.45,q['height']+1,q['bottomZ']-.5).translate((q['outerRadius']*math.cos(a),q['outerRadius']*math.sin(a),0)))
  add_part(scene,prefix+'_cap',cap,'polymer',(x,0,0),rows,folder)
  q=S['C06']['bulb'];z=q['bottomZ'];zt=q['topZ'];R=q['outerRadius'];inner=q['innerRadius']
  outer=lathe([(0,z),(q['neckOuterRadius'],z),(q['neckOuterRadius'],z+3),(R,z+7),(R,zt-5),(4,zt),(0,zt)])
  inside=lathe([(0,z-.1),(q['neckInnerRadius'],z-.1),(q['neckInnerRadius'],z+4),(inner,z+8),(inner,zt-6),(2.5,zt-2),(0,zt-2)])
  add_part(scene,prefix+'_bulb',outer.cut(inside),'rubber',(x,0,0),rows,folder)
  profiles[prefix+'_bottle']=profile([[b,ri],[s,ri],[neck,n],[h,n]])
 return finish(out,key,scene,rows,S['C06'],profiles)


def porcelain(out):
 key='chem_porcelain_heating_owned';folder,scene,rows=start(out,key);p=S['C12']['dish'];H=p['height'];ri=p['innerRadiusAtRim'];rb=p['innerBaseRadius'];b=p['bottom']
 # Dish has a curved interior radius defined independently by quadratic radial growth.
 points=[[b+(H-b)*i/48,rb+(ri-rb)*math.sqrt(i/48)] for i in range(49)]
 outside=[(r+2.2,z) for z,r in points]
 outer=lathe([(0,0),(rb+2.2,0),*outside,(0,H)])
 inside=lathe([(0,b),*[(r,z) for z,r in points],(0,H)])
 # Replace the upper 5mm by a real polar pouring lip with continuous open cavity.
 spout_start=H-5;rs=next(r for z,r in points if z>=spout_start)
 rs=rb+(ri-rb)*math.sqrt((spout_start-b)/(H-b))
 lowerpoints=[(r,z) for z,r in points if z<spout_start]+[(rs,spout_start)]
 lower=lathe([(0,0),(rb+2.2,0),*[(r+2.2,z) for r,z in lowerpoints],(0,spout_start)])
 upper=cq.Workplane(obj=cq.Solid.makeLoft([spout_wire(rs+2.2,spout_start,0,math.radians(24)),spout_wire(ri+2.2,H,p['spoutReach'],math.radians(24))]))
 cavity_lower=lathe([(0,b),*lowerpoints,(0,spout_start)])
 cavity_upper=cq.Workplane(obj=cq.Solid.makeLoft([spout_wire(rs,spout_start,0,math.radians(24)),spout_wire(ri,H+.01,p['spoutReach'],math.radians(24))]))
 dish=lower.union(upper).cut(cavity_lower.union(cavity_upper))
 points=[q for q in points if q[0]<spout_start]+[[spout_start,rs],[H,ri]]
 add_part(scene,'dish',dish,'ceramic',(-55,0,0),rows,folder)
 p=S['C12']['crucible'];H=p['height'];w=p['wall'];b=p['bottom'];r0=p['outerBaseRadius'];r1=p['outerRimRadius'];foot=p['footHeight']
 outer=lathe([(0,foot),(r0,foot),(r1,H),(0,H)])
 points_c=[[b+foot,r0-w],[H,r1-w]]
 cavity=lathe([(0,b+foot),(r0-w,b+foot),(r1-w,H+.1),(0,H+.1)])
 crucible=outer.cut(cavity).union(cylinder(p['footOuterRadius'],foot).cut(cylinder(p['footInnerRadius'],foot)))
 add_part(scene,'crucible',crucible,'ceramic',(20,0,0),rows,folder)
 q=S['C12']['lid'];lid=cylinder(q['radius'],q['thickness']).union(cylinder(q['handleRadius'],q['handleHeight'],q['thickness']))
 add_part(scene,'crucible_lid',lid,'ceramic',(80,0,0),rows,folder)
 # Tongs: two independently pivotable steel arms, handle rings, shaped jaws, cross pivot.
 q=S['C12']['tongs'];pivot=q['pivotZ']
 for side in [-1,1]:
  path=cq.Workplane('XZ').spline([(side*16,4),(side*11,35),(-side*8,pivot),(-side*18,165)]).wire()
  # Forged flat tong arm: closed independently drawn outline, true pivot hole.
  a=[(side*18,4),(side*14,35),(-side*5,115),(-side*15,165),(-side*21,165),(-side*11,115),(side*8,35),(side*13,4)]
  arm=cq.Workplane('XZ').polyline(a).close().extrude(2,both=True).cut(cylinder(3.2,8).rotate((0,0,0),(1,0,0),90).translate((0,4,115)))
  ring=cq.Workplane('XZ').center(-side*18,174).circle(17).circle(14).extrude(2,both=True)
  # Separate handle ring remains same semantic arm, avoiding tangent unions.
  add_part(scene,f'tongs_arm_{side}',arm,'steel',(125,0,0),rows,folder)
  add_part(scene,f'tongs_ring_{side}',ring,'steel',(125,0,0),rows,folder)
 pivot=cylinder(4,10).rotate((0,0,0),(1,0,0),90).translate((0,5,q['pivotZ']))
 add_part(scene,'tongs_pivot',pivot,'steel',(125,0,0),rows,folder)
 dish_profile=profile(points);dish_profile['analytic']={'type':'piecewise-linear-with-polar-spout','spoutStart_mm':spout_start,'rim_mm':H,'reach_mm':S['C12']['dish']['spoutReach'],'halfAngle_rad':math.radians(24)}
 return finish(out,key,scene,rows,S['C12'],{'dish':dish_profile,'crucible':profile(points_c)})


def round_flasks(out):
 key='chem_round_flasks_owned';folder,scene,rows=start(out,key);profiles={}
 for name,x in [('flask250',-60),('flask500',60)]:
  p=S['C19'][name];R=p['innerSphereRadius'];w=p['wall'];zc=p['sphereCenterZ'];n=p['innerNeckRadius'];join=zc+math.sqrt(R*R-n*n);top=join+p['neckHeight'];Ro=R+w;no=n+w;join_o=zc+math.sqrt(Ro*Ro-no*no)
  theta=math.asin(no/Ro)
  outer=cq.Workplane('XZ').moveTo(0,zc-Ro).threePointArc((Ro,zc),(no,join_o)).lineTo(no,top).lineTo(0,top).close().revolve(360,(0,0),(0,1))
  inner=cq.Workplane('XZ').moveTo(0,zc-R).threePointArc((R,zc),(n,join)).lineTo(n,top+.1).lineTo(0,top+.1).close().revolve(360,(0,0),(0,1))
  add_part(scene,name,outer.cut(inner),'glass',(x,0,15),rows,folder)
  cradle=cylinder(32 if name=='flask250' else 39,25).cut(cq.Workplane('XY').sphere(Ro+.4).translate((0,0,zc+15)))
  add_part(scene,'cradle'+name.removeprefix('flask'),cradle,'cork',(x,0,0),rows,folder)
  sample=[]
  for i in range(129):
   z=zc-R+(join-(zc-R))*i/128;sample.append([z,math.sqrt(max(0,R*R-(z-zc)**2))])
  sample.append([top,n]);prof=profile(sample,p['nominalMl']);prof['type']='analytic-radius-segments';prof['segments']=[{'kind':'sphere','z0':zc-R,'z1':join,'centerZ':zc,'radius':R},{'kind':'linear','z0':join,'z1':top,'r0':n,'r1':n}];prof['analytic']={'type':'sphere-cylinder','radius_mm':R,'sphereCenterZ_mm':zc,'sphereJoinZ_mm':join,'neckRadius_mm':n,'rim_mm':top};profiles[name]=prof
 return finish(out,key,scene,rows,S['C19'],profiles)


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='+',default=['C03','C06','C12','C19']);parser.add_argument('--output',type=Path,default=HERE/'out');a=parser.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
 assets=[]
 for key in a.only:
  result={'C03':conical,'C06':dropper_bottles,'C12':porcelain,'C19':round_flasks}[key](out);assets.append(result['asset']);print(json.dumps({'built':key,'groups':len(result['groups']),'replacementReady':False}),flush=True)
 (out/'second-build-receipt.json').write_text(json.dumps({'assets':assets,'replacementReady':False,'inputs':{p:hashlib.sha256((HERE.parent.parent/p).read_bytes()).hexdigest() for p in INPUTS}},indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
