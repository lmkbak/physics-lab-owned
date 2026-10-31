"""Original parametric electrical teaching apparatus. Inputs are owned JSON only.
No font, image, network, previous CAD or old mesh is read by this generator.
Python 3.13 / CadQuery 2.8.0. CAD coordinates millimetres, Z up.
"""
from __future__ import annotations
import argparse, base64, hashlib, json, math, platform, re, sys, time
from pathlib import Path
import cadquery as cq
import numpy as np
import trimesh
from OCP.BRepMesh import BRepMesh_IncrementalMesh

ROOT=Path(__file__).resolve().parent
SPEC=json.loads((ROOT/'design-specs.json').read_text(encoding='utf-8'))
REQ=json.loads((ROOT/'requirements.json').read_text(encoding='utf-8'))
REQS={r['asset']:r for r in REQ['requirements']}
COL=SPEC['materials']; PI=math.pi

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(p,d): p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def vec(p): return cq.Vector(*[float(x) for x in p])
def box(x,y,z,p=(0,0,0)):
    return cq.Workplane('XY').box(x,y,z,centered=(True,True,False)).val().translate(vec(p))
def cyl(r,h,p=(0,0,0),axis=(0,0,1)):
    return cq.Solid.makeCylinder(r,h,vec(p),vec(axis))
def tube(ro,ri,h,p=(0,0,0),axis=(0,0,1)):
    return cyl(ro,h,p,axis).cut(cyl(ri,h,p,axis))
def ball(r,p=(0,0,0)):
    return cq.Solid.makeSphere(r,vec(p),angleDegrees1=-90,angleDegrees2=90)
def compound(shapes): return cq.Compound.makeCompound(shapes)
def orient(s,d):
    z=np.array([0.,0.,1.]); d=np.array(d,dtype=float); d/=np.linalg.norm(d)
    a=np.cross(z,d); n=np.linalg.norm(a)
    if n<1e-10: return s if d[2]>0 else s.rotate((0,0,0),(1,0,0),180)
    return s.rotate((0,0,0),tuple(a/n),math.degrees(math.acos(float(d[2]))))
def place(s,p,d=(0,0,1)): return orient(s,d).translate(vec(p))
def rod(a,b,r):
    a=np.array(a); b=np.array(b); delta=b-a
    return cyl(r,float(np.linalg.norm(delta)),a,delta/np.linalg.norm(delta))
def helix(radius,pitch,height,wire,p=(0,0,0),axis='x'):
    # Bound OCCT helical sweep spans to one revolution to avoid long-curve
    # pipe-shell failure. Each turn is a true swept BRep with touching end faces.
    turns=int(math.floor(height/pitch+1e-10));shapes=[]
    path=cq.Wire.makeHelix(pitch,pitch,radius)
    profile=cq.Plane(origin=(radius,0,0),xDir=(1,0,0),normal=(0,radius,pitch/(2*PI)))
    unit=cq.Workplane(profile).circle(wire).sweep(cq.Workplane(obj=path),isFrenet=True).val()
    for i in range(turns):shapes.append(unit.translate((0,0,i*pitch)))
    remainder=height-turns*pitch
    if remainder>1e-8:
        tailpath=cq.Wire.makeHelix(pitch,remainder,radius)
        tail=cq.Workplane(profile).circle(wire).sweep(cq.Workplane(obj=tailpath),isFrenet=True).val()
        shapes.append(tail.translate((0,0,turns*pitch)))
    s=compound(shapes)
    if axis=='x': s=s.rotate((0,0,0),(0,1,0),90)
    result=s.translate(vec(p));result.owned_helix={'radius':radius,'pitch':pitch,'height':height,'wire':wire,'p':list(p),'axis':axis}
    return result

def analytic_helix_mesh(h,pivot):
    r=h['radius'];pitch=h['pitch'];height=h['height'];wire=h['wire'];turns=height/pitch
    # Lead-authorized runtime winding LOD: retain actual helix/turn count,
    # 12 centerline samples per turn and octagonal wire cross sections.
    # The exact BRep remains separate; this LOD has its own measured error.
    nt=int(math.ceil(turns*12));nc=8
    theta=np.linspace(0,turns*2*PI,nt+1);phi=np.arange(nc)*2*PI/nc
    c=np.cos(theta);s=np.sin(theta);k=pitch/(2*PI);norm=math.sqrt(r*r+k*k)
    center=np.stack([r*c,r*s,k*theta],axis=1)
    u=np.stack([c,s,np.zeros_like(c)],axis=1)
    v=np.stack([-k*s/norm,k*c/norm,np.full_like(c,-r/norm)],axis=1)
    vertices=(center[:,None,:]+wire*(u[:,None,:]*np.cos(phi)[None,:,None]+v[:,None,:]*np.sin(phi)[None,:,None])).reshape(-1,3)
    if h['axis']=='x':vertices=vertices@np.array([[0,0,-1],[0,1,0],[1,0,0]])
    vertices+=np.array(h['p'])-pivot
    i=np.arange(nt)[:,None];j=np.arange(nc)[None,:];a=i*nc+j;b=i*nc+(j+1)%nc;cc=(i+1)*nc+j;dd=(i+1)*nc+(j+1)%nc
    faces=np.concatenate([np.stack([a,b,cc],axis=-1).reshape(-1,3),np.stack([b,dd,cc],axis=-1).reshape(-1,3)])
    # Explicit planar end caps; no hidden open ends.
    for end,base in [(0,0),(-1,nt*nc)]:
        pos=center[end]
        if h['axis']=='x':pos=pos@np.array([[0,0,-1],[0,1,0],[1,0,0]])
        vertices=np.vstack([vertices,pos+np.array(h['p'])-pivot]);idx=len(vertices)-1
        cap=np.array([[idx,base+j,base+(j+1)%nc] for j in range(nc)])
        faces=np.vstack([faces,cap])
    m=trimesh.Trimesh(vertices,faces,process=False);m.fix_normals(multibody=True);return m

def rounded_base(x,y,z):
    return cq.Workplane('XY').box(x,y,z,centered=(True,True,False)).edges('|Z').fillet(3).val()
def slotted_screw(x,y,z):
    return cyl(2.6,1.5,(x,y,z)).cut(box(5.8,.75,.65,(x,y,z+1)))

