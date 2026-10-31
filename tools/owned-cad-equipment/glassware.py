"""Independent hollow laboratory apparatus families; no external geometry inputs."""
import math
import cadquery as cq
from families import cyl,box,tube,cup,fuse,cone,V

def sphere(r,point=(0,0,0)):return cq.Solid.makeSphere(r,V(*point),angleDegrees1=-90,angleDegrees2=90)
def line_tube(a,b,ro,ri):
 a,b=V(*a),V(*b);d=b-a
 return cq.Solid.makeCylinder(ro,d.Length,a,d.normalized()).cut(cq.Solid.makeCylinder(ri,d.Length+2,a-d.normalized(),d.normalized()))
def vessel(d):
 return cyl(d['ro'],d['h']).cut(cyl(d['ri'],d['h']-d['bottom']+1,d['bottom']))
def rect_vessel(w,d,h,t):return box(w,d,h).cut(box(w-2*t,d-2*t,h-t+1,z=t))
def cap(r,z):return cyl(r,10,z)
def assembly(n,s):
 d=s['dimensions'];out=[]
 def put(g,sh,m='glass',off=None):out.append((g,sh,m,off or [0,0,0]))
 if n=='C29':
  for key,h,x in [('short',180,0),('long',240,65)]:
   outer=sphere(20,(0,0,h-26)).fuse(cyl(3,h-26)).fuse(cyl(10,13,h-13));void=sphere(18.5,(0,0,h-26)).fuse(cyl(2,h+2,-1)).fuse(cyl(8.6,16,h-15));put(key,outer.cut(void),off=[x,0,0])
 elif n=='C35':
  outer=fuse([sphere(22,(0,0,48)),cyl(4,48),cyl(10,38,48)]);void=fuse([sphere(20.5,(0,0,48)),cyl(2,49,-1),cyl(8.5,42,47)]);put('body',outer.cut(void));put('stopper',cone(8.3,9.5,15).cut(cyl(2.6,17,-1)),'rubber',[45,0,0]);put('connector',tube(2.5,1.6,45),off=[65,0,0])
 elif n=='C38':
  r=40;path=cq.Workplane('XZ').moveTo(-r,0).lineTo(-r,70).threePointArc((0,110),(r,70)).lineTo(r,0).wire().val();outer=cq.Workplane('XY').center(-r,0).circle(6).sweep(path).val();inner=cq.Workplane('XY').center(-r,0).circle(4.5).sweep(path).val();put('bridge',outer.cut(inner));put('stand',box(110,35,8).fuse(tube(7.5,6.2,12,8,-40)).fuse(tube(7.5,6.2,12,8,40)),'wood',[0,0,-10])
 elif n=='C39':
  put('tank',rect_vessel(120,78,90,2));beam=box(125,16,8,z=93)
  for x in [-25,25]:beam=beam.cut(cyl(6,10,92,x))
  put('beam',beam,'insulator')
  for g,x in [('electrodeA',-25),('electrodeB',25)]:put(g,cyl(4,76,25,x).fuse(tube(6,2,9,101,x)),'graphite')
 elif n=='C40':
  rack=box(95,36,7)
  for x in [-24,24]:rack=rack.fuse(box(10,36,112,x=x))
  top=box(95,36,7,z=104)
  for x in [-24,24]:top=top.cut(cyl(11,10,103,x))
  put('rack',rack.fuse(top),'wood',[0,0,-10])
  for key,x in [('tube1',-24),('tube2',24)]:put(key,cup(11,9.5,190,2),off=[x,0,0]);put(key+'_stopper',cone(9.3,10.6,16),'rubber',[x,45,0])
 elif n in ['C41','C48']:
  outer=sphere(45,(0,0,45));void=sphere(43.5,(0,0,45));ports=[((0,0,45),(0,0,135),12,10.5)]
  if n=='C41':ports += [((0,0,45),(-47,0,126),10,8.5),((0,0,45),(47,0,126),10,8.5)]
  else:ports += [((0,0,107),(60,0,107),4.5,3)]
  for a,b,ro,ri in ports:
   v=V(*b)-V(*a);outer=outer.fuse(cq.Solid.makeCylinder(ro,v.Length,V(*a),v.normalized()));void=void.fuse(cq.Solid.makeCylinder(ri,v.Length+2,V(*a),v.normalized()))
  put('body',outer.cut(void));put('support',cone(34,30,16).cut(cone(20,25,16)),'cork',[0,0,-8])
  for i,(a,b,ro,ri)in enumerate(ports if n=='C41'else ports[:1]):put('stopper'+str(i),cone(ri-.1,ri+1.1,18),'rubber',[70+i*27,0,0])
 elif n=='C60':
  put('bottle',vessel(dict(ro=34,ri=32.5,h=150,bottom=2)));stop=cone(30,33,20)
  for x in [-10,10]:stop=stop.cut(cyl(3.5,22,-1,x))
  put('stopper',stop,'rubber',[0,0,152]);put('tubeA',tube(3.4,2.3,55),off=[-10,0,135]);put('tubeB',tube(3.4,2.3,55),off=[10,0,135])
 elif n=='C61':
  for key,yshape,x in [('T',False,0),('Y',True,65)]:
   segments=[((0,0,0),(0,0,35)),((0,0,35),(-22,0,57 if yshape else 35)),((0,0,35),(22,0,57 if yshape else 35))];outer=[];inner=[]
   for a,b in segments:
    v=V(*b)-V(*a);outer.append(cq.Solid.makeCylinder(4,v.Length,V(*a),v.normalized()));inner.append(cq.Solid.makeCylinder(2.5,v.Length+2,V(*a)-v.normalized(),v.normalized()))
   if not yshape:
    outer=[cyl(4,35),cq.Solid.makeCylinder(4,44,V(-22,0,35),V(1,0,0))]
    inner=[cyl(2.5,37,-1),cq.Solid.makeCylinder(2.5,46,V(-23,0,35),V(1,0,0))]
   put(key,fuse(outer).cut(fuse(inner)),off=[x,0,0])
  for i in range(2):put('sleeve',tube(5.4,4.15,26),'rubber',[i*65,45,0])
 elif n=='C62':
  sh=fuse([cone(7,9,28),cyl(12,30,28)]).cut(fuse([cone(5,7,28),cone(9.1,11.1,31,28)]));put('adapter',sh);put('upper',tube(9,7.4,42),off=[50,0,0]);clip=tube(15,11.5,5).cut(box(12,30,7,x=13,z=-1));put('clip',clip,'insulator',[25,35,0])
 elif n=='C67':
  funnel=fuse([cone(28,4,28),tube(4,2.5,38,28)]).cut(cone(26.5,2.5,28));put('funnel',funnel);put('cup',cup(40,38.5,70,1.5),off=[0,0,-75]);put('stand',box(85,50,7).fuse(cyl(4,145,7,35)).fuse(tube(6,4.2,8,65)),'steel',[0,0,-80])
 elif n=='C68':
  put('tube',tube(14,12.5,240).rotate(V(),V(0,1,0),90));boat=rect_vessel(70,20,12,1.7);put('boat',boat,'ceramic',[110,0,0]);stand=box(200,55,8)
  for x in [-65,65]:stand=stand.fuse(box(20,45,25,x=x,z=8).cut(cq.Solid.makeCylinder(14.3,22,V(x-11,0,35),V(1,0,0))))
  put('stand',stand,'wood',[120,0,-35])
  for key,x in [('left',-15),('right',240)]:put(key+'_stopper',cone(12.3,13.5,18).cut(cyl(3.2,20,-1)),'rubber',[x,0,0]);put(key+'_connector',tube(3.1,2,40),off=[x,35,0])
 elif n=='C70':
  put('cup',cup(50,48.5,115,2));bag=cup(16,15.8,76,.2).fuse(cyl(16,.2,75.8));put('membrane',bag,'membrane',[0,0,26]);put('stand',box(140,70,8).fuse(cyl(4,150,8,-58)).fuse(cyl(4,150,8,58)).fuse(box(124,14,8,z=150)),'steel');put('upper',box(38,8,6),'insulator',[0,0,102]);put('lower',box(38,8,6),'insulator',[0,0,25])
 elif n=='C71':
  put('outer',cup(48,46,95,2),'steel');put('insulation',cup(45.5,39.5,90,6),'foam',[0,0,2]);put('inner',cup(38,36.8,83,1.2),off=[0,0,8]);lid=cyl(49,8,95)
  for x in [-12,12]:lid=lid.cut(cyl(3.5,10,94,x))
  put('lid',lid,'insulator');put('probe',cyl(3,105,15,-12),'steel');ring=cq.Solid.makeTorus(25,1.2,V(0,0,25)).fuse(cyl(1.2,88,25,25));put('stirrer',ring,'glass',[12,0,0])
 elif n=='C73':
  put('tank',rect_vessel(110,65,145,2));put('lid',box(114,69,4,z=146).fuse(cyl(2,100).rotate(V(),V(0,1,0),90).translate(V(-50,0,143))),'glass');put('clip',box(36,8,5),'steel',[0,0,136]);paper=box(32,.35,110,z=20);put('paper',paper,'paper');put('front',box(32,.4,.6),'ink',[0,-.4,106]);put('spotA',cyl(2,.5).rotate(V(),V(1,0,0),90),'ink',[-7,-.5,68]);put('spotB',cyl(2,.5).rotate(V(),V(1,0,0),90),'ink',[7,-.5,88])
 elif n=='C74':
  sh=rect_vessel(160,95,110,3).cut(box(100,5,55,y=-47,z=28)).cut(box(5,5,5,x=-79,z=58));put('box',sh,'insulator');put('lid',box(166,101,4),'insulator',[0,0,113]);put('light',tube(10,2,35).rotate(V(),V(0,1,0),90),'steel',[-110,0,60]);put('sample',rect_vessel(32,32,75,1.5),off=[0,0,8]);put('absorber',box(3,55,85),'insulator',[65,0,10])
 return out
NUMBERS=['C29','C35','C38','C39','C40','C41','C48','C60','C61','C62','C67','C68','C70','C71','C73','C74']
BUILDERS={n:(lambda s,n=n:assembly(n,s))for n in NUMBERS}
