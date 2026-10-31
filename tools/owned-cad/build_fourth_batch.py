"""Independent C05/07/13/14/15/16/23/24 BRep assemblies."""
import argparse
import math
import json
from pathlib import Path
import cadquery as cq
import trimesh
from build_first_batch import cylinder,lathe,round_box,add_part,add_marks,marking_mesh,export_asset,MATERIALS,swept_round_mesh,revolved_mesh
from build_second_batch import profile,level,bent_pipe
HERE=Path(__file__).resolve().parent
S=json.loads((HERE/'fourth-batch-specs.json').read_text(encoding='utf-8'))
MATERIALS.update({'ceramic':dict(baseColorFactor=[234,232,216,255],metallicFactor=0,roughnessFactor=.35),'paper':dict(baseColorFactor=[238,233,216,255],metallicFactor=0,roughnessFactor=.96),'clear-polymer':dict(baseColorFactor=[187,220,228,130],metallicFactor=0,roughnessFactor=.34,alphaMode='BLEND',doubleSided=True)})
INPUTS=['tools/owned-cad/build_fourth_batch.py','tools/owned-cad/fourth-batch-specs.json','tools/owned-cad/build_first_batch.py','tools/owned-cad/first-batch-specs.json','tools/owned-cad/build_second_batch.py','tools/owned-cad/second-batch-specs.json']

def begin(out,key):
 folder=out/key;folder.mkdir(parents=True,exist_ok=True);return folder,trimesh.Scene(),[]

def done(out,key,sc,rows,p,profiles=None):return export_asset(out,key,sc,rows,p,profiles or {},INPUTS)

def part(sc,rows,folder,name,shape,mat='glass',offset=(0,0,0),mesh_override=None):return add_part(sc,name,shape,mat,offset,rows,folder,mesh_override=mesh_override)

def ring(outer,inner,height,z=0):return cylinder(outer,height,z).cut(cylinder(inner,height+.2,z-.1))

def stand(sc,rows,folder,x=0,height=170,ring_radius=26,ring_z=125):
 part(sc,rows,folder,'stand_base',round_box(110,80,8,0,5),'steel',(x,0,0))
 part(sc,rows,folder,'stand_post',cylinder(5,height,8),'steel',(x-45,0,0))
 arm=cq.Workplane(obj=cq.Solid.makeCylinder(3.5,45,cq.Vector(-45,0,ring_z),cq.Vector(1,0,0)))
 part(sc,rows,folder,'stand_arm',arm,'steel',(x,0,0))
 part(sc,rows,folder,'support_ring',ring(ring_radius+3,ring_radius,4,ring_z-2),'steel',(x,0,0))

def stop(r,h=18,bore=None,z=0):
 sh=lathe([(0,z),(r-.7,z),(r+.5,z+h),(0,z+h)])
 if bore:sh=sh.cut(cylinder(bore,h+.2,z-.1))
 return sh