# Glyphs are original seven-stroke diagrams; no font engine or external assets.
SEG={'0':'abcedf','1':'bc','2':'abged','3':'abgcd','4':'fgbc','5':'afgcd','6':'afgecd','7':'abc','8':'abcdefg','9':'abfgcd',
     'A':'abcefg','B':'fgecd','C':'afed','D':'bgecd','E':'afged','F':'afge','G':'afedc','H':'fgebc','I':'bc','J':'bcd',
     'K':'fge','L':'fed','M':'afbc','N':'febc','O':'abcdef','P':'abfge','Q':'abfcg','R':'abfgec','S':'afgcd','T':'fged',
     'U':'febcd','V':'ebcd','W':'febcdg','X':'fgebc','Y':'fgbcd','Z':'abged','-':'g','+':'g','=':'gd'}
LINES={'a':((0,1),(1,1)),'b':((1,1),(1,.5)),'c':((1,.5),(1,0)),'d':((0,0),(1,0)),
       'e':((0,0),(0,.5)),'f':((0,.5),(0,1)),'g':((0,.5),(1,.5))}
def glyphs(text,height=4,depth=.18):
    shapes=[]; w=height*.55; thick=height*.11
    for n,ch in enumerate(str(text).upper()):
        ox=n*w*1.42
        if ch=='.': shapes.append(box(thick,thick,depth,(ox,0,0))); continue
        for seg in SEG.get(ch,''):
            a,b=LINES[seg]; x1,y1=a[0]*w+ox,a[1]*height; x2,y2=b[0]*w+ox,b[1]*height
            shapes.append(box(max(abs(x2-x1),thick),max(abs(y2-y1),thick),depth,((x1+x2)/2,(y1+y2)/2,0)))
        if ch=='+': shapes.append(box(thick,height*.7,depth,(ox+w/2,height*.5,0)))
    return compound(shapes) if shapes else None

