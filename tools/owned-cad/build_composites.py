"""C75-C86 candidate assemblies, authored exclusively from new owned scene contracts.
Every reused mesh retains its input hash and rigid transform. No inherited geometry.
Ports, contacts, dimensions, visual review and runtime remain pending until checked.
"""
import argparse,base64,copy,hashlib,json,math
from pathlib import Path
import numpy as np
import trimesh
import cadquery as cq
from build_first_batch import cylinder,round_box,lathe,mesh_from_shape,MATERIALS,swept_round_mesh
from build_fourth_batch import ring,stop
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent;OUT=HERE/'out'

def transform(p=(0,0,0),axis=None,deg=0):
 M=np.eye(4) if axis is None else trimesh.transformations.rotation_matrix(math.radians(deg),axis)
 M[:3,3]=p;return M

class Assembly:
 def __init__(self,stem,number):
  self.key='chem_'+stem+'_owned';self.number=number;self.folder=OUT/self.key;self.folder.mkdir(parents=True,exist_ok=True)
  self.meshes=[];self.profiles={};self.sources=[];self.sc=trimesh.Scene();self.counter=0
 def place(self,stem,names,prefix,p=(0,0,0),axis=None,deg=0,equipment=False):
  folder=ROOT/'tools'/'owned-cad-equipment'/'out'/('chem_'+stem+'_cadquery') if equipment else OUT/('chem_'+stem+'_owned')
  file=folder/'scene.json';data=json.loads(file.read_text(encoding='utf-8'))
  if equipment:
   receipt=json.loads((folder/'verification.json').read_text(encoding='utf-8'));assert receipt['localChecksPass']
  else:
   receipt=json.loads((OUT/'output-audit.json').read_text(encoding='utf-8'));r=next(a for a in receipt['assets'] if a['asset']==data['asset']);assert not r['failures']
  T=transform(p,axis,deg);selected=[]
  for source in data['meshes']:
   if names is not None and source['name'] not in names and source['group'] not in names:continue
   m=copy.deepcopy(source);name=prefix+'_'+m['name'];m['name']=name;m['group']=prefix+'_'+m['group']
   # Source meshes are local. Ignore gallery-only assembly offsets deliberately.
   v=np.frombuffer(base64.b64decode(m['posB64']),dtype='<f4').reshape(-1,3)
   f=np.frombuffer(base64.b64decode(m['idxB64']),dtype='<u4').reshape(-1,3)
   v=trimesh.transformations.transform_points(v,T)
   m['posB64']=base64.b64encode(np.asarray(v,dtype='<f4').tobytes()).decode();m['assemblyOffset_mm']=[0,0,0]
   m['ownedSource']={'scene':str(file.relative_to(ROOT)).replace('\\','/'),'name':source['name'],'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'rigidTransform':T.tolist()}
   self.meshes.append(m);self.add_display(m,v,f);selected.append(source['name'])
  assert selected,(stem,names)
  self.sources.append({'scene':str(file.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'selected':selected,'transform':T.tolist()})
 def add_display(self,m,v,f):
  mesh=trimesh.Trimesh(v,f,process=False);mesh.visual.vertex_colors=np.array([*(np.array(m['color'])*255),m['opacity']*255],dtype=np.uint8)
  self.sc.add_geometry(mesh,geom_name=m['name'],node_name=m['name'])
 def new(self,name,shape,material='steel',p=(0,0,0),axis=None,deg=0,mesh_override=None):
  assert shape.val().isValid(),name;mesh=mesh_override if mesh_override is not None else mesh_from_shape(shape);vol=shape.val().Volume();error=abs(abs(mesh.volume)-vol)/vol*100;assert mesh.is_watertight and error<=.2,(name,error)
  cq.exporters.export(shape,str(self.folder/(name+'.step')))
  T=transform(p,axis,deg);v=trimesh.transformations.transform_points(mesh.vertices,T);f=mesh.faces;mat=MATERIALS[material]
  m={'name':name,'group':name,'posB64':base64.b64encode(np.asarray(v,dtype='<f4').tobytes()).decode(),'idxB64':base64.b64encode(np.asarray(f,dtype='<u4').tobytes()).decode(),'color':[i/255 for i in mat['baseColorFactor'][:3]],'opacity':mat['baseColorFactor'][3]/255,'glass':material in ['glass','amber'],'metal':mat['metallicFactor']>0,'roughness':mat['roughnessFactor'],'marking':False,'assemblyOffset_mm':[0,0,0],'ownedNew':{'step':name+'.step','rigidTransform':T.tolist(),'cadVolume_mm3':vol,'meshVolumeError_pct':error}}
  self.meshes.append(m);self.add_display(m,v,f)
 def finish(self):
  s={'schema':'owned-cad-scene/1','asset':self.key,'units':'mm','up':'Z','origin':'world assembly mm; original parts retained in provenance transforms','meshes':self.meshes,'profiles':{},'replacementReady':False}
  text=json.dumps(s,ensure_ascii=False,separators=(',',':'))+'\n';tri=sum(len(base64.b64decode(m['idxB64']))//12 for m in self.meshes)
  assert tri<=120000,(self.number,tri);assert len(text.encode())<=3000000,(self.number,len(text.encode()))
  (self.folder/'scene.json').write_text(text,encoding='utf-8');self.sc.export(str(self.folder/(self.key+'.glb')))
  manifest={'number':self.number,'asset':self.key,'status':'candidate-rigid-assembly-local-only','sourceInputs':['tools/owned-cad/build_composites.py',*self.sources],'newParts':[m['name'] for m in self.meshes if 'ownedNew' in m],'triangles':tri,'bytes':len(text.encode()),'replacementReady':False,'pending':['dimension/contact fixtures','channel continuity fixtures','visual review','runtime integration','wall/chord metrology','performance','production signoff']}
  (self.folder/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'built':self.number,'triangles':tri,'bytes':len(text.encode()),'replacementReady':False}),flush=True)

def c75():
 a=Assembly('volumetric_accessories','C75');a.place('volumetric_pipette',['pipette','single_capacity_line','pipette_label'],'pipette',(0,0,30),(0,1,0),90);a.place('volumetric_pipette',['suction_bulb'],'bulb',(280,0,0))
 for i,x in enumerate([28,205]):
  rack=round_box(12,82,30,0,2)
  for y in [-22,0,22]:rack=rack.cut(cq.Workplane(obj=cq.Solid.makeCylinder(3,14,cq.Vector(-7,y,30),cq.Vector(1,0,0))))
  a.new('three_slot_rack_'+str(i),rack,'polymer',(x,0,0))
 a.new('white_background',round_box(100,60,3,0,2),'ceramic',(115,88,0));return a

def c76():
 a=Assembly('sublimation','C76');a.place('porcelain_heating',['dish'],'dish');a.place('filter_funnel',['funnel'],'inverted_funnel',(0,0,185),(1,0,0),180)
 a.new('support_ring',ring(46,35.5,3,25),'ceramic');paper=cylinder(35,.3,28)
 for x in [-20,-10,0,10,20]:
  for y in [-20,-10,0,10,20]:
   if x*x+y*y<1000:paper=paper.cut(cylinder(1,.5,27.9).translate((x,y,0)))
 a.new('perforated_paper',paper,'paper');return a

def c77():
 a=Assembly('separation_compare','C77');a.place('filter_funnel',None,'gravity',(-220,0,0));a.place('vacuum_filtration',None,'vacuum',(0,0,0),equipment=True);a.place('dialysis_bag',None,'dialysis',(220,0,0),equipment=True);return a

def c78():
 a=Assembly('gas_generator','C78');a.place('conical_flask',['flask'],'flask');a.place('thistle_funnels',['short'],'thistle',(-5,0,25),equipment=True)
 stopper=stop(11.5,22,z=114)
 for x,r in [(-5,3),(5,2.7)]:stopper=stopper.cut(cylinder(r,24,113).translate((x,0,0)))
 a.new('double_hole_stopper',stopper,'rubber');a.place('conical_flask',['bent_tube'],'outlet',(5,0,118));return a

def c79():
 a=Assembly('water_displacement','C79');a.place('gas_collection',['water_trough'],'trough');a.place('gas_collection',['gas_platform'],'platform',(0,0,4));a.place('gas_collection',['gas_jar'],'inverted_jar',(0,0,188),(1,0,0),180);a.place('gas_collection',['glass_cover'],'cover',(115,0,0))
 # Continuous annular cross-rim pipe, both ends open. Independent smooth path.
 wire=cq.Workplane('YZ').moveTo(-105,105).lineTo(-92,105).threePointArc((-82.100505,100.899495),(-78,91)).lineTo(-78,32).threePointArc((-73.899495,22.100505),(-64,18)).lineTo(0,18).wire()
 pipe=cq.Workplane('XZ').workplane(offset=105).center(0,105).circle(2.5).circle(1.5)
 # Use edge sweep with a plane perpendicular to its first tangent.
 edge=wire.val();start=edge.positionAt(0);tangent=edge.tangentAt(0);pipe=cq.Workplane(cq.Plane(origin=start,normal=tangent)).circle(2.5).circle(1.5).sweep(wire,isFrenet=True)
 a.new('cross_rim_pipe',pipe,'glass',mesh_override=swept_round_mesh(wire.val(),2.5,1.5,samples=220,sections=64));return a

def c80():
 a=Assembly('airtightness','C80');a.place('conical_flask',['flask'],'flask',(-100,0,0));a.place('conical_flask',['bored_stopper'],'stopper',(-100,0,114));a.place('conical_flask',['bent_tube'],'outlet',(-100,0,118));a.place('beakers',['beaker100','beaker100_scale'],'receiver',(35,0,0))
 wire=cq.Workplane('XZ').moveTo(-38,182).lineTo(0,182).threePointArc((24.748737,171.748737),(35,147)).lineTo(35,40).wire();start=wire.val().positionAt(0);tangent=wire.val().tangentAt(0)
 a.new('down_pipe',cq.Workplane(cq.Plane(origin=start,normal=tangent)).circle(2.5).circle(1.5).sweep(wire,isFrenet=True),'glass');a.new('coupling',ring(3.2,2.6,14),'rubber',(-43,0,182),(0,1,0),90);return a

def c81():
 a=Assembly('gravity_filtration','C81');a.new('raised_base',round_box(115,85,40,0,4),'polymer');a.place('filter_funnel',['stand_base','stand_post','stand_arm','support_ring','funnel','folded_paper'],'filter',(0,0,40));a.place('beakers',['beaker250','beaker250_scale'],'receiver',(28,0,0));a.place('beakers',['stirrer'],'rod',(95,0,0));return a

def c82():
 a=Assembly('distillation_setup','C82');a.place('round_flasks',['flask250'],'flask',(-180,0,15));a.place('round_flasks',['cradle250'],'cradle',(-180,0,0));a.place('distillation_adapters',['distillation_head'],'head',(-180,0,135));a.place('distillation_adapters',['thermometer_adapter','locking_cap'],'adapter',(-180,0,235));a.new('probe',cylinder(1.7,105),'steel',(-180,0,187))
 a.place('liebig_condenser',['condenser','inlet_sleeve','outlet_sleeve'],'cooler',(-110,0,197),(0,1,0),100)
 a.place('distillation_adapters',['receiver_adapter'],'receiver',(171,0,147),(0,1,0),150);a.place('beakers',['beaker100','beaker100_scale'],'cup',(220,0,0))
 for i,x in enumerate([-50,120]):a.new('cold_support_'+str(i),round_box(45,55,100 if i==0 else 70,0,3),'polymer',(x,0,0))
 return a

def c83():
 a=Assembly('titration_setup','C83');a.place('burette',None,'burette',(0,0,140));a.new('raised_support',round_box(110,80,140,0,4),'polymer',(-25,0,0));a.new('white_background',round_box(100,60,3,0,2),'ceramic');a.place('conical_flask',['flask','flask_scale'],'receiver',(0,0,3));return a

def c84():
 a=Assembly('separation_setup','C84');a.place('separating_funnel',['funnel','stopcock','stand_base','stand_post','stand_arm','support_ring'],'separator',(0,0,13));a.place('separating_funnel',['stopper'],'stopper',(90,0,-250));a.place('beakers',['beaker100','beaker100_scale'],'receiver',(20,0,0));a.place('beakers',['beaker100','beaker100_scale'],'spare',(115,0,0));return a

def c85():
 a=Assembly('wash_dry_train','C85');a.place('gas_washing',None,'washer',(-90,0,0));a.place('u_drying_tube',None,'dryer',(90,0,0))
 wire=cq.Workplane('XZ').spline([(-42,170),(-5,180),(30,190),(60,166),(60,154)]).wire();start=wire.val().positionAt(0);tangent=wire.val().tangentAt(0)
 hose=cq.Workplane(cq.Plane(origin=start,normal=tangent)).circle(3.2).circle(2.6).sweep(wire,isFrenet=True);a.new('coupling_hose',hose,'rubber');return a

def c86():
 a=Assembly('galvanic_setup','C86');a.new('shared_stand',round_box(180,70,6,0,3),'polymer')
 for label,x in [('left',-40),('right',40)]:a.place('beakers',['beaker100','beaker100_scale'],label,(x,0,6))
 a.place('electrodes_set',['zinc'],'zinc',(-40,0,28),equipment=True);a.place('electrodes_set',['copper'],'copper',(40,0,28),equipment=True);a.place('salt_bridge',['bridge'],'bridge',(0,0,38),equipment=True);return a

def main():
 p=argparse.ArgumentParser();p.add_argument('--only',nargs='+',default=[f'C{i}' for i in range(75,87)]);a=p.parse_args()
 for number in a.only:globals()['c'+number[1:]]().finish()
if __name__=='__main__':main()