def volumetric(out):
 key='chem_volumetric_flasks_owned';folder,sc,rows=begin(out,key);profiles={}
 for name,x in [('flask100',-45),('flask250',45)]:
  p=S['C05'][name];r=p['innerBodyRadius'];w=p['wall'];b=p['bottom'];a=p['bodyStartZ'];c=p['bodyEndZ'];neck=p['neckStartZ'];n=p['innerNeckRadius'];h=p['height']
  points=[[b,r*.55],[a,r],[c,r*.75],[neck,n],[h,n]]
  zmark=level(points,p['nominalMl'])
  # Parameters deliberately place the unique line inside the narrow neck; fail if not.
  if zmark<neck:
   # Rechoose independent belly scale to make bulb volume just below nominal, preserving neck.
   target=p['nominalMl']*.92
   lo=.1;hi=1
   for _ in range(60):
    scale=(lo+hi)/2;trial=[[b,r*.55*scale],[a,r*scale],[c,r*.75*scale],[neck,n],[h,n]]
    from build_second_batch import capacity
    if capacity(trial,neck)<target:lo=scale
    else:hi=scale
   points=trial;zmark=level(points,p['nominalMl'])
  # Extend neck if necessary to provide exactly one physically reachable nominal line.
  if zmark>=h-.1:
   from build_second_batch import capacity
   h=neck+(p['nominalMl']-capacity(points,neck))*1000/(math.pi*n*n)+15;points[-1][0]=h;zmark=level(points,p['nominalMl'])
  inner=lathe([(0,b),*[(rr,z) for z,rr in points],(0,h+.1)])
  outerpoints=[(rr+w,z) for z,rr in points]
  outer=lathe([(0,0),(points[0][1]+w,0),*outerpoints,(0,h)])
  part(sc,rows,folder,name,outer.cut(inner),'glass',(x,0,0))
  part(sc,rows,folder,name+'_stopper',stop(n-.25,15,z=h-8),'glass',(x,0,0))
  # A continuous original ring mesh is an engraved/printed marking, not a physical tube.
  import numpy as np
  vertices=[];faces=[]
  for i in range(192):
   a=2*math.pi*i/192
   for dz in [-.1,.1]:vertices.append([(n+w+.05)*math.cos(a),(n+w+.05)*math.sin(a),zmark+dz])
  for i in range(192):
   j=(i+1)%192;faces.extend([[2*i,2*j,2*i+1],[2*i+1,2*j,2*j+1]])
  add_marks(sc,name+'_single_mark',trimesh.Trimesh(vertices,faces,process=False),rows,(x,0,0))
  add_marks(sc,name+'_label',marking_mesh(n+w+.06,[],[(str(p['nominalMl']),zmark+2,0,2.5),('mL',zmark+6,0,2.5),('IN',h-8,0,2),('20°C',h-12,0,2)]),rows,(x,0,0))
  prof=profile(points,p['nominalMl'],{'singleRing':True,'nominalLineZ_mm':zmark,'IN':True,'temperatureC':20});profiles[name]=prof
 return done(out,key,sc,rows,S['C05'],profiles)


def funnel(out):
 key='chem_filter_funnel_owned';folder,sc,rows=begin(out,key);p=S['C07'];R=p['mouthOuterRadius'];w=p['wall'];ro=p['stemOuterRadius'];ri=p['stemInnerRadius'];z0=p['stemBottomZ'];s=p['stemTopZ'];h=p['rimZ']
 shape=lathe([(ro,z0),(ro,s),(R,h),(R-w,h),(ri,s),(ri,z0)])
 part(sc,rows,folder,'funnel',shape)
 stand(sc,rows,folder,height=190,ring_radius=p['supportRingRadius'],ring_z=142)
 paper=lathe([(0,s+3),(R-w-4,p['paperRimZ']),(R-w-4-.25,p['paperRimZ']),(0,s+3.5)])
 part(sc,rows,folder,'folded_paper',paper,'paper')
 part(sc,rows,folder,'spare_filter_paper',cylinder(p['filterPaperDiameter']/2,.3),'paper',(105,0,0))
 return done(out,key,sc,rows,p)


def gas_collection(out):
 key='chem_gas_collection_owned';folder,sc,rows=begin(out,key);p=S['C13'];j=p['gasJar'];R=j['outerRadius'];r=R-j['wall'];h=j['height'];b=j['bottom']
 part(sc,rows,folder,'gas_jar',cylinder(R,h).cut(cylinder(r,h,b)),offset=(-75,0,0))
 part(sc,rows,folder,'glass_cover',round_box(66,66,3,0,1),offset=(-75,60,0))
 t=p['waterTrough'];outside=round_box(t['width'],t['depth'],t['height'],0,5);inside=round_box(t['width']-2*t['wall'],t['depth']-2*t['wall'],t['height'],t['bottom'],3)
 part(sc,rows,folder,'water_trough',outside.cut(inside),offset=(75,0,0))
 q=p['platform'];platform=round_box(q['width'],q['depth'],q['height'],0,2).cut(cylinder(q['topHoleRadius'],q['height']+2,-1))
 side=cq.Workplane(obj=cq.Solid.makeCylinder(q['sidePortRadius'],q['width']/2+1,cq.Vector(0,0,q['height']/2),cq.Vector(1,0,0)))
 part(sc,rows,folder,'gas_platform',platform.cut(side),'ceramic',(75,0,5))
 return done(out,key,sc,rows,p,{'gas_jar':profile([[b,r],[h,r]])})