class Build:
    def __init__(self,asset):
        self.asset=asset; self.spec=SPEC['assets'][asset]; self.req=REQS[asset]
        self.parts=[]; self.terms=[]; self.features=[]; self.markings=[]; self.oracles=[]
        self.dyn={g['name']:{'group':g['name'],'pivot_mm':g['pivot_mm'],'axis':None,'control':g['control'],'range':None} for g in self.req['dynamicGroups']}
    def add(self,name,group,s,color='body',metal=False,glass=False,opacity=1,rough=.45,oracle=None):
        assert s is not None and s.isValid(), (self.asset,name,'invalid BRep')
        if isinstance(color,str): color=COL.get(color,[.3,.3,.3])
        assert not any(t['name']==name for t in self.parts),name
        self.parts.append({'name':name,'group':group,'shape':s,'color':color,'metal':metal,'glass':glass,'opacity':opacity,'roughness':rough})
        if oracle is not None:self.oracles.append({'part':name,**oracle})
        return s
    def text(self,text,p,height=4,group='markings',d=(0,0,1),color='white',label=None):
        s=glyphs(text,height)
        if s is not None:self.add('mark_'+str(len(self.markings)),group,place(s,p,d),color)
        self.markings.append({'text':str(text),'position_mm':list(p),'height_mm':height,'semantic':label or str(text)})
    def base(self):
        x,y,z=self.spec['size']; self.add('rounded_insulating_base','body',rounded_base(x,y,z),'body')
        for a in [-1,1]:
            for b in [-1,1]:
                self.add('foot_%s_%s'%(a,b),'insulators',cyl(5,2,(a*(x/2-10),b*(y/2-10),-2)),'black')
                self.add('base_screw_%s_%s'%(a,b),'conductors',slotted_screw(a*(x/2-8),b*(y/2-8),z),'steel',True)
    def terminal(self,id,p,d=(0,0,1),group='conductors',pol=None):
        t=SPEC['terminal']; r=t['outerRadius']; bore=t['boreRadius']; h=t['height']; cross=t['crossBoreRadius']; cap=t['capHeight']
        # Axis hole is real and open through cap; horizontal cross bore intersects it.
        shaft=cyl(r,h-cap,(0,0,-h)).cut(cyl(bore,h+2,(0,0,-h-1)))
        shaft=shaft.cut(cyl(cross,2*r+2,(-r-1,0,-7),(1,0,0)))
        capshape=tube(t['capRadius'],bore,cap,(0,0,-cap)).cut(box(2*t['capRadius']+2,t['slotWidth'],t['slotDepth']+1,(0,0,-t['slotDepth'])))
        collar=tube(t['collarRadius'],r+.2,t['collarHeight'],(0,0,-h-t['collarHeight']))
        sid=re.sub('[^a-zA-Z0-9]','_',id) or 'minus'
        name='terminal_'+sid+'_'+str(len(self.terms))
        self.add(name+'_post',group,place(shaft,p,d),'copper',True,rough=.26)
        self.add(name+'_cap',group,place(capshape,p,d),'copper',True,rough=.23)
        self.add(name+'_collar',group if group!='conductors' else 'insulators',place(collar,p,d),'red' if pol=='+' else 'black')
        # Separate lower threaded pin and washer remain conductive.
        pin=cyl(1.5,5,(0,0,-h-5))
        self.add(name+'_pin',group,place(pin,p,d),'copper',True,oracle={'kind':'cylinder','radius':1.5,'height':5,'volume_mm3':PI*1.5**2*5})
        rec={'id':id,'p':list(p),'d':list(d),'group':group,'polarity':pol,'mouthDiameter_mm':2*bore,'shaftPart':name+'_post','capPart':name+'_cap','design':'owned new anchor; no old geometry inferred','dynamicBinding':group if group in self.dyn else None}
        self.terms.append(rec)
        self.features.append({'kind':'terminal-channel','terminal':id,'origin':list(p),'direction':list(d),'post':name+'_post','cap':name+'_cap','probeLocal':{'axialVoid':[0,0,-5],'crossVoid':[3,0,-7],'wall':[3.8,0,-4],'capSlotVoid':[4,0,-.3],'capWall':[0,3.7,-.3]},'boreDiameter_mm':2*bore,'crossDiameter_mm':2*cross,'slotWidth_mm':t['slotWidth'],'slotDepth_mm':t['slotDepth']})
    def standard_terms(self,ids=None,pairs=None,z=None):
        ids=ids or [t['id'] for t in self.req['terminals']]
        x,y,bz=self.spec['size']; z=z if z is not None else bz+15.2
        if pairs is None:pairs=[(-x*.36,0),(x*.36,0)]
        for id,xy in zip(ids,pairs):self.terminal(id,(*xy,z),pol='+' if id=='+' else '-' if id=='-' else None)
    def dynamic(self,g,axis,range,mode=None):
        self.dyn[g].update(axis=axis,range=range,mode=mode or self.dyn[g]['control'])
    def shell(self,x,y,h,t,p=(0,0,0),name='hollow_case'):
        s=box(x,y,h,p).cut(box(x-2*t,y-2*t,h,(p[0],p[1],p[2]+t)))
        self.add(name,'body',s,'body'); self.features.append({'kind':'shell','part':name,'wall_mm':t,'outer_mm':[x,y,h],'origin':list(p)})
        return s
    def save(self):
        out=ROOT/'out'/self.asset; (out/'parts').mkdir(parents=True,exist_ok=True);(out/'groups').mkdir(exist_ok=True)
        meshes=[]; scene=trimesh.Scene(); groups={}; actual=[]
        for part in self.parts:
            name=part['name']; s=part['shape']; group=part['group']; pivot=np.array(self.dyn.get(group,{}).get('pivot_mm',[0,0,0]),float)
            local=s.translate(vec(-pivot)); cq.exporters.export(local,str(out/'parts'/(name+'.step')))
            # Preserve topologically independent touching solids (glyph strokes) rather than
            # welding coincident vertices across separate bodies into nonmanifold edges.
            solid_meshes=[]
            if hasattr(s,'owned_helix'):
                m=analytic_helix_mesh(s.owned_helix,pivot)
                self.features.append({'kind':'analytic-helix-mesh','part':name,**s.owned_helix,'runtimeApproximation':'Lead-authorized 12 samples/turn octagonal wire LOD','errorBoundInterpretation':'analytic estimate, validated by discrete bilateral surface samples; not guaranteed continuous Hausdorff bound','centerSamplesPerTurn':12,'crossSectionSides':8,'maxSagitta_mm':(s.owned_helix['radius']+s.owned_helix['wire'])*(1-math.cos(PI/12))+s.owned_helix['wire']*(1-math.cos(PI/8))})
            else:
                for solid in local.Solids():
                    BRepMesh_IncrementalMesh(solid.wrapped,SPEC['precision']['linear'],False,SPEC['precision']['angular'],False).Perform()
                    vs,fs=solid.tessellate(SPEC['precision']['linear'],SPEC['precision']['angular'])
                    verts=np.array([[v.x,v.y,v.z] for v in vs],dtype=float); faces=np.array(fs,dtype=int)
                    sm=trimesh.Trimesh(verts,faces,process=True);sm.update_faces(sm.nondegenerate_faces());sm.update_faces(sm.unique_faces());sm.remove_unreferenced_vertices();sm.fix_normals(multibody=True)
                    solid_meshes.append(sm)
                m=trimesh.util.concatenate(solid_meshes)
            assert m.is_watertight,(self.asset,name,'mesh not watertight')
            assert m.is_winding_consistent,(self.asset,name,'mesh winding')
            rgba=[int(c*255) for c in part['color']]+[int(part['opacity']*255)]
            m.visual=trimesh.visual.ColorVisuals(mesh=m,vertex_colors=rgba)
            mat=trimesh.visual.material.PBRMaterial(name=name,baseColorFactor=rgba,metallicFactor=.85 if part['metal'] else 0,roughnessFactor=part['roughness'],alphaMode='BLEND' if part['opacity']<1 else 'OPAQUE',doubleSided=False)
            m.visual=trimesh.visual.TextureVisuals(material=mat)
            transform=np.eye(4);transform[:3,3]=pivot
            scene.add_geometry(m,geom_name=name,node_name=name,transform=transform)
            meshes.append({k:part[k] for k in ['name','group','color','metal','glass','opacity','roughness']}|{'posB64':base64.b64encode(np.asarray(m.vertices,dtype='<f4').tobytes()).decode('ascii'),'idxB64':base64.b64encode(np.asarray(m.faces,dtype='<u4').tobytes()).decode('ascii'),'positionCount':len(m.vertices),'triangleCount':len(m.faces),'posByteLength':len(m.vertices)*12,'idxByteLength':len(m.faces)*12,'posSha256':hashlib.sha256(np.asarray(m.vertices,dtype='<f4').tobytes()).hexdigest(),'idxSha256':hashlib.sha256(np.asarray(m.faces,dtype='<u4').tobytes()).hexdigest(),'assemblyOffset_mm':pivot.tolist()})
            groups.setdefault(group,[]).append(local)
            bb=local.BoundingBox();actual.append({'name':name,'group':group,'brepVolume_mm3':local.Volume(),'meshVolume_mm3':m.volume,'solids':len(local.Solids()),'bbox_mm':[bb.xlen,bb.ylen,bb.zlen],'vertices':len(m.vertices),'triangles':len(m.faces)})
        for g,shapes in groups.items():cq.exporters.export(compound(shapes),str(out/'groups'/(g+'.step')))
        cq.exporters.export(compound([p['shape'] for p in self.parts]),str(out/'group.step'))
        (out/(self.asset+'.glb')).write_bytes(scene.export(file_type='glb'))
        assert sum(p['triangles'] for p in actual)<=60000,(self.asset,'runtime triangle budget exceeded',sum(p['triangles'] for p in actual))
        dump(out/'scene.json',{'schema':'owned-cad-scene/1','units':'mm','up':'Z','asset':self.asset,'encoding':{'version':'typed-arrays/1','positions':'base64 Float32LE','indices':'base64 Uint32LE'},'groups':list(groups),'meshes':meshes})
        required=self.req['requiredFunctionalGroups']; missing=set(required)-set(groups)
        assert not missing,(self.asset,'missing groups',missing)
        manifest={'schema':'owned-electric-manifest/1','asset':self.asset,'replacementReady':False,'integrationStatus':'isolated-unconnected','specification':self.spec,'sourceClosure':{p.name:sha(p) for p in [ROOT/'build.py',ROOT/'design-specs.json',ROOT/'requirements.json',ROOT/'contract.json',ROOT/'verify.py']},'dependencies':{'python':platform.python_version(),'cadquery':cq.__version__,'trimesh':trimesh.__version__,'numpy':np.__version__},'groups':list(groups),'requiredGroups':required,'dynamicGroups':list(self.dyn.values()),'terminals':self.terms,'markings':self.markings,'features':self.features,'analyticOracles':self.oracles,'parts':actual,'coordinateAdapter':{'scale':.001,'cadToRuntime':'[x,y,z] -> [x,z,-y]','dynamicMeshCoordinates':'pivot-relative','staticMeshCoordinates':'construction-local','assemblyOffset_mm':'presentation reconstruction only; runtime mounts dynamic geometry under pivot group','terminalRule':'world = instance * currentDynamicGroupTransform * p; evaluate plateB each frame'},'baselineGeometry':'unknown: no old geometry read; this is registered independent design, not yet runtime fidelity acceptance','pending':['runtime integration','circuit behavior','browser appearance','performance','review']}
        dump(out/'manifest.json',manifest)
        dump(out/'file-hashes.json',{str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file() and p.name not in ['file-hashes.json','verification.json']})
        print(json.dumps({'asset':self.asset,'parts':len(self.parts),'groups':len(groups),'triangles':sum(p['triangles'] for p in actual),'sceneBytes':(out/'scene.json').stat().st_size},ensure_ascii=True),flush=True)

