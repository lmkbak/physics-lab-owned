"""Independent C08-C11 functional CAD; no old geometry/texture resources."""
import argparse
import json
import math
from pathlib import Path
import cadquery as cq
import trimesh
from build_first_batch import cylinder,lathe,round_box,add_part,export_asset,MATERIALS,swept_round_mesh
from build_second_batch import bent_pipe,profile
HERE=Path(__file__).resolve().parent
S=json.loads((HERE/'third-batch-specs.json').read_text(encoding='utf-8'))
MATERIALS.update({'clear-polymer':dict(baseColorFactor=[195,224,226,150],metallicFactor=0,roughnessFactor=.38,alphaMode='BLEND',doubleSided=True),'ceramic':dict(baseColorFactor=[232,231,213,255],metallicFactor=0,roughnessFactor=.4),'cotton':dict(baseColorFactor=[229,220,193,255],metallicFactor=0,roughnessFactor=.95)})
INPUTS=['tools/owned-cad/build_third_batch.py','tools/owned-cad/third-batch-specs.json','tools/owned-cad/build_second_batch.py','tools/owned-cad/second-batch-specs.json','tools/owned-cad/build_first_batch.py','tools/owned-cad/first-batch-specs.json']

def begin(out,key):
 folder=out/key;folder.mkdir(parents=True,exist_ok=True);return folder,trimesh.Scene(),[]

def finish(out,key,scene,rows,params,profiles=None):return export_asset(out,key,scene,rows,params,profiles or {},INPUTS)


def wash(out):
 key='chem_wash_bottle_owned';folder,sc,rows=begin(out,key);p=S['C08'];R=p['outerRadius'];r=R-p['wall'];n=p['neckInnerRadius'];w=p['wall'];s=p['shoulderZ'];nz=p['neckZ'];h=p['height'];b=p['bottom']
 outer=lathe([(0,0),(R,0),(R,s),(n+w,nz),(n+w,h),(0,h)])
 inside=lathe([(0,b),(r,b),(r,s),(n,nz),(n,h+.1),(0,h+.1)])
 add_part(sc,'body',outer.cut(inside),'clear-polymer',report=rows,out=folder)
 cap=cylinder(n+w+2,12,h-6).cut(cylinder(n+w+.2,10,h-6.1)).cut(cylinder(p['tubeOuterRadius']+.1,13,h-6.1))
 for i in range(32):
  a=2*math.pi*i/32;cap=cap.cut(cylinder(.45,13,h-6.5).translate(((n+w+2)*math.cos(a),(n+w+2)*math.sin(a),0)))
 add_part(sc,'cap',cap,'polymer',report=rows,out=folder)
 seal=cylinder(5,1.5,h+6).cut(cylinder(p['tubeOuterRadius'],1.7,h+5.9))
 add_part(sc,'seal',seal,'rubber',report=rows,out=folder)
 ro=p['tubeOuterRadius'];ri=p['tubeInnerRadius'];z0=p['tubeBottomZ'];zt=p['tubeTopZ'];R=p['bendRadius']
 # Vertical pickup, 90deg bend, horizontal travel, second 90deg bend and down nozzle.
 path=cq.Workplane('XZ').moveTo(0,z0).lineTo(0,zt).threePointArc((R-R/math.sqrt(2),zt+R/math.sqrt(2)),(R,zt+R)).lineTo(R+p['nozzleLength'],zt+R).threePointArc((R+p['nozzleLength']+R/math.sqrt(2),zt+R/math.sqrt(2)),(2*R+p['nozzleLength'],zt)).lineTo(2*R+p['nozzleLength'],zt-p['nozzleDrop']).wire()
 tube=cq.Workplane('XY').workplane(offset=z0).circle(ro).circle(ri).sweep(path,isFrenet=True)
 add_part(sc,'tube',tube,'clear-polymer',report=rows,out=folder,mesh_override=swept_round_mesh(path.val(),ro,ri,samples=150,sections=64))
 return finish(out,key,sc,rows,p,{'body':profile([[b,r],[s,r],[nz,n],[h,n]])})


def tools(out):
 key='chem_spatulas_owned';folder,sc,rows=begin(out,key);p=S['C09']
 # Oblate bowl, a real cut concavity. Shaft and opposite thin shovel are continuous solid.
 bowl=cq.Workplane('XY').ellipse(12,7.5).extrude(4).translate((-56,0,0))
 cutter=cq.Workplane('XY').ellipse(10.5,6).extrude(4).translate((-56,0,1.2))
 bowl=bowl.cut(cutter)
 shaft=round_box(105,6,2,0,.8).translate((5,0,0));shovel=round_box(22,12,1.3,0,2).translate((57,0,0))
 spoon=bowl.union(shaft).union(shovel)
 add_part(sc,'spoon',spoon,'steel',report=rows,out=folder)
 narrow=round_box(115,4,1.4,0,.6).union(round_box(24,9,1,0,1.5).translate((62,0,0)))
 add_part(sc,'narrow_spatula',narrow,'steel',(0,24,0),rows,folder)
 # Sloped hollow boat from independent inner/outer lofts; no solid box stand-in.
 outer=cq.Workplane('XY').rect(52,44).workplane(offset=12).rect(68,60).loft()
 inner=cq.Workplane('XY').workplane(offset=1.2).rect(50,42).workplane(offset=11).rect(65.4,57.4).loft()
 add_part(sc,'weighing_boat',outer.cut(inner),'polymer',(0,78,0),rows,folder)
 return finish(out,key,sc,rows,p)