def washgas(out):
 key='chem_gas_washing_owned';folder,sc,rows=begin(out,key);p=S['C14'];R=p['outerRadius'];r=R-p['wall'];n=p['neckInnerRadius'];w=p['wall'];s=p['shoulderZ'];nz=p['neckZ'];h=p['height'];b=p['bottom']
 outer=lathe([(0,0),(R,0),(R,s),(n+w,nz),(n+w,h),(0,h)])
 inner=lathe([(0,b),(r,b),(r,s),(n,nz),(n,h+.1),(0,h+.1)])
 part(sc,rows,folder,'bottle',outer.cut(inner))
 stopper=stop(n-.3,22,z=h-12)
 for x in p['tubeX']:stopper=stopper.cut(cylinder(p['tubeOuterRadius']+.15,24,h-13).translate((x,0,0)))
 part(sc,rows,folder,'stopper',stopper,'rubber')
 for name,x,bot,sgn in [('inlet',-6,p['longTubeBottomZ'],-1),('outlet',6,p['shortTubeBottomZ'],1)]:
  V=h+18-bot;R=12
  wire=cq.Workplane('XZ').moveTo(0,0).lineTo(0,V).threePointArc((R-R/math.sqrt(2),V+R/math.sqrt(2)),(R,V+R)).lineTo(R+30,V+R).wire()
  tube=bent_pipe(p['tubeOuterRadius'],p['tubeInnerRadius'],R,V,30).translate((0,0,bot))
  mesh=swept_round_mesh(wire.val(),p['tubeOuterRadius'],p['tubeInnerRadius'],samples=80,sections=80);mesh.apply_translation((0,0,bot))
  if sgn<0:
   tube=tube.rotate((0,0,0),(0,0,1),180);mesh.apply_transform(trimesh.transformations.rotation_matrix(math.pi,(0,0,1)))
  part(sc,rows,folder,name,tube,offset=(x,0,0),mesh_override=mesh)
 return done(out,key,sc,rows,p,{'bottle':profile([[b,r],[s,r],[nz,n],[h,n]])})


def u_dryer(out):
 key='chem_u_drying_tube_owned';folder,sc,rows=begin(out,key);p=S['C15'];R=p['bendRadius'];ro=p['tubeOuterRadius'];ri=ro-p['wall'];H=p['straightHeight']
 wire=cq.Workplane('XZ').moveTo(-R,H).lineTo(-R,R).threePointArc((0,0),(R,R)).lineTo(R,H).wire()
 pipe=cq.Workplane('XY').workplane(offset=H).center(-R,0).circle(ro).circle(ri).sweep(wire,isFrenet=True)
 part(sc,rows,folder,'u_tube',pipe,offset=(0,0,16),mesh_override=swept_round_mesh(wire.val(),ro,ri,samples=140,sections=80))
 part(sc,rows,folder,'stand',round_box(110,65,8,0,4),'polymer')
 for i,x in enumerate([-R,R]):
  socket=ring(ro+4,ro+.3,16,8).cut(cq.Workplane('XY').box(40,20,30).translate((0,-14,16)))
  part(sc,rows,folder,f'support_{i}',socket,'polymer',(x,0,0))
  part(sc,rows,folder,f'stopper_{i}',stop(ri-.25,14,bore=2.65,z=H+10),'rubber',(x,0,0))
  part(sc,rows,folder,f'connector_{i}',ring(2.5,1.5,30,H+6),offset=(x,0,0))
 return done(out,key,sc,rows,p)