def meter(b):
    # Local panel XY is tilted 60 degrees around X, exactly giving public normal.
    pivot=np.array([0,-28.9,110.25]); d=(0,-math.sqrt(3)/2,.5)
    def panel(s):return s.rotate((0,0,0),(1,0,0),60).translate(vec(pivot))
    b.add('meter_rear_shell','body',panel(box(138,112,34,(0,10,-37)).cut(box(133.2,107.2,36,(0,10,-34.6)))),'body')
    # Hollow wedge support and rear stand; face opening is kept clear.
    b.add('meter_plinth','body',rounded_base(142,126,10),'body')
    for x in [-48,48]:
        b.add('support_'+str(x),'insulators',box(7,45,66,(x,25,10)),'black')
        b.add('support_screw_'+str(x),'conductors',slotted_screw(x,35,76),'steel',True)
    face=box(130,104,1.6,(0,10,-2.4))
    b.add('dial_face','insulators',panel(face),'white')
    bezel=box(138,112,3.6,(0,10,-.8)).cut(box(126,92,5,(0,15,-1)))
    b.add('window_bezel','body',panel(bezel),'black')
    b.add('thin_window','body',panel(box(126,92,.75,(0,15,2.2))),'glass',glass=True,opacity=.22,rough=.08,oracle={'kind':'box','size':[126,92,.75],'volume_mm3':126*92*.75})
    b.add('mirror_arc','conductors',panel(tube(48,43,.22,(0,0,-.5)).intersect(box(112,35,2,(0,39,-1)))),'steel',True,rough=.06)
    # Arc scales: needle default +Y. Labels on two radii retain both ranges.
    ticks=[]; sweep=b.spec['sweep_deg']; start=-sweep/2
    for i in range(31):
        a=math.radians(start+sweep*i/30); length=5 if i%5==0 else 2.7
        for r in ([48,38] if b.asset!='galvanometer' else [48]):
            s=box(.38,length,.25,(0,r-length/2,-.2)).rotate((0,0,0),(0,0,1),-math.degrees(a));ticks.append(panel(s))
    b.add('calibrated_scale_ticks','markings',compound(ticks),'black')
    ranges=b.spec['scale'] if b.asset!='galvanometer' else [300]
    for row,maximum in enumerate(ranges):
        for j in range(7):
            a=math.radians(start+sweep*j/6);r=57 if row==0 else 30
            value=maximum*j/6 if b.asset!='galvanometer' else -300+600*j/6
            txt=('%g'%value)
            s=glyphs(txt,3.2);pos=(-math.sin(a)*r-2,math.cos(a)*r,0)
            b.add('scale_value_%d_%d'%(row,j),'markings',panel(s.translate(vec(pos))),'black')
            b.markings.append({'text':txt,'scale':maximum,'index':j,'range':[-300,300] if b.asset=='galvanometer' else [0,maximum]})
    b.text('UA' if b.asset=='galvanometer' else 'A' if b.asset=='ammeter' else 'V',tuple(pivot+np.array([0,0,2])),5,d=d,color='black')
    # Needle and hub share dynamic pivot; world construction saved relative to it.
    needle=cq.Workplane('XY').polyline([(-.65,-9),(.65,-9),(.22,48),(-.22,48)]).close().extrude(.45).val()
    b.add('pointer','needle',panel(needle.translate((0,0,1.15))),'red')
    b.add('pointer_hub','needle',panel(cyl(3.4,1.1,(0,0,.4))),'black')
    b.add('moving_coil','conductors',panel(tube(8,6,3,(0,0,-12))),'copper',True)
    b.add('movement_yoke','conductors',panel(tube(13,9,5,(0,0,-18))),'steel',True)
    b.dynamic('needle',list(d),[-55,55] if b.asset=='galvanometer' else [-60,60],'rotate-deg')
    ids=[t['id'] for t in b.req['terminals']];xs=[-43,0,43] if len(ids)==3 else [-38,38]
    for id,x in zip(ids,xs):b.terminal(id,(x,-63.8,66.9),d,pol='-' if id=='-' else '+')
    b.features.append({'kind':'meter-scale','divisions':30,'ranges':b.spec['scale'],'sweep_deg':sweep,'panelAngle_deg':60})