def spirit(out):
 key='chem_spirit_lamp_owned';folder,sc,rows=begin(out,key);p=S['C10'];R=p['outerBellyRadius'];r=p['innerBellyRadius'];s=p['shoulderZ'];nz=p['neckZ'];h=p['height'];n=p['neckInnerRadius'];b=p['bottom']
 outer=lathe([(0,0),(25,0),(R,10),(R,s),(n+2,nz),(n+2,h),(0,h)])
 inner=lathe([(0,b),(23,b),(r,11),(r,s-1),(n,nz),(n,h+.1),(0,h+.1)])
 add_part(sc,'reservoir',outer.cut(inner),'glass',report=rows,out=folder)
 holder=lathe([(3,h-12),(8,h-12),(8,h),(n+3,h),(n+3,h+3),(5,h+5),(5,h+12),(3,h+12)])
 add_part(sc,'holder',holder,'ceramic',report=rows,out=folder)
 add_part(sc,'wick',cylinder(p['wickRadius'],h+10,7),'cotton',report=rows,out=folder)
 cap=lathe([(p['capInnerRadius'],0),(p['capInnerRadius']+p['capWall'],0),(p['capInnerRadius']+p['capWall'],28),(0,31),(0,29),(p['capInnerRadius'],26)])
 add_part(sc,'cap',cap,'steel',(62,0,0),rows,folder)
 return finish(out,key,sc,rows,p,{'reservoir':profile([[b,23],[11,r],[s-1,r],[nz,n],[h,n]])})


def tripod(out):
 key='chem_tripod_gauze_owned';folder,sc,rows=begin(out,key);p=S['C11'];h=p['tripodHeight'];z=h-p['ringThickness'];R=p['ringOuterRadius'];ri=p['ringInnerRadius']
 ring=cylinder(R,p['ringThickness'],z).cut(cylinder(ri,p['ringThickness']+.2,z-.1))
 add_part(sc,'tripod',ring,'steel',report=rows,out=folder)
 for i in range(3):
  a=2*math.pi*i/3;start=cq.Vector(p['footRadius']*math.cos(a),p['footRadius']*math.sin(a),2);end=cq.Vector((R-4)*math.cos(a),(R-4)*math.sin(a),h-2);vec=end-start
  leg=cq.Workplane(obj=cq.Solid.makeCylinder(p['legRadius'],vec.Length,start,vec.normalized()))
  add_part(sc,f'tripod_leg_{i}',leg,'steel',report=rows,out=folder)
 # True woven open wire grid. Each wire is a named solid under gauze semantic group.
 size=p['meshSize'];r=p['wireRadius'];pitch=p['gridPitch']
 for axis in [0,1]:
  for j,t in enumerate(range(-int(size/2),int(size/2)+1,pitch)):
   pos=(-size/2,t,h+r) if axis==0 else (t,-size/2,h+3*r)
   direction=(1,0,0) if axis==0 else (0,1,0)
   wire=cq.Workplane(obj=cq.Solid.makeCylinder(r,size,cq.Vector(*pos),cq.Vector(*direction)))
   add_part(sc,f'gauze_{axis}_{j}',wire,'steel',report=rows,out=folder)
 for i,(dx,dy,W,D) in enumerate([(0,size/2,size+3,3),(0,-size/2,size+3,3),(size/2,0,3,size),(-size/2,0,3,size)]):
  border=cq.Workplane('XY').box(W,D,2).translate((dx,dy,h+1));add_part(sc,f'gauze_border_{i}',border,'steel',report=rows,out=folder)
 add_part(sc,'ceramic',cylinder(p['ceramicRadius'],p['ceramicThickness'],h+1.2),'ceramic',report=rows,out=folder)
 return finish(out,key,sc,rows,p)


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--only',nargs='+',default=['C08','C09','C10','C11']);parser.add_argument('--output',type=Path,default=HERE/'out');a=parser.parse_args();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
 for key in a.only:
  r={'C08':wash,'C09':tools,'C10':spirit,'C11':tripod}[key](out);print(json.dumps({'built':key,'groups':len(r['groups']),'replacementReady':False}),flush=True)
if __name__=='__main__':main()