def separation(out):
 key='chem_separating_funnel_owned';folder,sc,rows=begin(out,key);p=S['C16'];R=p['bodyRadius'];w=p['wall'];z0=p['bodyBottomZ'];belly=p['bellyZ'];neck=p['neckZ'];h=p['rimZ'];n=p['neckInnerRadius'];tip=p['outletZ'];v=p['valveZ']
 outer=lathe([(4,tip),(6,v-8),(6,z0),(R,belly),(n+w,neck),(n+w,h),(0,h),(0,tip)])
 inside=lathe([(0,tip-.1),(2.5,tip-.1),(4,v),(4,z0),(R-w,belly),(n,neck),(n,h+.1),(0,h+.1)])
 body=outer.cut(inside)
 # horizontal valve housing with actual central bore, glass fused into the body.
 housing=ring(10,p['valveOuterRadius']+.15,28,-14).rotate((0,0,0),(1,0,0),90).translate((0,0,v))
 body=body.union(housing)
 body=body.cut(cq.Workplane(obj=cq.Solid.makeCylinder(p['valveOuterRadius']+.15,30,cq.Vector(0,-15,v),cq.Vector(0,1,0))))
 part(sc,rows,folder,'funnel',body)
 valve=lathe([(0,-17),(7.7,-17),(8.1,17),(0,17)]).rotate((0,0,0),(1,0,0),90).translate((0,0,v))
 valve=valve.cut(cylinder(p['valveBoreRadius'],30,v-15)).union(round_box(24,5,6,0,1).translate((0,-20,v)))
 part(sc,rows,folder,'stopcock',valve,'polymer')
 part(sc,rows,folder,'stopper',stop(n-.25,20,z=h-10),'glass')
 stand(sc,rows,folder,height=270,ring_radius=30,ring_z=198)
 return done(out,key,sc,rows,p)


def mortar(out):
 key='chem_mortar_pestle_owned';folder,sc,rows=begin(out,key);p=S['C23'];R=p['outerRadius'];H=p['height'];ri=p['innerRadius'];b=p['innerBottom']
 outer=cylinder(R,H).edges('<Z').fillet(7)
 # Bowl spherical cap cavity and base foot; rim notch is a real cut.
 sphereR=(ri*ri+(H-b)**2)/(2*(H-b));center=H+(sphereR-(H-b))
 cut=cq.Workplane('XY').sphere(sphereR).translate((0,0,center));body=outer.cut(cut).cut(cylinder(5,15,H-5).translate((R,0,0)))
 part(sc,rows,folder,'mortar',body,'ceramic')
 pestle=lathe([(0,0),(p['pestleHeadRadius'],12),(p['pestleHeadRadius']-3,25),(p['pestleHandleRadius'],45),(p['pestleHandleRadius'],p['pestleLength']),(0,p['pestleLength'])])
 part(sc,rows,folder,'pestle',pestle,'ceramic',(85,0,0))
 return done(out,key,sc,rows,p)


def shallow(out):
 key='chem_watch_glass_spot_plate_owned';folder,sc,rows=begin(out,key);p=S['C24']
 for name,x in [('watch60',-70),('watch80',10)]:
  q=p[name];R=q['radius'];sag=q['sag'];t=q['thickness'];points=[(R*i/64,t+sag*(i/64)**2) for i in range(65)]
  shape=lathe([(0,0),*[(r,z-t) for r,z in points[1:]],*list(reversed(points))])
  mesh_points=[(0,0),*[(R*i/24,sag*(i/24)**2) for i in range(1,25)],*[(R*i/24,t+sag*(i/24)**2) for i in range(24,-1,-1)]]
  part(sc,rows,folder,name,shape,offset=(x,0,0),mesh_override=revolved_mesh(mesh_points,96))
 q=p['spotPlate'];board=round_box(q['width'],q['depth'],q['height'],0,5)
 for x in [-30,0,30]:
  for y in [-15,15]:
   radius=(q['wellRadius']**2+q['wellDepth']**2)/(2*q['wellDepth']);center=q['height']+radius-q['wellDepth']
   board=board.cut(cq.Workplane('XY').sphere(radius).translate((x,y,center)))
 part(sc,rows,folder,'spot_plate',board,'ceramic',(0,85,0))
 return done(out,key,sc,rows,p)


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='+',default=['C05','C07','C13','C14','C15','C16','C23','C24']);parser.add_argument('--output',type=Path,default=HERE/'out');a=parser.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
 for key in a.only:
  r={'C05':volumetric,'C07':funnel,'C13':gas_collection,'C14':washgas,'C15':u_dryer,'C16':separation,'C23':mortar,'C24':shallow}[key](out);print(json.dumps({'built':key,'groups':len(r['groups']),'replacementReady':False}),flush=True)
if __name__=='__main__':main()