def supply(b):
    b.shell(168,118,80,2.2,(0,0,4));b.add('bottom_cover','body',box(168,118,2.2,(0,0,1.8)),'steel',True)
    # Real vent slots through the removable top sheet.
    top=box(168,118,2.2,(0,0,84))
    for x in range(-60,64,8):top=top.cut(box(3,43,4,(x,22,83)))
    b.add('vented_top','body',top,'body'); b.features.append({'kind':'vent-slots','part':'vented_top','width_mm':3,'count':16})
    for x in [-72,72]:
        for y in [-47,47]:b.add('case_fastener_%s_%s'%(x,y),'conductors',slotted_screw(x,y,86.2),'steel',True)
    # Front normal -Y, original segment digits are actual small extruded solids.
    d=(0,-1,0);b.add('display_recess','insulators',place(box(80,32,1),( -18,-60,58),d),'black')
    for i,text in enumerate(['03.0','2.00']):b.text(text,(-48,-61.2,51+14*i),6,d=d,color='green',label='voltage/current segment display')
    b.text('CV CC OFF',(-62,-61.5,33),3,d=d,color='white')
    kp=(48,-56.4,50.5)
    b.add('voltage_knob','knob',place(cyl(11,8),kp,d),'black')
    b.add('knob_pointer','knob',box(1.3,1,8,(48,-65.2,51)),'white')
    for a in range(0,360,15):
        s=box(.7,1,6,(48,-65,50.5)).translate((10*math.cos(math.radians(a)),0,10*math.sin(math.radians(a))))
        b.add('knob_knurl_'+str(a),'knob',s,'black')
    b.dynamic('knob',[0,1,0],[0,270],'rotate-deg')
    rp=(-62,-52.4,31.45)
    b.add('power_rocker','rocker',box(15,7,11,(-62,-57,26)),'red');b.dynamic('rocker',[1,0,0],[-.28,0],'rotate-rad')
    b.add('status_lamp','lamp',place(cyl(2.4,1),(-21,-60.3,27),d),'green')
    b.terminal('+',(12,-73,20),d,pol='+');b.terminal('-',(-12,-73,20),d,pol='-')
    # Functional linear supply chain: transformer, PCB, heatsink, rectifier/capacitors.
    b.add('pcb','insulators',box(122,78,1.6,(0,0,9)),'green')
    b.add('transformer_laminations','conductors',box(47,43,34,(-38,10,11)).cut(box(22,47,20,(-38,10,18))),'steel',True)
    b.add('transformer_bobbin','insulators',box(20,36,22,(-38,10,17)).cut(box(13,40,12,(-38,10,22))),'black')
    b.add('transformer_winding','conductors',helix(14,1.2,32,.48,(-53,10,28)),'copper',True)
    for x in [20,38]:b.add('filter_cap_'+str(x),'conductors',cyl(7.5,26,(x,15,11)),'blue')
    b.add('rectifier','conductors',box(13,13,4,(27,-18,12)),'black')
    for x in range(5,65,5):b.add('heatsink_fin_'+str(x),'conductors',box(1.4,21,28,(x,40,12)),'steel',True)
    b.features.append({'kind':'supply-chain','components':['transformer','rectifier','filter-capacitors','heatsink','pcb'],'states':['OFF','CV','CC']})

def battery(b):
    b.base();b.standard_terms(pairs=[(-61,-27),(61,-27)])
    for i,y in enumerate([-17,17]):
        # Hollow cradles, two independently visible cells with metal caps.
        cradle=box(67,29,13,(0,y,12)).cut(box(63,25,15,(0,y,14)))
        b.add('cell_cradle_'+str(i),'insulators',cradle,'black')
        b.add('cell_sleeve_'+str(i),'body',tube(12.2,11.7,53,(-26.5,y,27),(1,0,0)),'blue',oracle={'kind':'tube','ro':12.2,'ri':11.7,'height':53,'volume_mm3':PI*(12.2**2-11.7**2)*53})
        b.add('cell_internal_'+str(i),'conductors',cyl(11.6,51,(-25.5,y,27),(1,0,0)),'black')
        for side in [-1,1]:b.add('cell_cap_%d_%d'%(i,side),'conductors',cyl(12,1.2,(side*26.5,y,27),(side,0,0)),'steel',True)
        sign=1 if i==0 else -1
        b.add('cell_positive_'+str(i),'conductors',cyl(3.3,1.4,(sign*27.7,y,27),(sign,0,0)),'steel',True)
        b.add('contact_spring_'+str(i),'conductors',helix(4.5,1.6,6,.55,(-34,y,27)),'steel',True)
        b.text('+',(-10,y-4,39.3),5,color='white')
    b.add('series_bridge','conductors',box(3,45,1.2,(34,0,26)),'copper',True)
    for x in [-61,61]:b.add('output_bus_'+str(x),'conductors',box(28,3,1.2,(x/1.4,-27,12.3)),'copper',True)
    b.text('2 X 1.5V',(-24,30,12.1),4)

def rheostat(b):
    b.base();b.standard_terms(pairs=[(-93,-32),(93,-32),(-93,32),(93,32)])
    for x in [-78,78]:
        b.add('porcelain_support_'+str(x),'insulators',box(14,48,28,(x,0,12)),'insulator')
        b.add('rail_bracket_'+str(x),'conductors',tube(5,3,8,(x,0,64),(1,0,0)),'steel',True)
    b.add('ceramic_tube','insulators',tube(14.5,11.5,144,(-72,0,37),(1,0,0)),'insulator',oracle={'kind':'tube','ro':14.5,'ri':11.5,'height':144,'volume_mm3':PI*(14.5**2-11.5**2)*144})
    b.add('resistance_winding','conductors',helix(15.5,2,144,.55,(-72,0,37)),'steel',True)
    b.add('slider_rail','conductors',cyl(3,170,(-85,0,64),(1,0,0)),'steel',True)
    # Slider neutral construction is x=0, runtime moves to -66+130s.
    b.add('slider_sleeve','slider',tube(5.5,3.15,11,(-5.5,0,64),(1,0,0)),'copper',True)
    b.add('slider_contact','slider',box(3,5,12,(0,0,51.5)),'copper',True)
    b.add('slider_handle','slider',box(18,14,8,(0,0,70)),'black')
    b.dynamic('slider',[1,0,0],[-66,64],'translate-mm')
    ticks=[]
    for i in range(27):ticks.append(box(.45,5 if i%5==0 else 2.5,.2,(-66+i*5,-38,12.1)))
    b.add('travel_ticks','markings',compound(ticks),'white');b.text('20 50 200 OHM',(-48,39,12.1),3)
    for x in [-85,85]:b.add('end_conductor_'+str(x),'conductors',rod((x,0,37),(x,-30,24),1.4),'copper',True)
    b.features.append({'kind':'winding','turns':72,'axis':[1,0,0],'pitch_mm':2,'sliderTravel_mm':[-66,64]})

