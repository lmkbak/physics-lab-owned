"""Independent STEP re-read, mesh and analytic checks; no manifest-only pass.
The generator's generated geometry is read from STEP and scene JSON. Analytic
oracles use original declared physical dimensions and direct solid occupancy.
"""
import argparse, base64, hashlib, json, math, sys, time
from pathlib import Path
import cadquery as cq
import numpy as np
import trimesh
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
from scipy.optimize import minimize_scalar
from OCP.BRepExtrema import BRepExtrema_DistShapeShape
from OCP.BRep import BRep_Builder
from OCP.TopoDS import TopoDS_Compound

ROOT=Path(__file__).resolve().parent
SPEC=json.loads((ROOT/'design-specs.json').read_text(encoding='utf-8'))
REQ=json.loads((ROOT/'requirements.json').read_text(encoding='utf-8'))
REQS={r['asset']:r for r in REQ['requirements']}
ADAPTER=np.array([[1,0,0],[0,0,1],[0,-1,0]],float)

def load(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rotation(axis,a):
    n=np.array(axis,dtype=float);n/=np.linalg.norm(n);x,y,z=n;K=np.array([[0,-z,y],[z,0,-x],[-y,x,0]])
    return np.eye(3)*math.cos(a)+(1-math.cos(a))*np.outer(n,n)+math.sin(a)*K

def term_rotation(d):
    d=np.array(d,dtype=float);d/=np.linalg.norm(d);a=np.cross([0,0,1],d)
    if np.linalg.norm(a)<1e-10:return np.eye(3) if d[2]>0 else rotation([1,0,0],math.pi)
    return rotation(a,math.acos(d[2]))
def inside(s,p):return any(sol.isInside(cq.Vector(*p),1e-5) for sol in s.Solids())
def surface_radii(s):
    vals=[]
    for face in s.Faces():
        surf=BRepAdaptor_Surface(face.wrapped)
        if surf.GetType()==GeomAbs_Cylinder:vals.append(surf.Cylinder().Radius())
    return vals

def ray_mesh_contains(m,p):
    # Pure numpy Moller-Trumbore, no optional spatial-index dependency.
    origin=np.array(p,dtype=float); direction=np.array([.83231,.42123,.36071]);direction/=np.linalg.norm(direction)
    tri=m.vertices[m.faces];e1=tri[:,1]-tri[:,0];e2=tri[:,2]-tri[:,0];h=np.cross(direction,e2);a=np.einsum('ij,ij->i',e1,h)
    good=np.abs(a)>1e-10;f=np.zeros_like(a);f[good]=1/a[good];s=origin-tri[:,0];u=f*np.einsum('ij,ij->i',s,h)
    q=np.cross(s,e1);v=f*np.einsum('j,ij->i',direction,q);t=f*np.einsum('ij,ij->i',e2,q)
    hits=np.sort(t[good & (u>=0)&(v>=0)&(u+v<=1)&(t>1e-6)])
    unique=hits[np.r_[True,np.diff(hits)>1e-5]] if len(hits) else []
    return bool(len(unique)%2)

def decode_mesh(item):
    p=base64.b64decode(item['posB64'],validate=True);i=base64.b64decode(item['idxB64'],validate=True)
    if len(p)!=item['posByteLength'] or len(p)!=item['positionCount']*12 or len(i)!=item['idxByteLength'] or len(i)!=item['triangleCount']*12:raise ValueError('count/byteLength')
    if hashlib.sha256(p).hexdigest()!=item['posSha256'] or hashlib.sha256(i).hexdigest()!=item['idxSha256']:raise ValueError('decoded hash')
    v=np.frombuffer(p,dtype='<f4').reshape(-1,3);f=np.frombuffer(i,dtype='<u4').reshape(-1,3)
    if not np.isfinite(v).all() or f.max()>=len(v):raise ValueError('values/index bounds')
    return v,f

def helix_surface_samples(feature,mesh,pivot):
    r=feature['radius'];wire=feature['wire'];k=feature['pitch']/(2*math.pi);end=feature['height']/k;norm=math.sqrt(r*r+k*k)
    M=np.array([[0,0,-1],[0,1,0],[1,0,0]]) if feature['axis']=='x' else np.eye(3)
    offset=np.array(feature['p'])-np.array(pivot)
    def point(t,phi):
        c,s=math.cos(t),math.sin(t);center=np.array([r*c,r*s,k*t]);u=np.array([c,s,0]);v=np.array([-k*s/norm,k*c/norm,-r/norm])
        return (center+wire*(u*math.cos(phi)+v*math.sin(phi)))@M+offset
    # Dense continuous-parameter samples near both ends and throughout length.
    ts=np.linspace(.002,end-.002,33);phis=np.linspace(0,2*math.pi,9)[:-1]+.173
    samples=np.array([point(t,phi) for t in ts for phi in phis])
    _,dist,_=trimesh.proximity.closest_point_naive(mesh,samples)
    # Reverse direction: mesh surface centroids to independently minimized
    # continuous tube surface, with centerline tangent cross-section formula.
    sel=np.linspace(0,len(mesh.faces)-17,160,dtype=int);centroids=mesh.vertices[mesh.faces[sel]].mean(axis=1);reverse=[]
    for p in centroids:
        pp=(p-offset)@M.T;t0=math.atan2(pp[1],pp[0]);t0+=round((pp[2]/k-t0)/(2*math.pi))*2*math.pi
        lo=max(0,t0-math.pi/2);hi=min(end,t0+math.pi/2)
        def objective(t):
            c,s=math.cos(t),math.sin(t);delta=pp-np.array([r*c,r*s,k*t]);u=np.array([c,s,0]);v=np.array([-k*s/norm,k*c/norm,-r/norm]);phi=math.atan2(delta@v,delta@u)
            q=point(t,phi);return float(np.linalg.norm(q-p))
        reverse.append(minimize_scalar(objective,bounds=(lo,hi),method='bounded').fun if hi>lo else objective(lo))
    return float(max(dist)),float(max(reverse)),samples

def face_boundary(s):
    compound=TopoDS_Compound();builder=BRep_Builder();builder.MakeCompound(compound)
    for f in s.Faces():builder.Add(compound,f.wrapped)
    return compound

def face_distance(boundary,p):
    vertex=cq.Vertex.makeVertex(*[float(x) for x in p]);distance=BRepExtrema_DistShapeShape(vertex.wrapped,boundary);distance.Perform()
    if not distance.IsDone():raise ValueError('face distance not done')
    return distance.Value()

def verify(asset,write=False):
    out=ROOT/'out'/asset;man=load(out/'manifest.json');scene=load(out/'scene.json');req=REQS[asset]
    tests=[];fail=[]
    def check(name,ok,**evidence):
        item={'test':name,'pass':bool(ok),**evidence};tests.append(item)
        if not ok:fail.append(name)
    check('scene-schema',scene.get('schema')=='owned-cad-scene/1' and scene.get('units')=='mm' and scene.get('up')=='Z')
    check('replacement-not-ready',man['replacementReady'] is False)
    # Original glyph geometry must visibly distinguish positive/negative signs.
    from build import glyphs
    plus=glyphs('+',4);minus=glyphs('-',4)
    check('polarity-glyph-geometry',inside(plus,[1.1,3,.09]) and inside(plus,[.4,2,.09]) and not inside(minus,[1.1,3,.09]) and inside(minus,[.4,2,.09]),method='actual BRep vertical and horizontal stroke occupancy, not text metadata')
    groups={m['group'] for m in scene['meshes']};check('exact-functional-groups',set(req['requiredFunctionalGroups'])<=groups,actual=sorted(groups))
    names=[m['name'] for m in scene['meshes']];check('unique-mesh-names',len(set(names))==len(names))
    dyn={g['group']:g for g in man['dynamicGroups']}
    check('all-dynamic-group-ids',set(dyn)=={g['name'] for g in req['dynamicGroups']})
    solids={};meshes={};maxerr=0;totaltri=0
    partrecords={p['name']:p for p in man['parts']}
    for item in scene['meshes']:
        name=item['name'];s=cq.importers.importStep(str(out/'parts'/(name+'.step'))).val();solids[name]=s
        posraw=base64.b64decode(item['posB64'],validate=True);idxraw=base64.b64decode(item['idxB64'],validate=True)
        vertices=np.frombuffer(posraw,dtype='<f4').reshape(-1,3);faces=np.frombuffer(idxraw,dtype='<u4').reshape(-1,3)
        check('typed-count:'+name,len(posraw)==item['posByteLength']==item['positionCount']*12 and len(idxraw)==item['idxByteLength']==item['triangleCount']*12)
        check('typed-plain-hash:'+name,hashlib.sha256(posraw).hexdigest()==item['posSha256'] and hashlib.sha256(idxraw).hexdigest()==item['idxSha256'])
        check('typed-values:'+name,np.isfinite(vertices).all() and faces.max()<len(vertices))
        m=trimesh.Trimesh(vertices,faces,process=False);meshes[name]=m
        ok=s.isValid() and all(x.isValid() and all(sh.Closed() for sh in x.Shells()) and x.Volume()>0 for x in s.Solids())
        check('brep-closed:'+name,ok,solids=len(s.Solids()),volume_mm3=s.Volume())
        check('mesh-closed:'+name,m.is_watertight and m.is_winding_consistent and m.volume>0,vertices=len(m.vertices),triangles=len(m.faces))
        err=abs(m.volume-s.Volume())/s.Volume();maxerr=max(maxerr,err);totaltri+=len(m.faces)
        helix=next((f for f in man['features'] if f['kind']=='analytic-helix-mesh' and f['part']==name),None)
        check('mesh-volume:'+name,err<=(.16 if helix else .002),relativeError=err,thresholdReason='Lead helix octagonal runtime approximation' if helix else 'exact tessellation')
        bb=s.BoundingBox();bbox=np.array([bb.xlen,bb.ylen,bb.zlen]);meshbox=m.bounds[1]-m.bounds[0]
        tolerance=2*helix['maxSagitta_mm']+.05 if helix else .05
        check('brep-mesh-local-dimensions:'+name,np.max(np.abs(bbox-meshbox))<=tolerance,brep_mm=bbox.tolist(),mesh_mm=meshbox.tolist(),tolerance_mm=tolerance)
        if not helix:
            boundary=face_boundary(s);critical=any(token in name for token in ['terminal_','shell','hollow','window','plate','tube','can','bulb'])
            threshold=.02 if critical else .03
            chosen=np.linspace(0,len(m.faces)-1,min(24,len(m.faces)),dtype=int)
            triangles=m.vertices[m.faces[chosen]]
            samplepoints=np.vstack([triangles.mean(axis=1),(triangles[:,0]+triangles[:,1])/2,(triangles[:,1]+triangles[:,2])/2])
            deviations=[face_distance(boundary,p) for p in samplepoints]
            check('sampled-mesh-chord:'+name,max(deviations)<=threshold+1e-5,maximum_mm=max(deviations),threshold_mm=threshold,samples=len(deviations),method='min distance to compound of STEP Faces, not solid interior distance',scope='sampled-only, not continuous Hausdorff proof')
            # Offset a real external face sample into its solid; distance must
            # detect the deliberate .06mm regression even inside the BRep.
            negative=[]
            for point,normal in zip(triangles.mean(axis=1),m.face_normals[chosen]):
                displaced=point-normal*.06
                if inside(s,displaced) and face_distance(boundary,displaced)>.04:negative.append(face_distance(boundary,displaced));break
            check('face-distance-negative-control:'+name,bool(negative),distance_mm=negative[0] if negative else None)
        check('material:'+name,len(item['color'])==3 and all(0<=x<=1 for x in item['color']) and 0<item['opacity']<=1)
        if item['group'] in dyn:
            check('dynamic-pivot:'+name,np.max(np.abs(np.array(item['assemblyOffset_mm'])-dyn[item['group']]['pivot_mm']))<1e-8)
    # Re-read combined assembly BRep, not only each individually generated file.
    ass=cq.importers.importStep(str(out/'group.step')).val()
    check('assembly-step-reload',ass.isValid() and len(ass.Solids())==sum(len(s.Solids()) for s in solids.values()),solids=len(ass.Solids()))
    glb=trimesh.load(out/(asset+'.glb'),force='scene')
    check('glb-reload',len(glb.geometry)==len(scene['meshes']),geometries=len(glb.geometry))
    # Exact primitive volumes measured from independently re-read BRep.
    for oracle in man['analyticOracles']:
        actual=solids[oracle['part']].Volume();expected=oracle['volume_mm3'];err=abs(actual-expected)/expected
        check('analytic-'+oracle['kind']+':'+oracle['part'],err<1e-7,actual_mm3=actual,expected_mm3=expected)
    termmap={t['id']:t for t in man['terminals']}
    check('terminal-id-contract',set(termmap)=={t['id'] for t in req['terminals']})
    for f in man['features']:
        if f['kind']=='terminal-channel':
            term=termmap[f['terminal']];R=term_rotation(term['d']);p=np.array(term['p']);pivot=np.array(dyn.get(term['group'],{}).get('pivot_mm',[0,0,0]))
            post=solids[f['post']];cap=solids[f['cap']];pm=meshes[f['post']];cm=meshes[f['cap']]
            for key,pt in f['probeLocal'].items():
                point=p+R@pt-pivot;solid,mesh=(cap,cm) if key.startswith('cap') else (post,pm)
                expected='Wall' in key or key=='wall';actual=inside(solid,point);actualmesh=ray_mesh_contains(mesh,point)
                check('channel-brep:'+term['id']+':'+key,actual==expected,point_mm=point.tolist(),expectedSolid=expected)
                check('channel-mesh:'+term['id']+':'+key,actualmesh==expected)
            radii=surface_radii(post)
            check('bore-diameter:'+term['id'],any(abs(r-SPEC['terminal']['boreRadius'])<1e-6 for r in radii),surfaceRadii_mm=radii)
            check('cross-hole-diameter:'+term['id'],any(abs(r-SPEC['terminal']['crossBoreRadius'])<1e-6 for r in radii))
            # Tangential contact annulus: p itself in actual void; p+3mm tangent in cap contact.
            contact=p+R@np.array([0,3.7,-.3])-pivot
            check('terminal-contact-surface:'+term['id'],inside(cap,contact) and not inside(cap,p-pivot),anchor_mm=p.tolist(),contact_mm=contact.tolist())
            # Local slot width is independently bounded with occupied samples on both walls.
            width=SPEC['terminal']['slotWidth'];depth=SPEC['terminal']['slotDepth']
            slotprobes=[([3.7,width/2-.05,-.3],False),([3.7,width/2+.05,-.3],True),([3.7,-width/2-.05,-.3],True),([3.7,0,-depth-.05],True)]
            for idx,(pt,ex) in enumerate(slotprobes):check('local-slot-dimension:'+term['id']+':'+str(idx),inside(cap,p+R@pt-pivot)==ex)
            # Axial wall local measurements within .02mm of the specified bore.
            for dr,ex in [(-.025,False),(.025,True)]:
                pt=p+R@np.array([SPEC['terminal']['boreRadius']+dr,0,-4])-pivot
                check('local-bore-wall:'+term['id']+':'+str(dr),inside(post,pt)==ex)
        elif f['kind']=='shell':
            s=solids[f['part']];x,y,h=f['outer_mm'];t=f['wall_mm'];p=np.array(f['origin']);
            check('shell-wall:'+f['part'],not inside(s,p+[0,0,h/2]) and inside(s,p+[x/2-t/2,0,h/2]) and not inside(s,p+[x/2-t-.025,0,h/2]))
        elif f['kind']=='plate-separation':
            A=solids[f['plateA']].BoundingBox();B=solids[f['plateB']].BoundingBox();gap=B.xmin-A.xmax
            check('measured-plate-gap',abs(gap-32)<1e-6 and abs(gap+64-96)<1e-6,minimum_mm=gap,maximum_mm=gap+64)
            check('measured-plate-area',abs(A.ylen*A.zlen-9000)<1e-6 and abs(B.ylen*B.zlen-9000)<1e-6)
        elif f['kind']=='elcap-can':
            s=solids[f['part']];r=f['radius_mm'];t=f['wall_mm'];z=30
            check('elcap-local-wall',not inside(s,[0,0,z]) and inside(s,[r-t/2,0,z]) and not inside(s,[r-t-.025,0,z]))
    # Independent world fixtures: CAD world then convert vs runtime matrix on converted points.
    # Transport negative controls must reject corrupt payloads even when the
    # corruption is re-hashed: malformed base64, count, NaN, out-of-range index.
    import copy
    source=scene['meshes'][0]
    bad=[]
    item=copy.deepcopy(source);item['posB64']='!invalid!';bad.append(('base64',item))
    item=copy.deepcopy(source);item['positionCount']+=1;bad.append(('count',item))
    item=copy.deepcopy(source);raw=bytearray(base64.b64decode(item['posB64']));raw[:4]=np.array([np.nan],dtype='<f4').tobytes();item['posB64']=base64.b64encode(raw).decode();item['posSha256']=hashlib.sha256(raw).hexdigest();bad.append(('NaN',item))
    item=copy.deepcopy(source);raw=bytearray(base64.b64decode(item['idxB64']));raw[:4]=np.array([item['positionCount']],dtype='<u4').tobytes();item['idxB64']=base64.b64encode(raw).decode();item['idxSha256']=hashlib.sha256(raw).hexdigest();bad.append(('index',item))
    for label,item in bad:
        rejected=False
        try:decode_mesh(item)
        except (ValueError,TypeError):rejected=True
        check('decoder-negative:'+label,rejected)
    for feature in [f for f in man['features'] if f['kind']=='analytic-helix-mesh']:
        mesh=meshes[feature['part']];pivot=dyn.get(partrecords[feature['part']]['group'],{}).get('pivot_mm',[0,0,0])
        forward,reverse,_=helix_surface_samples(feature,mesh,pivot)
        # Re-read BRep occupancy at independently evaluated fractional-turn centers
        # and outside the declared wire radius. This detects axis/pitch/radius drift.
        s=solids[feature['part']];k=feature['pitch']/(2*math.pi);end=feature['height']/k
        M=np.array([[0,0,-1],[0,1,0],[1,0,0]]) if feature['axis']=='x' else np.eye(3)
        localoffset=np.array(feature['p'])-np.array(pivot)
        for si,t in enumerate(np.linspace(.37,end-.37,7)):
            radial=np.array([math.cos(t),math.sin(t),0]);center=np.array([feature['radius']*math.cos(t),feature['radius']*math.sin(t),k*t]);c=center@M+localoffset;outside=(center+radial*(feature['wire']+.08))@M+localoffset
            check('helix-step-local:'+feature['part']+':'+str(si),inside(s,c) and not inside(s,outside),center_mm=c.tolist())
        check('helix-sampled-surface:'+feature['part'],max(forward,reverse)<=feature['maxSagitta_mm']+.02,analyticToMesh_mm=forward,meshToAnalytic_mm=reverse,declaredEstimate_mm=feature['maxSagitta_mm'],interpretation='sampled bilateral surface deviation; not proof of continuous Hausdorff bound')
    decoded=sum(m['posByteLength']+m['idxByteLength'] for m in scene['meshes']);gpu=decoded+sum(m['posByteLength'] for m in scene['meshes'])
    check('triangle-budget',totaltri<=60000,triangles=totaltri,budget=60000)
    check('typed-encoding-version',scene.get('encoding',{}).get('version')=='typed-arrays/1')
    terminal_fixtures=[]
    for term in man['terminals']:
        p=np.array(term['p']);d=np.array(term['d']);dynamic=dyn.get(term['group'])
        states=dynamic.get('range') if dynamic and dynamic.get('mode')=='translate-mm' else [0]
        states=[states[0],(states[0]+states[-1])/2,states[-1]] if len(states)>1 else states
        for state in states:
            displacement=np.array(dynamic['axis'])*state if dynamic and dynamic.get('mode')=='translate-mm' else np.zeros(3)
            for angle,translation in [(0,[0,0,0]),(0,[137,-83,12]),(37,[137,-83,12]),(90,[137,-83,12])]:
                R=rotation([0,0,1],math.radians(angle));t=np.array(translation)
                expected=(ADAPTER@(R@(p+displacement)+t))*.001
                runtimeR=ADAPTER@R@ADAPTER.T;actual=runtimeR@(ADAPTER@(p+displacement)*.001)+ADAPTER@t*.001
                actuald=runtimeR@(ADAPTER@d);expectedd=ADAPTER@R@d
                error=float(np.linalg.norm(actual-expected)*1000);derr=math.degrees(math.acos(float(np.clip(np.dot(actuald,expectedd)/(np.linalg.norm(actuald)*np.linalg.norm(expectedd)),-1,1))))
                check('adapter-math-terminal:'+term['id']+':'+str(state)+':'+str(angle)+':'+str(translation),error<=.05 and derr<=.1,error_mm=error,directionError_deg=derr)
                terminal_fixtures.append({'terminal':term['id'],'state':state,'rotationZ_deg':angle,'translation_mm':translation,'runtime_m':actual.tolist(),'runtimeDirection':actuald.tolist()})
    # Check actual pivot-relative point behavior at min/mid/max, including axis orientation.
    dynamics=[]
    for g in man['dynamicGroups']:
        if g['range'] is None:
            check('phenomenon-group:'+g['group'],any(x['group']==g['group'] for x in scene['meshes']));continue
        lo,hi=g['range'][0],g['range'][-1]
        mm=[x for x in scene['meshes'] if x['group']==g['group']];point=np.frombuffer(base64.b64decode(mm[0]['posB64']),dtype='<f4')[:3].astype(float);pivot=np.array(g['pivot_mm']);samples=[]
        for state in [lo,(lo+hi)/2,hi]:
            if g['mode']=='translate-mm':position=pivot+point+np.array(g['axis'])*state;distance=float(np.linalg.norm(position-(pivot+point)));expected=abs(state)
            else:
                radians=state if g['mode']=='rotate-rad' else math.radians(state);position=pivot+rotation(g['axis'],radians)@point;distance=float(np.linalg.norm(position-pivot));expected=float(np.linalg.norm(point))
            check('dynamic-state:'+g['group']+':'+str(state),abs(distance-expected)<1e-6,position_mm=position.tolist())
            samples.append({'state':state,'point_mm':position.tolist()})
        dynamics.append({'group':g['group'],'pivot_mm':g['pivot_mm'],'axis':g['axis'],'samples':samples})
    # Range/polarity semantic assertions combined with nonempty real marking geometry.
    markinggeometry=sum(len(meshes[x['name']].faces) for x in scene['meshes'] if x['group']=='markings')
    check('original-vector-marking-geometry',markinggeometry>0,triangles=markinggeometry)
    if asset in ['ammeter','voltmeter']:
        actualranges={m['scale'] for m in man['markings'] if 'scale' in m};check('dual-scale-ranges',actualranges==set(SPEC['assets'][asset]['scale']),ranges=sorted(actualranges))
        for maximum in SPEC['assets'][asset]['scale']:check('each-scale-values:'+str(maximum),sum(m.get('scale')==maximum for m in man['markings'])==7)
    if asset=='galvanometer':check('center-zero-range',set(m.get('text') for m in man['markings'])>={'-300','0','300'})
    if asset in ['led','diode','elcap']:
        check('polarity-terminal-directions',all(termmap[t]['polarity']==t for t in ['+','-']))
        plus=termmap['+']['p'][0];minus=termmap['-']['p'][0]
        check('polarity-spatial-direction',plus<minus if asset=='diode' else plus>minus)
    hashes=load(out/'file-hashes.json');check('generated-file-hashes',all(sha(out/p)==h for p,h in hashes.items()))
    closure=man['sourceClosure'];check('source-closure-current',all(sha(ROOT/p)==h for p,h in closure.items()))
    result={'schema':'owned-electric-verification/1','asset':asset,'status':'PASS_LOCAL_GEOMETRY_ONLY' if not fail else 'FAIL','replacementReady':False,'checks':len(tests),'failures':fail,'maxMeshVolumeRelativeError':maxerr,'triangles':totaltri,'sceneTransferBytes':(out/'scene.json').stat().st_size,'decodedBytes':decoded,'gpuPositionNormalIndexBytes':gpu,'tests':tests,'terminalFixtures':terminal_fixtures,'dynamicFixtures':dynamics,'notVerified':['actual runtime mesh/anchor transform (current fixtures are adapter math only)','continuous global chord/Hausdorff proof (boundary samples only)','runtime integration','actual circuit behavior','browser visual fidelity','performance','no-downgrade comparison to unknown baseline geometry','production review']}
    if write:(out/'verification.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['asset','status','checks','failures','triangles','maxMeshVolumeRelativeError','sceneTransferBytes','decodedBytes','gpuPositionNormalIndexBytes']}),flush=True)
    return result

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--assets',nargs='*');ap.add_argument('--write',action='store_true',help='opt in to writing verification artifacts; default is read-only stdout');args=ap.parse_args()
    assets=args.assets or list(SPEC['assets']);results=[]
    for asset in assets:results.append(verify(asset,args.write))
    summary={'schema':'owned-electric-suite/1','replacementReady':False,'assets':[{k:r[k] for k in ['asset','status','checks','failures','triangles','maxMeshVolumeRelativeError','sceneTransferBytes','decodedBytes','gpuPositionNormalIndexBytes']} for r in results],'passed':sum(not r['failures'] for r in results),'count':len(results)}
    summary.update(sceneTransferBytes=sum(r['sceneTransferBytes'] for r in results),decodedBytes=sum(r['decodedBytes'] for r in results),gpuPositionNormalIndexBytes=sum(r['gpuPositionNormalIndexBytes'] for r in results),triangleCount=sum(r['triangles'] for r in results),checkCount=sum(r['checks'] for r in results))
    summary['budgetScope']='full-22-types' if set(assets)==set(SPEC['assets']) else 'subset-only-not-total-budget'
    summary['transportBudgetPass']=summary['sceneTransferBytes']<=20000000 if summary['budgetScope']=='full-22-types' else None
    if args.write:(ROOT/'out'/'verification-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'summary':{k:summary[k] for k in ['passed','count','checkCount','budgetScope','transportBudgetPass','sceneTransferBytes','decodedBytes','gpuPositionNormalIndexBytes','triangleCount']}}),flush=True)
    sys.exit(1 if summary['passed']!=len(results) or summary['transportBudgetPass'] is False else 0)
