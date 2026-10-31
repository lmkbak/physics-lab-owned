"""C87 new independent eight-group flat-wick kerosene lamp, no reference inputs."""
import json
import math
from pathlib import Path
import cadquery as cq
from build_first_batch import cylinder,lathe,round_box,export_asset,MATERIALS
from build_fourth_batch import begin,part,ring
HERE=Path(__file__).resolve().parent
P={'units':'mm','height':260,'reservoirOuterRadius':42,'reservoirWall':1.8,'reservoirBottom':3,'reservoirShoulderZ':65,'reservoirNeckZ':82,'reservoirRimZ':94,'neckInnerRadius':18,'wickWidth':18,'wickThickness':2.4,'wickBottomZ':12,'wickTopZ':136,'chimneyBottomZ':112,'chimneyTopZ':260,'chimneyWall':1.5,'newDesign':True,'replacementReady':False}
MATERIALS['cotton']=dict(baseColorFactor=[223,212,186,255],metallicFactor=0,roughnessFactor=.94)

def main():
 out=HERE/'out';key='chem_kerosene_lamp_owned';folder,sc,rows=begin(out,key);p=P;R=p['reservoirOuterRadius'];w=p['reservoirWall'];n=p['neckInnerRadius'];s=p['reservoirShoulderZ'];nz=p['reservoirNeckZ'];h=p['reservoirRimZ'];b=p['reservoirBottom']
 outer=lathe([(0,0),(30,0),(R,14),(R,50),(35,s),(n+w,nz),(n+w,h),(0,h)])
 inner=lathe([(0,b),(29,b),(R-w,15),(R-w,49),(33,s-1),(n,nz),(n,h+.1),(0,h+.1)])
 part(sc,rows,folder,'reservoir',outer.cut(inner))
 collar=ring(n+3,n+w+.2,16,h-10).union(ring(n+5,n,3,h+3))
 part(sc,rows,folder,'neck_collar',collar,'steel')
 # Burner seat real radial ventilation apertures, axle holes and three chimney tabs.
 burner=ring(28,20,7,101).union(ring(22,19,10,94))
 for i in range(12):
  a=2*math.pi*i/12;hole=cylinder(2.4,10,99).translate((24*math.cos(a),24*math.sin(a),0));burner=burner.cut(hole)
 for i in range(3):
  a=2*math.pi*i/3;tab=round_box(5,3,15,105,.5).translate((27*math.cos(a),27*math.sin(a),0));burner=burner.union(tab)
 axle=cq.Workplane(obj=cq.Solid.makeCylinder(2,60,cq.Vector(-30,0,113),cq.Vector(1,0,0)));burner=burner.cut(axle)
 part(sc,rows,folder,'burner_seat',burner,'steel')
 guide=round_box(24,7,30,100,1).cut(cq.Workplane('XY').box(18.5,2.8,32,centered=(True,True,False)).translate((0,0,99)))
 guide=guide.cut(cq.Workplane('XY').box(10,10,11).translate((7,0,113)))
 part(sc,rows,folder,'wick_guide',guide,'steel')
 wick=cq.Workplane('XY').box(18,2.4,124,centered=(True,True,False)).translate((0,0,12))
 part(sc,rows,folder,'flat_wick',wick,'cotton')
 # Independent drive shaft and spur-wheel are one functional group; no motor animation claimed.
 shaft=cq.Workplane(obj=cq.Solid.makeCylinder(1.8,42,cq.Vector(-14,0,113),cq.Vector(1,0,0)))
 gear=cq.Workplane('YZ').polygon(20,13).extrude(3).translate((2,0,113)).cut(cq.Workplane(obj=cq.Solid.makeCylinder(1.8,5,cq.Vector(1,0,113),cq.Vector(1,0,0))))
 knob=cq.Workplane('YZ').polygon(24,17).extrude(4).translate((28,0,113))
 part(sc,rows,folder,'drive',shaft.union(gear).union(knob),'steel')
 hood=lathe([(25,108),(26,108),(20,128),(12,137),(0,137),(0,136),(11,136),(19,127)])
 hood=hood.cut(cq.Workplane('XY').box(20,4,16).translate((0,0,135)))
 part(sc,rows,folder,'hood',hood,'steel')
 pts=[(29,112),(32,126),(35,145),(34,166),(29,184),(19,211),(17,238),(18,260)]
 chimney=lathe(pts+[(r-1.5,z) for r,z in reversed(pts)])
 part(sc,rows,folder,'chimney',chimney)
 P['sourceInputs']=['tools/owned-cad/build_kerosene_lamp.py','tools/owned-cad/build_first_batch.py','tools/owned-cad/build_fourth_batch.py']
 r=export_asset(out,key,sc,rows,p,{},P['sourceInputs'])
 (folder/'design.json').write_text(json.dumps(P,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'built':'C87','groups':len(r['groups']),'replacementReady':False}))
if __name__=='__main__':main()