def knife(b):
    b.base();b.standard_terms(pairs=[(-52,-20),(52,-20)])
    for x in [-38,40]:
        b.add('terminal_support_'+str(x),'insulators',box(18,25,7,(x,0,10)),'insulator')
        # Two parallel spring jaws leave an actual blade clearance.
        for y in [-6.4,6.4]:b.add('jaw_%s_%s'%(x,y),'conductors',box(12,1.8,12,(x,y,17)),'copper',True)
    b.add('hinge_pin','conductors',cyl(2.3,18,(-38,-9,23),(0,1,0)),'steel',True)
    b.add('knife_blade','blade',box(78,10,2,(1,0,22)),'copper',True)
    b.add('insulated_handle','blade',box(23,16,10,(29,0,24)),'black')
    b.dynamic('blade',[0,1,0],[0,PI/4],'rotate-rad')
    b.text('ON OFF',(-22,22,10.1),4)

def dpdt(b):
    b.base();ids=['A1','C1','B1','A2','C2','B2'];pairs=[(-24,-48),(-24,0),(-24,48),(24,-48),(24,0),(24,48)]
    b.standard_terms(ids,pairs,27)
    for x in [-24,24]:
        for y in [-43,43]:
            b.add('jaw_pedestal_%s_%s'%(x,y),'insulators',box(20,14,7,(x,y,10)),'insulator')
            for xx in [-5.9,5.9]:b.add('jaw_%s_%s_%s'%(x,y,xx),'conductors',box(1.5,13,10,(x+xx,y,20)),'copper',True)
        b.add('independent_blade_'+str(x),'blade',box(9,43,2,(x,-21.5,26)),'copper',True)
        b.add('hinge_'+str(x),'conductors',cyl(2,17,(x-8.5,0,27),(1,0,0)),'steel',True)
    b.add('linked_insulating_handle','blade',box(65,13,9,(0,-32,28)),'black')
    b.dynamic('blade',[1,0,0],[0,PI/2,PI],'rotate-rad');b.text('A  OFF  B',(-40,54,10.1),3)

def lamp(b):
    b.base();b.standard_terms(pairs=[(-43,-19),(43,-19)])
    b.add('socket_porcelain','insulators',tube(18,8,19,(0,0,10)),'insulator')
    b.add('socket_contact_liner','conductors',tube(8.1,7.3,13,(0,0,15)),'copper',True)
    b.add('screw_shell','conductors',tube(7.2,6.5,17,(0,0,23)),'steel',True)
    b.add('thread_helix','conductors',helix(7.2,2.4,14,.6,(0,0,24),axis='z'),'steel',True)
    b.add('center_contact','conductors',cyl(2.2,2.5,(0,0,20)),'copper',True)
    b.add('contact_separator','insulators',tube(6.4,2.4,2,(0,0,21)),'black')
    # Revolved inner/outer profile, neck open; continuous true thin wall bulb.
    outline=[(7,0),(7,5),(10,9),(14,14),(16,21),(15,28),(11,34),(5,38),(0,39), (0,38.2),(4.7,37.2),(10.4,33.3),(14.2,27.5),(15.2,21),(13.3,14.4),(9.3,9.5),(6.2,5),(6.2,0)]
    glass=cq.Workplane('XZ').polyline(outline).close().revolve(360,(0,0),(0,1)).val().translate((0,0,37))
    b.add('hollow_bulb','glass',glass,'glass',glass=True,opacity=.2,rough=.08)
    for x in [-3,3]:b.add('filament_support_'+str(x),'conductors',rod((x,0,35),(x,0,58),.38),'steel',True)
    b.add('coiled_tungsten','filament',helix(1.1,.8,6,.17,(-3,0,58)),'steel',True)
    b.text('2.5 3.8 6.3 V',(-36,25,10.1),3)
    b.features.append({'kind':'bulb-wall','part':'hollow_bulb','wall_mm':.8,'neckInnerRadius_mm':6.2})

def resistor(b):
    b.base();b.standard_terms(pairs=[(-47,0),(47,0)])
    for x in [-26,26]:b.add('ceramic_standoff_'+str(x),'insulators',cyl(4.5,13,(x,0,9)),'insulator')
    b.add('ceramic_resistor','heat',cyl(5,42,(-21,0,26),(1,0,0)),'insulator',oracle={'kind':'cylinder','radius':5,'height':42,'volume_mm3':PI*25*42})
    colors={'brown':[.28,.12,.04],'red':COL['red'],'black':COL['black'],'green':COL['green'],'gold':[.78,.61,.17]}
    for i,band in enumerate(b.spec['bands']):b.add('band_'+str(i),'markings',tube(5.15,5.02,2,(-14+i*8,0,26),(1,0,0)),colors[band],band=='gold')
    for a,c in [((-47,0,21),(-21,0,26)),((21,0,26),(47,0,21))]:b.add('axial_lead_'+str(len(b.parts)),'conductors',rod(a,c,.8),'copper',True)
    b.text(str(b.spec['resistance'])+' OHM 2W',(-26,16,9.1),3)

def resbox(b):
    b.shell(220,104,52,2.2,(0,0,2));b.add('top_panel','body',box(220,104,2.2,(0,0,54)),'black')
    for i,(g,x) in enumerate(zip(['k1000','k100','k10','k1'],[-78,-26,26,78])):
        b.add('dial_knob_'+g,g,cyl(12.5,9,(x,8,61)),'black')
        b.add('knob_index_'+g,g,box(1.5,10,.6,(x,16,70)),'white')
        for j in range(10):
            a=2*PI*j/10;b.text(j,(x+19*math.sin(a)-1,8+19*math.cos(a)-2,56.4),3)
        b.text('X'+str(10**(3-i)),(x-12,-27,56.4),3.2)
        b.dynamic(g,[0,0,1],[0,324],'digit-deg')
        # Real individual decade resistor network inside the openable case.
        for j in range(9):b.add('decade_resistor_%d_%d'%(i,j),'insulators',cyl(2,13,(x-17+j*4,-18,25),(0,1,0)),'insulator')
        b.add('decade_contact_ring_'+g,'conductors',tube(15,12,1,(x,8,47)),'copper',True)
    b.standard_terms(pairs=[(-92,-34),(92,-34)],z=71.4)

