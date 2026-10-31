"""Independent articulated instruments and double-path chemistry glassware."""
import math
import cadquery as cq
from families import cyl,box,tube,cup,fuse,cone,V
from glassware import sphere,rect_vessel,line_tube

def rod(a,b,r):
 a,b=V(*a),V(*b);d=b-a;return cq.Solid.makeCylinder(r,d.Length,a,d.normalized())
def tick(z,width=3):return box(width,.25,.25,y=-3,z=z)
def build(n,s):
 out=[]
 def put(g,sh,m='steel',off=None):out.append((g,sh,m,off or [0,0,0]))
 if n=='C25':
  body=tube(3.2,.35,211,13).fuse(sphere(4.6,(0,0,8)).cut(sphere(3.4,(0,0,8)))).fuse(tube(1.6,.35,7,8));put('thermometer',body,'glass');put('column',cyl(.27,65,10),'ink');
  for i in range(101):put('scale',tick(24+i*1.7,4 if i%10==0 else 2.5),'ink')
  put('sleeve',cup(6,4.9,224,2),'insulator',[24,0,0]);put('cap',cup(6.8,6.1,10,1.5),'insulator',[24,0,228])
 elif n=='C27':
  arm=box(10,12,170).cut(cq.Solid.makeCylinder(8.3,14,V(-7,0,146),V(1,0,0)));put('clipA',arm,'wood',[-7,0,0]);put('clipB',arm.rotate(V(),V(0,1,0),-3),'wood',[7,0,0]);put('spring',cq.Solid.makeTorus(6,1,V(0,0,70),V(1,0,0)),'steel')
  put('brush',cyl(1,180).fuse(cq.Solid.makeTorus(4,1,V(0,0,-4),V(0,1,0))),'steel',[45,0,0])
  # radial bristles are finite thin solids; each brush group stays one functional assembly.
  for z in range(120,175,5):
   for j in range(8):
    a=j*math.pi/4;put('brush',rod((0,0,z),(8*math.cos(a),8*math.sin(a),z+1),.22),'insulator',[45,0,0])
 elif n=='C31':
  lower=cup(90,86.5,100,4).fuse(tube(87,80,5,75));put('bowl',lower,'glass');plate=cyl(78,5,72)
  for x in [-50,-25,0,25,50]:
   for y in [-50,-25,0,25,50]:
    if x*x+y*y<70**2:plate=plate.cut(cyl(5,7,71,x,y))
  put('plate',plate,'ceramic');lid=sphere(92,(0,0,100)).cut(sphere(88.5,(0,0,100))).intersect(box(200,200,84,z=100)).fuse(cyl(9,14,182));put('lid',lid,'glass',[0,0,15])
 elif n in ['C34','C69']:
  ri=10 if n=='C34'else 8;volume=50000 if n=='C34'else 10000;h=volume/(math.pi*ri*ri);body=cup(ri+1.4,ri,h+8,3).cut(cyl(1.5,5,-1)).fuse(tube(3,1.5,12,-12));put('barrel',body,'glass');put('seal',cyl(ri-.15,5),'rubber',[0,0,3+h*.6]);put('plunger',box(3,ri*1.4,h).fuse(box(ri*1.4,3,h)).fuse(cyl(ri+4,3,h)),'insulator',[0,0,8+h*.6])
  for i in range(1,51 if n=='C34'else 11):put('scale',box(4,.3,.3,y=-ri-1.5,z=3+i*(1000/(math.pi*ri*ri))),'ink')
  if n=='C69':put('cap',cup(4.2,3.1,10,1.2),'insulator',[30,0,0]);put('microcup',cup(10,8.8,18,1.2),'glass',[48,0,0]);put('stand',box(80,40,8).cut(cyl(12,6,3)),'wood',[0,45,0])
 elif n=='C36':
  frame=box(46,24,50).cut(box(36,26,38,z=6)).cut(cyl(3.1,12,40));put('frame',frame);helix=cq.Wire.makeHelix(2,35,2.9);profile=cq.Workplane('XZ').center(2.9,0).circle(.5);thread=profile.sweep(helix,isFrenet=True).val();screw=cyl(2.6,35).fuse(thread).fuse(cyl(8,5,35));put('screw',screw,off=[0,0,24]);put('press',box(30,18,5),'steel',[0,0,12]);put('hose',tube(4,2.5,65).rotate(V(),V(1,0,0),90),'rubber',[0,30,14])
 elif n=='C42':
  base=cyl(35,8).fuse(cyl(10,25,8)).cut(cyl(.8,35,-1));put('base',base);put('inlet',line_tube((0,0,20),(38,0,20),4,2));mix=tube(8,6.5,135,15)
  for x in [-1,1]:mix=mix.cut(cq.Solid.makeCylinder(3.2,18,V(x*9,0,30),V(-x,0,0)))
  put('mix',mix);sleeve=tube(9.5,8.2,24,20).cut(cq.Solid.makeCylinder(3.3,22,V(-11,0,30),V(1,0,0)));put('air',sleeve)
 elif n in ['C43','C44','C55','C57','C58']:
  # Structural cases with removable panel and separate component groups; no simulated readings.
  sizes={'C43':(160,140,55),'C44':(140,130,50),'C55':(180,110,125),'C57':(138,210,44),'C58':(140,105,50)};w,d,h=sizes[n];labels=s['groupKeys'];shell=rect_vessel(w,d,h,3)
  put(labels[0],box(w,d,5),'insulator');put(labels[1],shell,'insulator',[0,0,8])
  for i,g in enumerate(labels[2:]):
   if n=='C43'and i==0:sh=cyl(45,3,h+15).fuse(cyl(5,20,h-5))
   elif n=='C44'and i==0:sh=cyl(16,30).fuse(cyl(3,18,30))
   elif n=='C44'and i==1:sh=box(65,12,5).fuse(box(14,14,8,x=-22,z=5)).fuse(box(14,14,8,x=22,z=5))
   elif n=='C44'and i==2:sh=cyl(4,26).fuse(sphere(4,(0,0,0))).fuse(sphere(4,(0,0,26)))
   elif n=='C58'and i==0:sh=sphere(6).fuse(cyl(6,120)).fuse(cyl(8,25,120))
   else:sh=box(max(12,w/(len(labels)+1)),20,5).fuse(cyl(3,8,5))
   put(g,sh,'steel'if i%2==0 else 'insulator',[(i%3-1)*w*.25,(i//3)*25,12])
 elif n=='C45':
  put('base',box(180,140,6),'insulator');put('outer',rect_vessel(180,140,105,3),'steel');put('liner',rect_vessel(160,120,90,2),'steel',[0,0,8]);put('lid',box(182,142,3).cut(cyl(51,5,-1)),'steel',[0,0,107])
  for i,r in enumerate([50,42,34,26]):put('rings',tube(r,r-8,2),'steel',[0,0,110+i*2.2])
 elif n in ['C46','C64']:
  ri=4;h=25000/(math.pi*ri*ri)if n=='C46'else 50000/(math.pi*ri*ri);put('tube',tube(5.3,ri,h),'glass');put('stopcock',cyl(5,24).rotate(V(),V(0,1,0),90).cut(cyl(1.7,26,-1)),'glass',[0,0,-15]);put('tip',cone(4,1.5,35).cut(cone(2.5,.7,35)),'glass',[0,0,-50]);put('stand',box(65,45,6).fuse(cyl(4,h*.7,6,25)),'steel',[0,0,-60])
  for i in range(1,251 if n=='C46'else 51):put('scale',box(4,.25,.18,y=-5.4,z=h-i*((100 if n=='C46'else 1000)/(math.pi*ri*ri))),'ink')
  if n=='C46':put('hose',tube(3.8,2.5,30),'rubber',[0,0,-30]);put('bead',sphere(2.55),'glass',[0,0,-15])
  else:put('bottle',cup(25,23.5,110,2),'glass',[80,0,-20]);put('hose',line_tube((0,0,-50),(80,0,-20),4,2.5),'rubber')
 elif n=='C47':
  inner=cyl(7,230,-20);void=cyl(4.5,232,-21)
  for z in [25,70,115,160]:inner=inner.fuse(sphere(14,(0,0,z)));void=void.fuse(sphere(12,(0,0,z)))
  shell=tube(20,18.5,190).fuse(tube(18.5,7,2)).fuse(tube(18.5,7,2,188));shell=shell.fuse(inner)
  # Separate coolant-only side necks; bores stop at jacket and never cross central vapor tube.
  for z in [15,175]:shell=shell.fuse(line_tube((18,0,z),(42,0,z),4.5,3)).cut(rod((17,0,z),(44,0,z),3))
  put('body',shell.cut(void),'glass');put('lower',tube(5.5,4.6,12).rotate(V(),V(0,1,0),90),'blue',[28,0,15]);put('upper',tube(5.5,4.6,12).rotate(V(),V(0,1,0),90),'green',[28,0,175]);put('stand',box(70,45,6).fuse(cyl(4,150,6,27)),'steel',[0,0,-30])
 return out
NUMBERS=['C25','C27','C31','C34','C36','C42','C43','C44','C45','C46','C47','C55','C57','C58','C64','C69']
BUILDERS={n:(lambda s,n=n:build(n,s))for n in NUMBERS}
