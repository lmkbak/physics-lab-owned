"""Independent C17/18/20/21 precision glassware and supports."""
import argparse
import json
import math
from pathlib import Path
import cadquery as cq
from build_first_batch import cylinder,lathe,round_box,add_part,add_marks,marking_mesh,export_asset,MATERIALS
from build_second_batch import profile,level
from build_fourth_batch import begin,part,ring,stop,stand
HERE=Path(__file__).resolve().parent
S=json.loads((HERE/'fifth-batch-specs.json').read_text(encoding='utf-8'))
MATERIALS.update({'blue-polymer':dict(baseColorFactor=[45,106,180,255],metallicFactor=0,roughnessFactor=.5),'green-polymer':dict(baseColorFactor=[63,147,99,255],metallicFactor=0,roughnessFactor=.5)})
INPUTS=['tools/owned-cad/build_fifth_batch.py','tools/owned-cad/fifth-batch-specs.json','tools/owned-cad/build_fourth_batch.py','tools/owned-cad/fourth-batch-specs.json','tools/owned-cad/build_second_batch.py','tools/owned-cad/second-batch-specs.json','tools/owned-cad/build_first_batch.py','tools/owned-cad/first-batch-specs.json']

def done(out,key,sc,rows,p,profiles=None):return export_asset(out,key,sc,rows,p,profiles or {},INPUTS)


def burette(out):
 key='chem_burette_owned';folder,sc,rows=begin(out,key);p=S['C17'];r=p['boreRadius'];ro=r+p['wall'];h=p['height'];v=p['valveZ'];tip=p['outletZ']
 outer=lathe([(1,tip),(ro,v-12),(ro,h),(0,h),(0,tip)])
 inner=lathe([(0,tip-.1),(.45,tip-.1),(r,v-12),(r,h+.1),(0,h+.1)])
 shell=outer.cut(inner)
 housing=ring(8,5.5,24,-12).rotate((0,0,0),(1,0,0),90).translate((0,0,v))
 shell=shell.union(housing)
 seat_bore=cq.Workplane(obj=cq.Solid.makeCylinder(5.5,26,cq.Vector(0,-13,v),cq.Vector(0,1,0)))
 shell=shell.cut(seat_bore)
 part(sc,rows,folder,'burette',shell)
 plug=lathe([(0,-13),(5.2,-13),(5.4,13),(0,13)]).rotate((0,0,0),(1,0,0),90).translate((0,0,v)).cut(cylinder(r,24,v-12))
 plug=plug.union(round_box(22,5,6,0,1).translate((0,-16,v)))
 part(sc,rows,folder,'stopcock',plug,'polymer')
 stand(sc,rows,folder,x=-25,height=p['standHeight'],ring_radius=7,ring_z=340)
 clamp=ring(8.4,ro+.3,28,325).cut(cq.Workplane('XY').box(12,16,32).translate((8,0,339)))
 part(sc,rows,folder,'clamp',clamp,'steel')
 liner=ring(6.3,ro+.1,24,327).cut(cq.Workplane('XY').box(12,16,28).translate((8,0,339)))
 part(sc,rows,folder,'liner',liner,'rubber')
 ticks=[];texts=[]
 for k in range(251):
  ml=k/10;z=p['zeroZ']-ml*1000/(math.pi*r*r);ticks.append((z,4.5 if k%10==0 else 2.4))
  if k%10==0:texts.append((int(ml),z,6,2))
 add_marks(sc,'burette_scale',marking_mesh(ro+.06,ticks,texts+[('mL',h-18,0,2.5)]),rows)
 return done(out,key,sc,rows,p,{'burette':profile([[v-12,r],[h,r]],25,{'direction':'top-down','incrementMl':.1,'zeroZ_mm':p['zeroZ'],'graduationBottomZ_mm':p['zeroZ']-25000/(math.pi*r*r)})})


def pipette(out):
 key='chem_volumetric_pipette_owned';folder,sc,rows=begin(out,key);p=S['C18'];r=p['shaftInnerRadius'];ro=p['shaftOuterRadius'];R=p['bulbInnerRadius'];bw=p['bulbWall'];b=p['bulbBottomZ'];t=p['bulbTopZ'];h=p['height'];tip=p['tipZ'];tc=p['tipConeEndZ']
 # Rechoose bulb barrel radius to reserve some nominal volume in the fine upper stem.
 z0=b;z1=b+12;z2=t-12;z3=t
 points=[[tip,p['tipInnerRadius']],[tc,r],[z0,r],[z1,R],[z2,R],[z3,r],[h,r]]
 from build_second_batch import capacity
 target=9.8;lo=r;hi=R
 for _ in range(60):
  rr=(lo+hi)/2;trial=[[tip,p['tipInnerRadius']],[tc,r],[z0,r],[z1,rr],[z2,rr],[z3,r],[h,r]]
  if capacity(trial,z3)<target:lo=rr
  else:hi=rr
 points=trial;R=rr;mark=level(points,10)
 outer=lathe([(p['tipOuterRadius'],tip),(ro,tc),(ro,z0),(R+bw,z1),(R+bw,z2),(ro,z3),(ro,h),(0,h),(0,tip)])
 inner=lathe([(0,tip-.1),(p['tipInnerRadius'],tip-.1),(r,tc),(r,z0),(R,z1),(R,z2),(r,z3),(r,h+.1),(0,h+.1)])
 part(sc,rows,folder,'pipette',outer.cut(inner))
 import trimesh
 vertices=[];faces=[]
 for i in range(192):
  a=2*math.pi*i/192
  for dz in [-.1,.1]:vertices.append([(ro+.05)*math.cos(a),(ro+.05)*math.sin(a),mark+dz])
 for i in range(192):
  j=(i+1)%192;faces.extend([[2*i,2*j,2*i+1],[2*i+1,2*j,2*j+1]])
 add_marks(sc,'single_capacity_line',trimesh.Trimesh(vertices,faces,process=False),rows)
 add_marks(sc,'pipette_label',marking_mesh(ro+.06,[],[('10',mark+3,0,2),('mL',mark+6,0,2)]),rows)
 # Hollow suction bulb and its stem are a continuous cavity, opening at the bottom.
 bulb=lathe([(0,0),(3.5,0),(3.5,12),(19,25),(19,50),(10,63),(0,65)]).cut(lathe([(0,-.1),(2,-.1),(2,13),(17,26),(17,49),(8,61),(0,63)]))
 part(sc,rows,folder,'suction_bulb',bulb,'rubber',(55,0,0))
 for i,x in enumerate([-20,20]):
  base=round_box(18,36,12,0,2).cut(cq.Workplane(obj=cq.Solid.makeCylinder(3,20,cq.Vector(-10,0,12),cq.Vector(1,0,0))))
  part(sc,rows,folder,f'cradle_{i}',base,'polymer',(x,-45,0))
 return done(out,key,sc,rows,p,{'pipette':profile(points,10,{'singleRing':True,'nominalLineZ_mm':mark})})