def fuse(b):
    b.base();b.standard_terms(pairs=[(-47,0),(47,0)])
    for x in [-25,25]:
        b.add('fuse_pedestal_'+str(x),'insulators',box(15,22,9,(x,0,10)),'insulator')
        ring=tube(6.5,5.25,9,(x-4.5,0,26),(1,0,0)).cut(box(14,7,8,(x,0,29)))
        b.add('spring_clip_'+str(x),'conductors',ring,'copper',True)
        b.add('end_cap_'+str(x),'conductors',tube(5.5,4.5,8,(x-4,0,26),(1,0,0)),'steel',True)
    b.add('fuse_glass_tube','glass',tube(5.2,4.4,40,(-20,0,26),(1,0,0)),'glass',glass=True,opacity=.2,rough=.08,oracle={'kind':'tube','ro':5.2,'ri':4.4,'height':40,'volume_mm3':PI*(5.2**2-4.4**2)*40})
    b.add('fusible_wire','element',rod((-28,0,26),(28,0,26),.16),'steel',True,oracle={'kind':'cylinder','radius':.16,'height':56,'volume_mm3':PI*.16**2*56})
    b.text('0.5 1 2 A',(-28,20,10.1),3.5)

def capacitor(b):
    b.base()
    for y in [-48,48]:b.add('linear_rail_'+str(y),'conductors',box(182,5,5,(0,y,10)),'steel',True)
    # Inner faces at x=-16 and +16, so separation is exactly 32mm.
    b.add('fixed_plate_A','conductors',box(2,90,100,(-17,0,27)),'steel',True,oracle={'kind':'box','size':[2,90,100],'volume_mm3':18000})
    b.add('moving_plate_B','plateB',box(2,90,100,(17,0,27)),'steel',True,oracle={'kind':'box','size':[2,90,100],'volume_mm3':18000})
    b.add('fixed_plate_mount','insulators',box(15,98,9,(-17,0,17)),'insulator')
    b.add('moving_plate_mount','plateB',box(15,98,9,(17,0,17)),'insulator')
    b.add('dielectric_sheet','dielectric',box(6,88,98,(0,0,28)),'insulator',opacity=.7,oracle={'kind':'box','size':[6,88,98],'volume_mm3':6*88*98})
    b.add('dielectric_grip','dielectric',box(17,20,6,(0,0,126)),'black')
    b.terminal('A',(-17,-56,39),group='conductors');b.terminal('B',(17,-56,39),group='plateB')
    b.dynamic('plateB',[1,0,0],[0,64],'translate-mm');b.dynamic('dielectric',[0,0,1],[0,135],'translate-mm')
    b.text('32  64  96 MM',(-31,52,10.1),3)
    b.features.append({'kind':'plate-separation','plateA':'fixed_plate_A','plateB':'moving_plate_B','area_mm2':9000,'minimumGap_mm':32,'maximumGap_mm':96,'dynamicGroup':'plateB'})

def motor(b):
    b.base();b.standard_terms(pairs=[(-78,-48),(78,-48)])
    # Pedestals and split bearing races; visible poles leave rotor air gap.
    for x in [-62,62]:
        b.add('bearing_pedestal_'+str(x),'insulators',box(12,28,71,(x,0,10)),'body')
        b.add('bearing_race_'+str(x),'conductors',tube(8,3.35,9,(x-4.5,0,90),(1,0,0)),'steel',True)
    for side in [-1,1]:
        b.add('magnet_'+str(side),'body',box(62,18,49,(0,side*40,65.5)),'red' if side>0 else 'blue')
        b.add('pole_shoe_'+str(side),'conductors',box(64,6,49,(0,side*28.5,65.5)),'steel',True)
    b.add('shaft','rotor',cyl(3.2,158,(-78,0,90),(1,0,0)),'steel',True,oracle={'kind':'cylinder','radius':3.2,'height':158,'volume_mm3':PI*3.2**2*158})
    b.add('rotor_laminations','rotor',box(58,18,34,(0,0,73)),'steel',True)
    # Individual rectangular armature turns with central air opening.
    for i in range(16):
        outer=box(1.8,35,46,(-28+i*3.7,0,67)).cut(box(3,29,40,(-28+i*3.7,0,70)))
        b.add('armature_turn_'+str(i),'rotor',outer,'copper',True)
    # Two half-shell commutator segments have a real insulated longitudinal gap.
    comm=tube(12,4,18,(57,0,90),(1,0,0))
    for y in [-1,1]:b.add('commutator_'+str(y),'rotor',comm.intersect(box(22,11.1,28,(66,y*6.45,76))),'copper',True)
    b.add('commutator_insulator','rotor',tube(3.9,3.25,18,(57,0,90),(1,0,0)),'black')
    for y in [-1,1]:
        b.add('carbon_brush_'+str(y),'conductors',box(8,8,8,(72,y*14,86)),'black')
        b.add('brush_spring_'+str(y),'conductors',helix(2,1,8,.35,(72,y*21,90),axis='z'),'steel',True)
        b.add('brush_arm_'+str(y),'conductors',rod((72,y*24,90),(76,y*36,24),1),'copper',True)
    b.dynamic('rotor',[1,0,0],[-360,360],'continuous-rotation-deg');b.text('N   S',(-18,51,10.1),4)
    b.features.append({'kind':'motor','axis':[1,0,0],'brushContacts_mm':[[72,-12,90],[72,12,90]],'commutatorSplit':True})

def solenoid(b):
    b.base();b.standard_terms(pairs=[(-86,-29),(86,-29)])
    b.add('hollow_bobbin','insulators',tube(13.2,12,96,(-48,0,38),(1,0,0)),'insulator',oracle={'kind':'tube','ro':13.2,'ri':12,'height':96,'volume_mm3':PI*(13.2**2-12**2)*96})
    for x in [-50,48]:b.add('bobbin_flange_'+str(x),'insulators',tube(20,12,2,(x,0,38),(1,0,0)),'insulator')
    b.add('forty_turn_winding','winding',helix(14.2,2.3,92,.8,(-46,0,38)),'copper',True)
    b.add('iron_core','core',cyl(10.5,125,(-62.5,0,38),(1,0,0)),'steel',True,oracle={'kind':'cylinder','radius':10.5,'height':125,'volume_mm3':PI*10.5**2*125})
    b.add('core_handle','core',cyl(14,13,(62.5,0,38),(1,0,0)),'black')
    for x in [-39,39]:b.add('coil_cradle_'+str(x),'body',box(15,39,15,(x,0,10)).cut(cyl(14,19,(x-9.5,0,38),(1,0,0))),'body')
    for x in [-46,46]:b.add('winding_output_'+str(x),'conductors',rod((x,0,52.2),(x,-29,24),.8),'copper',True)
    b.dynamic('core',[1,0,0],[0,108],'translate-mm');b.text('40 TURNS',(-24,30,10.1),3)
    b.features.append({'kind':'winding','turns':40,'pitch_mm':2.3,'axis':[1,0,0],'boreRadius_mm':12,'coreRadius_mm':10.5})

