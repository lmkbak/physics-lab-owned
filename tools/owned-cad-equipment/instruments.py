"""Own component-resolved educational instruments, unpowered/static demonstrators."""
import math
import cadquery as cq
from families import cyl,box,tube,cup,fuse,V
from glassware import sphere,rect_vessel,line_tube
from mechanisms import rod

def board(w,d):return box(w,d,1.6)
def winding(x,ro,ri,height):
 core=tube(ro,ri,height).rotate(V(),V(0,1,0),90).translate(V(x,0,0))
 return core

def instrument(n,s):
 out=[]
 def put(g,shape,mat='steel',off=None):out.append((g,shape,mat,off or [0,0,0]))
 if n=='C55':
  w,d,h=180,110,125;case=rect_vessel(w,d,h,2.5).cut(box(182,8,100,y=-52,z=10))
  for x in range(-70,75,14):case=case.cut(box(5,112,36,x=x,z=68))
  handle=box(70,14,18,z=125).cut(box(54,16,12,z=124));put('shell',case.fuse(handle),'insulator');panel=box(175,3,116,y=-54,z=5)
  for x in [-50,-25,25,50]:panel=panel.cut(cq.Solid.makeCylinder(3.5,5,V(x,-57,28),V(0,1,0)))
  put('panel',panel,'insulator');put('panel',cyl(13,12).rotate(V(),V(1,0,0),90),'insulator',[0,-57,72]);put('base',box(180,110,5),'insulator')
  iron=box(58,40,58).cut(box(32,42,30,z=14));put('transformer',iron,'steel',[-45,5,22]);
  for x,r,mat in [(-22,11,'copper'),(16,9,'blue')]:
   for z in range(0,23,3):put('transformer',tube(r,r-1,2.2).rotate(V(),V(1,0,0),90),mat,[-45+x,11,39+z])
  # Primary/secondary spatially separated, no conductive core bridge asserted.
  put('bridge',board(40,35),'green',[18,0,18]);
  for x,y in [(-10,-10),(10,-10),(-10,10),(10,10)]:put('bridge',cyl(2.4,12).rotate(V(),V(1,0,0),90),'insulator',[18+x,y,23])
  for x in [25,47]:put('capacitors',cyl(9,28).fuse(cyl(10,2)),'blue',[x,22,20])
  sink=box(38,25,3)
  for x in range(-16,17,4):sink=sink.fuse(box(1.4,25,18,x=x,z=3))
  put('regulator',sink,'steel',[48,-12,23]);put('regulator',box(10,4,15),'insulator',[48,-27,26]);put('control',board(48,18),'green',[25,-34,65])
  for x in [25,50]:put('control',tube(4,1.5,15).rotate(V(),V(1,0,0),90),'copper',[x,-47,28])
  for i in range(4):put('wires',rod((-45+i*10,0,30),(20+i*8,-28,24),.8),'rubber')
 elif n=='C57':
  case=rect_vessel(138,210,44,3);panel=box(138,210,3,z=44).cut(box(102,63,5,y=55,z=43)).cut(cyl(18,5,43,0,-42))
  for x in [-45,0,45]:panel=panel.cut(cyl(4.2,5,43,x,-83))
  put('case',case.fuse(panel),'insulator');put('case',box(100,60,.5,y=55,z=43),'paper')
  for angle in range(25,156,10):
   a=math.radians(angle);put('case',rod((35*math.cos(a),35*math.sin(a)+21,44),(40*math.cos(a),40*math.sin(a)+21,44),.25),'ink')
  # magnetic moving-coil head: U magnet, soft-iron cylinder, copper coil and independent needle/pivots.
  magnet=box(65,40,14).cut(box(37,31,16,y=-8,z=-1));put('head',magnet,'steel',[0,42,15]);put('head',cyl(10,12),'steel',[0,43,17]);put('head',tube(13,11.5,9),'copper',[0,43,18]);put('head',rod((0,43,29),(20,88,29),.45),'steel');put('head',cyl(1,18,15),'steel',[0,43,0])
  spiral=cq.Wire.makeHelix(.25,1,4);spring=cq.Workplane('XZ').center(4,0).circle(.12).sweep(spiral,isFrenet=True).val();put('head',spring,'copper',[0,43,31])
  put('switch',cyl(18,6),'insulator',[0,-42,39]);put('switch',box(28,6,5),'insulator',[0,-42,45]);put('switch',board(55,55),'green',[0,-42,19])
  for j in range(12):
   a=j*math.pi/6;put('switch',cyl(1.7,2),'copper',[22*math.cos(a),-42+22*math.sin(a),21])
  put('switch',box(28,3,1.2),'copper',[0,-42,24])
  for g,x in [('va',-45),('ac',0),('ohm',45)]:
   put(g,board(25,75),'green',[x,-20,7])
   for k in range(4):put(g,cyl(2.3,10).rotate(V(),V(1,0,0),90),'ceramic'if g!='ac'else'insulator',[x,-40+k*17,11])
   put(g,rod((x,-78,10),(x,-48,10),.6),'copper')
  for x in [-45,0,45]:put('accessories',tube(5,2.05,12),'copper',[x,-83,33])
  for x in [-75,75]:put('accessories',cyl(4,55).fuse(cyl(1.3,25,55)),'insulator',[x,-60,0]);put('accessories',rod((x,-60,0),(x,-20,-20),1.6),'rubber')
 elif n=='C58':
  shell=rect_vessel(140,105,48,3);put('case',shell,'insulator');put('case',board(100,75),'green',[0,0,6]);put('panel',box(140,105,3).cut(box(65,28,5,z=-1)),'insulator',[0,0,49]);put('panel',box(64,27,.5),'paper',[0,0,48]);
  probe=cyl(6,115).fuse(sphere(6,(0,0,0))).fuse(cyl(8,24,115)).fuse(rod((0,0,139),(0,36,155),2));put('probe',probe,'glass',[105,0,12]);put('probe',rod((105,36,167),(45,20,50),1.8),'rubber')
  stand=box(50,55,6).fuse(cyl(4,145,6,18)).fuse(tube(9,6.4,12,95));stand=stand.cut(box(20,8,16,y=-8,z=93));put('stand',stand,'insulator',[105,0,0]);put('cap',cup(8,6.3,45,2),'insulator',[145,0,0])
 elif n=='C56':
  # Independent insulation, copper, split banana needle, two jaws, hinge/spring, hollow boot, bored terminal.
  path=cq.Workplane('XZ').moveTo(-65,0).spline([(-35,30),(0,45),(35,30),(65,0)]).wire().val();outer=cq.Workplane('YZ',origin=(-65,0,0)).circle(1.85).sweep(path).val();inner=cq.Workplane('YZ',origin=(-65,0,0)).circle(.95).sweep(path).val();put('insulation',outer.cut(inner),'rubber');put('copper',inner,'copper')
  put('bananaGrip',cup(5.5,2.1,24,2),'rubber',[-65,0,-24]);pin=tube(2,.9,22).cut(box(.5,5,17,z=6));put('bananaPin',pin,'copper',[-65,0,-42])
  lower=box(30,8,2).fuse(box(10,8,7,x=-10,z=2));lower=lower.cut(cq.Solid.makeCylinder(1.5,10,V(-10,-5,5),V(0,1,0)))
  for x in range(0,13,3):lower=lower.fuse(box(1.4,8,1.5,x=x,z=2))
  put('jawLower',lower,'copper',[65,0,0]);put('jawUpper',lower.rotate(V(-10,0,5),V(-10,1,5),18),'copper',[65,0,0]);hinge=rod((55,-5,5),(55,5,5),1.4).fuse(cq.Solid.makeTorus(3, .5,V(55,0,5),V(0,1,0)));put('hinge',hinge,'steel')
  put('boot',rect_vessel(24,12,12,1.5),'rubber',[58,0,-2]);put('terminalInsulator',cup(8,3.2,18,2),'insulator',[100,0,0]);term=tube(3,1,32).cut(cq.Solid.makeCylinder(1.6,8,V(-4,0,20),V(1,0,0))).fuse(tube(6,3.1,8,24));put('terminalConductor',term,'copper',[100,0,0])
 return out
BUILDERS={n:(lambda s,n=n:instrument(n,s))for n in ['C55','C56','C57','C58']}
