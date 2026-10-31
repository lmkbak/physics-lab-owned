"""Original remaining mechanical and multi-chamber apparatus designs."""
import math
import cadquery as cq
from families import cyl,box,tube,cup,cone,fuse,V
from glassware import sphere,rect_vessel,line_tube
from mechanisms import rod

def make(n,s):
 out=[]
 def put(g,sh,m='steel',off=None):out.append((g,sh,m,off or [0,0,0]))
 if n=='C49':
  put('base',box(180,115,12));put('rod',cyl(5,500,12,55));put('boss',box(30,20,30).cut(cyl(5.2,32,-1,8)),'steel',[47,0,230]);ring=tube(35,31,5).fuse(rod((31,0,2.5),(80,0,2.5),3));put('ring',ring,off=[-20,0,220]);put('clamp',box(24,16,10).cut(cyl(5.3,12,-1)).fuse(rod((10,0,5),(55,0,5),3)),off=[10,0,310]);put('jawA',box(40,9,7).cut(cyl(12,9,-1,18)),'steel',[-20,12,310]);put('jawB',box(40,9,7).cut(cyl(12,9,-1,18)),'steel',[-20,-12,310]);put('padA',tube(13,12,6),'rubber',[-2,12,311]);put('padB',tube(13,12,6),'rubber',[-2,-12,311])
 elif n=='C50':
  put('base',box(150,125,8));put('top',box(150,125,6),off=[0,0,110]);
  for side,y in [('front',-45),('rear',45)]:
   for label,a,b in [('A',(-58,y,12),(58,y,104)),('B',(58,y,12),(-58,y,104))]:
    beam=box(148,8,5).rotate(V(),V(0,1,0),-38 if label=='A'else 38).translate(V(0,y,58));put(side+label,beam)
  put('screw',rod((-70,0,58),(80,0,58),3).fuse(cyl(10,5).rotate(V(),V(0,1,0),90).translate(V(80,0,58))))
  for y in [-45,45]:put('pivot',rod((0,y-6,58),(0,y+6,58),3),'steel')
 elif n=='C52':
  put('base',box(220,100,16),'insulator');put('pillar',cone(22,13,115,16));beam=box(220,12,10).cut(cq.Solid.makeCylinder(3.2,14,V(0,-7,5),V(0,1,0)));put('beam',beam,off=[0,0,142]);put('pointer',box(1.5,2,85),'steel',[0,-8,55]);put('scale',box(70,2,35),'paper',[0,-10,50])
  for key,x in [('left',-95),('right',95)]:put(key+'pan',cup(38,36,5,1.5),'steel',[x,0,134]);put(key+'support',cyl(3,16),'steel',[x,0,118])
 elif n=='C53':
  base=box(170,90,24)
  for x,r in [(-60,16),(-20,13),(15,10),(45,8),(65,6)]:base=base.cut(cyl(r+.5,22,3,x))
  put('box',base,'wood');put('lid',box(170,90,6),'wood',[0,0,30])
  for i,(x,r,h)in enumerate([(-60,15,20),(-20,12,17),(15,9,14),(45,7,12),(65,5,10)]):put('weight'+str(i),cyl(r,h).fuse(cyl(max(2,r*.3),5,h)),'steel',[x,0,4])
  put('tweezers',box(3,55,1).fuse(box(3,55,1,x=5)).fuse(box(8,3,1,y=-26)),'steel',[0,28,5])
 elif n=='C56':
  for i in range(2):
   path=cq.Workplane('XZ').moveTo(-65,0).spline([(-35,30),(0,45),(35,30),(65,0)]).wire().val();cable=cq.Workplane('YZ',origin=(-65,0,0)).circle(2.4).sweep(path).val();put('cable'+str(i),cable,'rubber',[0,i*25,0])
   for j,x in enumerate([-65,65]):put(f'jaw{i}{j}',box(22,8,4).cut(box(12,3,3,z=2)),'steel',[x,i*25,0]);put(f'shell{i}{j}',box(24,10,5).cut(box(22,8,5,z=-1)),'rubber',[x,i*25,5])
 elif n=='C59':
  outer=sphere(30,(0,0,75)).fuse(tube(10,8.5,55,80)).fuse(tube(5,3,48));void=sphere(28.3,(0,0,75)).fuse(cyl(8.5,70,75)).fuse(cyl(3,80,-1));body=outer.cut(void)
  pressure=line_tube((9,0,126),(36,0,126),3,1.7).fuse(line_tube((36,0,126),(36,0,25),3,1.7)).fuse(line_tube((36,0,25),(5,0,25),3,1.7));put('body',body.fuse(pressure),'glass');put('stopper',cone(8.3,9.5,18),'glass',[0,0,138]);valve=cq.Solid.makeCone(5.5,6.4,20,V(-10,0,24),V(1,0,0)).cut(cyl(1.8,14,17));put('valve',valve,'glass');put('support',box(75,45,7).fuse(cyl(4,160,7,-28)),'steel')
 elif n=='C63':
  # Three separable communicating chambers with independently hollow connecting columns.
  lower=cup(45,42.5,55,3).fuse(tube(15,12.5,45,55));middle=sphere(43,(0,0,105)).cut(sphere(40.5,(0,0,105))).cut(cyl(12.5,100,55)).fuse(tube(15,12.5,35,125));upper=sphere(38,(0,0,190)).cut(sphere(35.5,(0,0,190))).cut(cyl(10,100,140)).fuse(tube(12.5,10,35,200));put('lower',lower,'glass');put('middle',middle,'glass');put('upper',upper,'glass');put('stem',tube(7,5,155,15),'glass');put('gasout',line_tube((38,0,105),(70,0,105),5,3),'glass');put('stopper',cone(10,12,18).cut(cyl(5,20,-1)),'rubber',[0,0,237]);put('stand',cyl(55,8),'insulator',[0,0,-8])
 elif n=='C65':
  put('base',box(100,30,12).cut(cyl(5.2,14,-1)));
  for key,x in [('left',-48),('right',48)]:
   jaw=box(28,16,12).cut(cyl(7,14,-1));jaw=jaw.cut(box(5,30,14,x=12,z=-1));put(key,jaw,off=[x,0,0]);put(key+'pad',tube(7,5.8,10),'rubber',[x,0,1]);put(key+'screw',rod((x-16,-15,6),(x+16,-15,6),2.4).fuse(cyl(6,5).rotate(V(),V(0,1,0),90).translate(V(x+17,-15,6))))
 elif n=='C66':
  outer=cyl(18,220).fuse(tube(6,4,35,-35)).fuse(tube(10,8,35,220));void=cyl(16.3,222,-1).fuse(cyl(4,40,-36)).fuse(cyl(8,38,219));sh=outer.cut(void)
  for z in range(15,215,20):
   for a in [0,math.pi/2,math.pi,3*math.pi/2]:
    start=(16.6*math.cos(a),16.6*math.sin(a),z);tip=(4*math.cos(a),4*math.sin(a),z+4);sh=sh.fuse(rod(start,tip,1.4))
  put('column',sh,'glass');put('top',cone(7.8,9.2,16).cut(cyl(3,18,-1)),'rubber',[0,0,258]);put('bottom',tube(5.3,3.2,30),'rubber',[0,0,-50]);put('stand',box(70,50,8).fuse(cyl(4,200,8,26)),'steel',[0,0,-60])
 elif n=='C72':
  put('base',box(180,100,8),'insulator');put('cup',cup(40,38.5,90,1.5),'glass',[-40,0,10]);probe=box(30,15,12).fuse(cyl(2,55,-55,-8)).fuse(cyl(2,55,-55,8));put('probe',probe,'steel',[-40,0,93]);put('wire',line_tube((-40,0,100),(45,0,80),2.5,1),'rubber');put('lower',rect_vessel(80,65,35,3),'insulator',[55,0,10]);put('panel',box(80,65,3).cut(box(32,18,5,z=-1)),'insulator',[55,0,48]);put('board',box(64,46,1.6).fuse(cyl(3,5,x=18)),'green',[55,0,28])
 return out
NUMBERS=['C49','C50','C52','C53','C56','C59','C63','C65','C66','C72']
BUILDERS={n:(lambda s,n=n:make(n,s))for n in NUMBERS}
