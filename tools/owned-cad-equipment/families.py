"""Independent family geometry, selected dimensions exclusively in local JSON specs."""
import math
import cadquery as cq
V=cq.Vector
def cyl(r,h,z=0,x=0,y=0):return cq.Solid.makeCylinder(r,h,V(x,y,z))
def box(w,d,h,x=0,y=0,z=0):return cq.Workplane('XY').box(w,d,h,centered=(True,True,False)).val().translate(V(x,y,z))
def tube(ro,ri,h,z=0,x=0,y=0):return cyl(ro,h,z,x,y).cut(cyl(ri,h+2,z-1,x,y))
def cup(ro,ri,h,bottom=1.5):return cyl(ro,h).cut(cyl(ri,h-bottom+1,bottom))
def fuse(parts):
 s=parts[0]
 for p in parts[1:]:s=s.fuse(p)
 return s.clean()
def cone(ro0,ro1,h,z=0):return cq.Solid.makeCone(ro0,ro1,h,V(0,0,z))
def c28(s):
 d=s['stopper'];parts=[]
 for key,holes,x in [('solid',[],0),('single',[[0,0]],40),('double',[[-5,0],[5,0]],80)]:
  sh=cone(d['r0'],d['r1'],d['height'])
  for hx,hy in holes:sh=sh.cut(cyl(d['holeRadius'],d['height']+2,-1,hx,hy))
  parts.append((key,sh,'rubber',[x,0,0]))
 t=s['tube'];parts.append(('straight',tube(t['ro'],t['ri'],t['length']),'glass',[0,45,0]))
 # A quarter torus plus tangent vertical and horizontal ends, all continuously hollow.
 r=s['bend']['radius'];ro=t['ro'];ri=t['ri'];
 path=cq.Workplane('XZ').moveTo(0,0).lineTo(0,25).threePointArc((r*(1-2**-.5),25+r*2**-.5),(r,25+r)).lineTo(r+25,25+r).wire().val()
 outer=cq.Workplane('XY').circle(ro).sweep(path).val();inner=cq.Workplane('XY').circle(ri).sweep(path).val()
 parts.append(('bend',outer.cut(inner),'glass',[45,45,0]));parts.append(('sleeve',tube(s['sleeve']['ro'],s['sleeve']['ri'],s['sleeve']['length']),'rubber',[90,45,0]));return parts
def c30(s):
 side=s['triangle']['side'];radius=side/math.sqrt(3);pts=[(radius*math.cos(a),radius*math.sin(a),0)for a in [math.pi/2,math.pi/2+2*math.pi/3,math.pi/2+4*math.pi/3]];out=[]
 for i in range(3):
  a=V(*pts[i]);b=V(*pts[(i+1)%3]);delta=b-a;direction=delta.normalized();wire=cq.Solid.makeCylinder(s['triangle']['wireRadius'],delta.Length,a,direction);shell=cq.Solid.makeCylinder(s['triangle']['outerRadius'],side*.74,a+delta*.13,direction).cut(cq.Solid.makeCylinder(s['triangle']['innerRadius'],side*.76,a+delta*.12,direction));out.extend([('triangle',wire,'steel',[0,0,5]),('triangle',shell,'ceramic',[0,0,5])])
 for key,d,x in [('ring70',s['ring70'],105),('ring90',s['ring90'],210)]:out.append((key,cone(d['ro0'],d['ro1'],d['height']).cut(cone(d['ri0'],d['ri1'],d['height'])),'cork',[x,0,0]))
 return out
def c32(s):
 out=[]
 for key,d,x in [('short',s['short'],0),('tall',s['tall'],65)]:
  out.append((key,cup(d['ro'],d['ri'],d['height'],d['bottom']),'glass',[x,0,0]));lid=cup(d['ro']+.8,d['ro']+.25,7,1.2);lid=lid.rotate(V(0,0,0),V(1,0,0),180).translate(V(0,0,d['height']+7.2));out.append((key+'_lid',lid,'glass',[x,0,12]))
 # Folded continuous spring tweezers, two tapered arms with real air gap.
 arm1=cq.Workplane('XZ').polyline([(-2,0),(-2,12),(-5,120),(-3.8,120),(-.8,12),(-.8,0)]).close().extrude(4,both=True).val()
 arm2=arm1.mirror('YZ');bridge=box(4,8,2,z=0)
 out.append(('tweezers',fuse([arm1,arm2,bridge]),'steel',[120,0,0]));return out
def c37(s):
 out=[];stand=box(130,35,6)
 for x in [-42,0,42]:stand=stand.fuse(tube(8,5,8,6,x))
 out.append(('stand',stand,'insulator',[0,0,0]))
 for key,mat,x in [('copper','copper',-42),('zinc','zinc',0),('graphite','graphite',42)]:
  electrode=box(18,2,90)if key!='graphite'else cyl(4,90)
  terminal=tube(5,2,10,90);electrode=electrode.fuse(terminal).clean();out.append((key,electrode,mat,[x,0,18]))
 return out
def c51(s):
 d=s['crystallizing'];p=s['petri'];lid=cup(p['ro']+1,p['ro']+.3,p['lidHeight'],p['lidBottom']).rotate(V(0,0,0),V(1,0,0),180).translate(V(0,0,p['height']+p['lidHeight']+.25))
 return [('crystallizing',cup(d['ro'],d['ri'],d['height'],d['bottom']),'glass',[0,0,0]),('petri',cup(p['ro'],p['ri'],p['height'],p['bottom']),'glass',[120,0,0]),('petri_lid',lid,'glass',[120,0,15])]
BUILDERS={'C28':c28,'C30':c30,'C32':c32,'C37':c37,'C51':c51}