def sensor(b):
    b.base();b.standard_terms(pairs=[(-38,0),(38,0)])
    for x in [-4,4]:b.add('sensor_leg_'+str(x),'conductors',rod((x,0,11),(x,0,37),.7),'steel',True)
    if b.asset=='ntc':
        b.add('thermistor_bead','bead',ball(6,(0,0,40)),'black',oracle={'kind':'sphere','radius':6,'volume_mm3':4/3*PI*6**3})
        b.text('NTC 0 100 C',(-30,19,9.1),3)
    else:
        b.add('ceramic_disc','insulators',cyl(13,2,(0,0,36)),'insulator')
        tracks=[]
        for i in range(7):
            y=-9+i*3;tracks.append(box(18,.65,.28,(0,y,38.1)))
            if i<6:tracks.append(box(.65,3,.28,((9 if i%2==0 else -9),y+1.5,38.1)))
        b.add('serpentine_photosensitive_layer','layer',compound(tracks),'red')
        b.add('protective_clear_disc','body',cyl(13,.5,(0,0,38.5)),'glass',glass=True,opacity=.18)
        b.text('LDR 0 1000 LX',(-34,19,9.1),2.7)

def led(b):
    b.base();b.terminal('+',(30,-10,20.5),pol='+');b.terminal('-',(-30,-10,20.5),pol='-')
    resin=cyl(5,9,(0,0,23)).fuse(ball(5,(0,0,32)).intersect(box(12,12,6,(0,0,32)))).cut(box(3,13,19,(-5.6,0,22)))
    b.add('led_resin_flat_side','resin',resin,'red',glass=True,opacity=.35,rough=.1)
    b.add('resin_flange','resin',cyl(5.7,1.2,(0,0,23)).cut(box(3,13,3,(-6,0,22))),'red',glass=True,opacity=.35)
    b.add('long_anode_lead','conductors',rod((2,0,9),(2,0,29),.55),'steel',True)
    b.add('short_cathode_lead','conductors',rod((-2,0,13),(-2,0,29),.65),'steel',True)
    b.add('die_cup','conductors',cyl(1.6,1,(0,0,28)),'steel',True)
    b.add('semiconductor_die','die',box(1.2,1.2,.45,(0,0,29)),'green')
    b.add('bond_wire','conductors',rod((0,0,29.5),(2,0,31),.09),'copper',True)
    for x in [-1,1]:b.add('terminal_trace_'+str(x),'conductors',rod((x*29,-10,8.8),(x*2,0,11),.7),'copper',True)
    b.text('+   -',(-13,13,8.6),3)

def diode(b):
    b.base();b.terminal('+',(-36,0,24),pol='+');b.terminal('-',(36,0,24),pol='-')
    b.add('axial_rectifier_package','insulators',cyl(4,24,(-12,0,22),(1,0,0)),'black',oracle={'kind':'cylinder','radius':4,'height':24,'volume_mm3':PI*16*24})
    b.add('cathode_band','markings',tube(4.12,4.01,2.3,(7,0,22),(1,0,0)),'white')
    for x in [-1,1]:b.add('rectifier_lead_'+str(x),'conductors',rod((x*12,0,22),(x*35,0,15),.7),'steel',True)
    b.text('+       -',(-23,12,12.1),3)

def elcap(b):
    b.base();b.terminal('+',(28,-12,20.5),pol='+');b.terminal('-',(-28,-12,20.5),pol='-')
    # Can is a thin metal cup, insulating sleeve distinct, rolled top/vent real.
    can=cyl(13,46,(0,0,14)).cut(cyl(12.45,46,(0,0,14.55)))
    b.add('thin_aluminium_can','conductors',can,'steel',True)
    b.add('blue_insulating_sleeve','body',tube(13.25,13.05,43,(0,0,15)),'blue')
    top=cyl(12.4,.6,(0,0,59.4)).cut(box(21,.65,.4,(0,0,59.75))).cut(box(.65,21,.4,(0,0,59.75)))
    b.add('vented_top','conductors',top,'steel',True)
    b.add('rubber_bung','insulators',cyl(12.35,2,(0,0,14.4)),'black')
    b.add('negative_stripe','markings',box(3,.3,36,(-5,-13.24,18)),'white')
    for z in [22,31,40,49]:b.add('stripe_minus_'+str(z),'markings',box(2.2,.3,.65,(-5,-13.57,z)),'black')
    b.add('charge_effect_ring','ring',tube(14.2,13.7,1.3,(0,0,57)),'green')
    b.add('long_positive_pin','conductors',rod((3,0,8),(3,0,15),.6),'copper',True)
    b.add('short_negative_pin','conductors',rod((-3,0,10),(-3,0,15),.6),'copper',True)
    b.text('470 1000 2200 4700',(-33,16,8.6),2)
    b.text('16V',(-6,-13.7,36),3,d=(0,-1,0),color='white')
    b.features.append({'kind':'elcap-can','part':'thin_aluminium_can','radius_mm':13,'height_mm':46,'wall_mm':.55,'ventPart':'vented_top'})

BUILDERS={'ammeter':meter,'voltmeter':meter,'galvanometer':meter,'dcsupply':supply,'battery':battery,'rheostat':rheostat,'switch':knife,'dpdt':dpdt,'lamp':lamp,'resbox':resbox,'fuse':fuse,'capacitor':capacitor,'motor':motor,'solenoid':solenoid,'ntc':sensor,'ldr':sensor,'led':led,'diode':diode,'elcap':elcap,'resistor10':resistor,'resistor20':resistor,'resistor50':resistor}
ORDER=['ammeter','voltmeter','galvanometer','dcsupply','battery','rheostat','switch','dpdt','lamp','resistor10','resistor20','resistor50','resbox','fuse','capacitor','motor','solenoid','ntc','ldr','led','diode','elcap']
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--assets',nargs='*');args=ap.parse_args()
    for asset in args.assets or ORDER:
        start=time.time(); b=Build(asset);BUILDERS[asset](b);b.save();print('finished',asset,round(time.time()-start,2),flush=True)