def condenser(out):
 key='chem_liebig_condenser_owned';folder,sc,rows=begin(out,key);p=S['C20'];z0=p['jacketBottomZ'];z1=p['jacketTopZ'];top=p['upperEndZ'];R=p['outerJacketRadius'];ri=p['innerJacketRadius'];pi=p['vapourBoreRadius'];po=p['innerPipeOuterRadius']
 # Outer cooling tube, inner vapour tube and sealed annular ends fused as one glass object.
 shell=ring(R,ri,z1-z0,z0).union(ring(po,pi,top,0)).union(ring(R,po,2,z0)).union(ring(R,po,2,z1-2))
 for z in p['portZ']:
  port=cq.Workplane(obj=cq.Solid.makeCylinder(p['waterPortOuterRadius'],25,cq.Vector(0,ri-1,z),cq.Vector(0,1,0)))
  bore=cq.Workplane(obj=cq.Solid.makeCylinder(p['waterPortInnerRadius'],28,cq.Vector(0,po+.8,z),cq.Vector(0,1,0)))
  shell=shell.union(port).cut(bore)
 part(sc,rows,folder,'condenser',shell)
 for i,z in enumerate(p['portZ']):
  sleeve=ring(6,p['waterPortOuterRadius']+.2,18).rotate((0,0,0),(1,0,0),-90).translate((0,22,z))
  part(sc,rows,folder,['inlet_sleeve','outlet_sleeve'][i],sleeve,['blue-polymer','green-polymer'][i])
 for i,z in enumerate([60,220]):
  seat=round_box(62,38,25,0,3).cut(cq.Workplane(obj=cq.Solid.makeCylinder(R+.4,42,cq.Vector(0,-21,28),cq.Vector(0,1,0))))
  part(sc,rows,folder,f'display_support_{i}',seat,'polymer',(50,0,z))
 return done(out,key,sc,rows,p)


def adapters(out):
 key='chem_distillation_adapters_owned';folder,sc,rows=begin(out,key);p=S['C21'];R=p['mainOuterRadius'];r=p['mainInnerRadius'];h=p['mainHeight'];side=p['sideZ'];L=p['sideLength']
 main=cylinder(R,h);side_outer=cq.Workplane(obj=cq.Solid.makeCylinder(R,L,cq.Vector(0,0,side),cq.Vector(1,0,0)))
 bore=cylinder(r,h+.2,-.1).union(cq.Workplane(obj=cq.Solid.makeCylinder(r,L+.1,cq.Vector(0,0,side),cq.Vector(1,0,0))))
 head=main.union(side_outer).cut(bore)
 part(sc,rows,folder,'distillation_head',head)
 adapter=ring(p['adapterOuterRadius'],p['adapterBoreRadius'],40).union(ring(12,p['adapterBoreRadius'],4,30))
 part(sc,rows,folder,'thermometer_adapter',adapter,offset=(70,0,0))
 part(sc,rows,folder,'locking_cap',ring(13,p['adapterBoreRadius']+.2,8,35),'polymer',(70,0,0))
 # Continuous two straight segments joined with a smooth 60-degree arc.
 angle=math.radians(p['receiverAngle_deg']);bendR=18;end=(bendR*(1-math.cos(angle)),35+bendR*math.sin(angle))
 wire=cq.Workplane('XZ').moveTo(0,0).lineTo(0,35).threePointArc((bendR*(1-math.cos(angle/2)),35+bendR*math.sin(angle/2)),end).lineTo(end[0]+60*math.sin(angle),end[1]+60*math.cos(angle)).wire()
 receiver=cq.Workplane('XY').circle(8).circle(6.5).sweep(wire,isFrenet=True)
 part(sc,rows,folder,'receiver_adapter',receiver,offset=(115,0,0))
 for i,x in enumerate([65,115]):part(sc,rows,folder,f'cone_seat_{i}',stop(12,16,bore=9),'polymer',(x,-45,0))
 return done(out,key,sc,rows,p)


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='+',default=['C17','C18','C20','C21']);parser.add_argument('--output',type=Path,default=HERE/'out');a=parser.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
 for key in a.only:
  r={'C17':burette,'C18':pipette,'C20':condenser,'C21':adapters}[key](out);print(json.dumps({'built':key,'groups':len(r['groups']),'replacementReady':False}),flush=True)
if __name__=='__main__':main()
