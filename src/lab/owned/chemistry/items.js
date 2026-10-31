import * as THREE from 'three';
import {buildOwnedScene,loadOwnedScene} from '../cad/scene.js';
import {createLiquidGeometry} from '../cad/liquid.js';
import * as C from './chem.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
// New CAD group names are explicit adapter data, not vendor model transforms.
const defs={};
function D(key,name,asset,groups,extra={}){defs[key]={name,kind:'vessel',asset,groups:groups.split(' '),fill:.9,flow:14,...extra};}
D('beaker250','250 mL 烧杯','chem_beakers_owned','beaker250',{profile:'beaker250',heat:true,flow:28});
D('beaker100','100 mL 烧杯','chem_beakers_owned','beaker100',{profile:'beaker100',heat:true,flow:20});
D('tube','试管','chem_test_tubes_owned','tube150',{profile:'tube150',heat:true,isTube:true,flow:6});
D('conical','250 mL 锥形瓶','chem_conical_flask_owned','flask',{profile:'flask',heat:true});
D('cylinder','100 mL 量筒','chem_graduated_cylinders_owned','cylinder100 foot100',{profile:'cylinder100'});
D('roundFlask','250 mL 圆底烧瓶','chem_round_flasks_owned','flask250 cradle250',{profile:'flask250',heat:true,flow:12});
D('crucible','瓷坩埚','chem_porcelain_heating_owned','crucible',{profile:'crucible',heat:true,fill:.85,flow:6});
D('dish','蒸发皿','chem_porcelain_heating_owned','dish',{profile:'dish',heat:true,fill:.8,flow:10});
for(const [key,i,name]of [['bottleN',1,'细口瓶'],['bottleNA',3,'棕色细口瓶'],['bottleW',0,'广口瓶'],['bottleWA',2,'棕色广口瓶']])D(key,name,'chem_reagent_bottles_owned',`bottle_${i} stopper_${i}`,{profile:`bottle_${i}`,stoppers:[`stopper_${i}`]});
for(const [key,prefix,name]of [['dropBottle','clear','滴瓶'],['dropBottleA','amber','棕色滴瓶']])D(key,name,'chem_droppers_owned',`${prefix}_bottle ${prefix}_tube ${prefix}_cap ${prefix}_bulb`,{profile:`${prefix}_bottle`,stoppers:[`${prefix}_tube`,`${prefix}_cap`,`${prefix}_bulb`],flow:8});
D('lamp','酒精灯','chem_spirit_lamp_owned','reservoir holder wick',{kind:'lamp'});
D('tripod','三脚架与陶土网','chem_tripod_gauze_owned','tripod gauze ceramic',{kind:'fixture'});
D('rack','试管架','chem_test_tubes_owned','rack_base rack_posts rack_guides',{kind:'fixture'});
D('dropper','胶头滴管','chem_droppers_owned','clear_tube clear_bulb',{kind:'tool',tool:'dropper',tip:[0,.009,0],gripY:.089});
D('rod','玻璃棒','chem_beakers_owned','stirrer',{kind:'tool',tool:'rod',tip:[0,0,0],gripY:.15});
D('loop','焰色试验铂丝','chem_flame_test_wire_cadquery','handle loop',{kind:'tool',tool:'loop',provider:'equipment'});
D('spoon','药匙','chem_spatulas_owned','spoon',{kind:'tool',tool:'spoon',rotateZ:Math.PI/2,tip:[0,.055,0],gripY:.12});
D('cspoon','燃烧匙','chem_combustion_spoon_cadquery','spoon',{kind:'tool',tool:'spoon',provider:'equipment'});
D('splint','木条',null,'',{kind:'tool',tool:'splint',procedural:true});
D('toolrack','工具座',null,'',{kind:'fixture',procedural:true});
D('wash','洗瓶（蒸馏水）','chem_wash_bottle_owned','body cap seal tube',{kind:'wash',nozzle:[.056,.120,0]});
export const DEFS=Object.freeze(Object.fromEntries(Object.entries(defs).map(([k,v])=>[k,Object.freeze(v)])));
export function bottleKey(r){return r.bottle==='drop'?(r.amber?'dropBottleA':'dropBottle'):r.solid?(r.amber?'bottleWA':'bottleW'):(r.amber?'bottleNA':'bottleN');}
let serial=0;
const smooth=(dt,rate=7)=>1-Math.exp(-Math.max(0,dt)*rate);
function liquidMaterial(){
 const uniforms={uLevel:{value:0},uCenter:{value:V()},uTime:{value:0},uColor:{value:new THREE.Color(.8,.94,1)},uOpacity:{value:.08},uTurb:{value:0},uPpt:{value:new THREE.Color(1,1,1)},uGlow:{value:0},uBoil:{value:0}};
 return new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,
 vertexShader:`varying vec3 wp;varying vec3 normalW;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;normalW=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`uniform float uLevel,uTime,uOpacity,uTurb,uGlow,uBoil;uniform vec3 uCenter,uColor,uPpt;varying vec3 wp;varying vec3 normalW;void main(){vec3 n=normalize(normalW);float rim=pow(1.-abs(dot(n,normalize(cameraPosition-wp))),2.);float wave=.5+.5*sin((wp.x+wp.z)*460.+uTime*2.);vec3 col=mix(uColor,uPpt,clamp(uTurb*.65,0.,1.));col+=vec3(.2,.28,.32)*rim+uColor*uGlow*.45;float a=clamp(.14+uOpacity*.65+uTurb*.25+rim*.2,0.,.94);float surface=1.-smoothstep(.00015,.0015,abs(wp.y-uLevel));float caustic=.006*sin(length(wp.xz-uCenter.xz)*900.-uTime*1.4);col+=vec3(surface*.055+caustic);gl_FragColor=vec4(col+wave*uBoil*.015,a);}`});
}
// Every pool owns exactly one geometry and one material. Updates only rewrite instances.
export class VisualPool {
 constructor(capacity,color,{radius=.001,transparent=false,shape='sphere'}={}){
  this.capacity=capacity;this.n=0;this.next=0;this.radius=radius;this.seeds=Array.from({length:capacity},(_,i)=>({a:i*2.3999632297,u:((i*61+17)%997)/997,v:((i*113+43)%991)/991}));
  const geometry=shape==='chunk'?new THREE.IcosahedronGeometry(1,0):new THREE.SphereGeometry(1,7,5);
  const material=new THREE.MeshStandardMaterial({color,roughness:shape==='chunk'?.45:.3,transparent,opacity:transparent?.4:1,depthWrite:!transparent});
  this.mesh=new THREE.InstancedMesh(geometry,material,capacity);this.mesh.count=0;this.mesh.frustumCulled=false;this.points=this.mesh;this.matrix=new THREE.Matrix4();this.position=V();this.scale=V();this.rotation=new THREE.Quaternion();this.disposed=false;
 }
 instance(i,x,y,z,r=this.radius,color){this.position.set(x,y,z);this.scale.setScalar(r);this.matrix.compose(this.position,this.rotation,this.scale);this.mesh.setMatrixAt(i,this.matrix);if(color)this.mesh.setColorAt(i,color);}
 finish(n){this.n=n;this.mesh.count=n;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;}
 reset(){this.finish(0);this.next=0;}
 dispose(){if(this.disposed)return;this.disposed=true;this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();this.mesh.dispose();}
}
export class OwnedFlame {
 constructor(parent,position=V()){
  this.on=false;this.disposed=false;this.group=new THREE.Group();this.group.position.copy(position);parent.add(this.group);
  this.material=new THREE.MeshBasicMaterial({color:0x79b8ff,transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending});
  this.mesh=new THREE.Mesh(new THREE.SphereGeometry(1,12,12),this.material);this.mesh.position.y=.018;this.mesh.scale.set(.005,.022,.005);this.group.add(this.mesh);
  this.light=new THREE.PointLight(0x69aaff,0,.3,2);this.group.add(this.light);this.group.visible=false;this.color=this.material.color;
 }
 update(dt,time,tint){this.group.visible=!!this.on;if(tint)this.color.setRGB(...tint);else this.color.setRGB(.17,.47,1);const flicker=.9+.08*Math.sin(time*17)+.04*Math.sin(time*31);this.mesh.scale.y=.022*flicker;this.light.color.copy(this.color);this.light.intensity=this.on?.12*flicker:0;}
 dispose(){if(this.disposed)return;this.disposed=true;this.group.removeFromParent();this.mesh.geometry.dispose();this.material.dispose();this.group.clear();}
}
function geometryResources(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of [].concat(o.material||[]))ms.add(m);});return {gs,ms};}
function procedural(def){
 const root=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color:def.tool==='splint'?0xc39a60:0x35333d,roughness:.7});
 if(def.tool==='splint'){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.003,.15,.003),mat);mesh.position.y=.075;root.add(mesh);}
 else {const base=new THREE.Mesh(new THREE.BoxGeometry(.34,.008,.04),mat);base.position.y=.004;root.add(base);for(let i=-3;i<=3;i++){const support=new THREE.Mesh(new THREE.TorusGeometry(.006,.0015,5,12),mat);support.rotation.x=Math.PI/2;support.position.set(i*.05,.008,0);root.add(support);}}
 return {root,groups:new Map(),profiles:new Map(),dispose(){const {gs,ms}=geometryResources(root);for(const g of gs)g.dispose();for(const m of ms)m.dispose();root.removeFromParent();root.clear();}};
}
function labelFor(item){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=224;const c=canvas.getContext('2d');if(!c)return null;
 c.fillStyle='#f2f0df';c.fillRect(0,0,512,224);c.fillStyle='#1e3033';c.fillRect(0,0,14,224);c.font='bold 45px sans-serif';c.textAlign='center';c.fillText(item.reagent.formula,262,70,455);c.font='28px sans-serif';c.fillText(item.reagent.name,262,118,455);c.font='20px sans-serif';c.fillText('虚拟实验 · 化学试剂',262,178,455);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.038,.017),material);mesh.position.set(0,item.h*.43,item.r+.0004);item.root.add(mesh);return {mesh,texture};
}
async function ownedScene(def,ctx,opts){
 if(def.procedural)return procedural(def);
 const options={groups:def.groups,assembly:false,studio:!!ctx.studio,fill:def.fill??.9};
 if(opts.ownedData)return buildOwnedScene(opts.ownedData,options);
 const base=def.provider==='equipment'?'/tools/owned-cad-equipment/out/':'/tools/owned-cad/out/';
 const url=def.url||`${base}${def.asset}/scene.json`;
 try{return await (ctx.loadOwnedScene||loadOwnedScene)(url,options);}catch(error){throw new Error(`Owned CAD ${def.asset} required for ${def.name}: ${error.message}`,{cause:error});}
}
function socketData(key,root){
 root.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(root),p=[];
 if(key==='tripod')p.push({p:V(0,box.max.y,0),accepts:'heatVessel',occupant:null});
 if(key==='rack')for(let i=0;i<4;i++)p.push({p:V((i-1.5)*.032,.012,0),accepts:'tube',occupant:null});
 if(key==='toolrack')for(let i=-3;i<=3;i++)p.push({p:V(i*.05,.008,0),accepts:'tool',occupant:null});return p;
}
export async function createItem(key,ctx,opts={}){
 const def=opts.def||DEFS[key];if(!def)throw new RangeError(`Unknown owned item: ${key}`);
 const reagent=opts.reagent?C.REAGENT_BY_ID[opts.reagent]:null;
 if(opts.reagent&&!reagent)throw new RangeError(`Unknown reagent ${opts.reagent}`);
 if(reagent&&def.kind!=='vessel')throw new TypeError('Reagent needs vessel');
 const model=await ownedScene(def,ctx,opts);
 const missingStopper=(def.stoppers||[]).find(name=>!model.groups.has(name));
 if(missingStopper){model.dispose();throw new Error(`Missing stopper group ${missingStopper}`);}
 if(def.kind==='vessel'&&!model.profiles.has(def.profile||def.profileGroups?.[0])){model.dispose();throw new Error(`Owned cavity profile ${def.profile} required for ${def.name}`);}
 const root=new THREE.Group();root.name=`owned:${key||def.name}`;
 // Individual assembled CAD root is a child; runtime liquid/proxy remain direct children.
 root.add(model.root);const isTool=def.kind==='tool';
 if(def.rotateZ)model.root.rotation.z=def.rotateZ;
 if(def.tip)model.root.position.sub(new THREE.Vector3(...def.tip));
 if(isTool&&!def.tip&&!def.procedural){const bounds=new THREE.Box3().setFromObject(model.root);model.root.position.y-=bounds.min.y;}
 const box=new THREE.Box3().setFromObject(model.root),size=box.getSize(V());
 const item={id:++serial,key:key||def.id||def.name,def,name:def.name,kind:def.kind,root,mats:[],h:size.y,r:Math.max(size.x,size.z)/2,gripY:def.gripY??size.y*.6,sockets:socketData(key,model.root),stoppers:[],source:false,reagent:null,heldBy:null,socketOf:null,open:0,hover:false,model,disposed:false};
 model.root.traverse(o=>{if(o.material){for(const m of [].concat(o.material)){if(!item.mats.includes(m))item.mats.push(m);if(ctx.env&&'envMap'in m)m.envMap=ctx.env;}}});
 const proxyMaterial=ctx.proxyMat||new THREE.MeshBasicMaterial({visible:false});const proxy=new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x,.006),Math.max(size.y,.006),Math.max(size.z,.006)),proxyMaterial);proxy.position.copy(box.getCenter(V()));proxy.visible=false;proxy.userData.item=item;root.add(proxy);item.proxy=proxy;
 for(const name of def.stoppers||[]){const group=model.groups.get(name);if(!group)throw new Error(`Missing stopper group ${name}`);root.attach(group);item.stoppers.push(group);}
 if(def.kind==='vessel'){
  const profile=model.profiles.get(def.profile||def.profileGroups?.[0]);if(!profile){model.dispose();proxy.geometry.dispose();throw new Error(`Owned cavity profile ${def.profile} required for ${def.name}`);}
  const liqMat=liquidMaterial(),liquid=new THREE.Mesh(createLiquidGeometry(profile,{volumeMl:0}),liqMat);liquid.renderOrder=2;root.add(liquid);
  const bubbles=new VisualPool(128,0xb1e2ef,{radius:.0007,transparent:true}),ppt=new VisualPool(256,0xffffff,{radius:.00065}),chunks=new VisualPool(96,0xaaaaaa,{shape:'chunk',radius:.002});root.add(bubbles.mesh,ppt.mesh,chunks.mesh);
  item.v={profile,capacity:profile.capacity,mix:C.createMixture(),liquid,liqMat,level:profile.bottom,col:new THREE.Color(.8,.94,1),pptCol:new THREE.Color(1,1,1),tint:0,turb:0,settle:0,stir:0,glow:0,lum:0,lastPpt:0,app:null,appT:0,bubbles,ppt,seeds:ppt.seeds,chunks,chunkKey:'',sodium:null,sodiumPos:new THREE.Vector2(),geometryVolume:0,meshVolume:0,gravityNormal:new THREE.Vector3(0,1,0),fullGeometry:null};
  item.r=Math.max(item.r,profile.rimR);
 }
 if(opts.reagent){const reagent=C.REAGENT_BY_ID[opts.reagent];if(!reagent)throw new RangeError(`Unknown reagent ${opts.reagent}`);if(!item.v)throw new TypeError('Reagent needs vessel');item.reagent=reagent;item.source=true;item.name=reagent.name;refill(item);item.label=labelFor(item);}
 if(isTool){item.tool={type:def.tool,load:null,reagent:null,ion:null,charge:0,burn:null,shown:false};if(def.tool==='spoon'){item.spoonMesh=new THREE.Group();item.spoonMat=new THREE.MeshStandardMaterial({color:0xaaaaaa});const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.003,0),item.spoonMat);item.spoonMesh.add(mesh);item.spoonMesh.visible=false;root.add(item.spoonMesh);}
 if(def.tool==='splint'){const charMat=new THREE.MeshStandardMaterial({color:0x211711,emissive:0xff7030});const ember=new THREE.Mesh(new THREE.BoxGeometry(.0033,.006,.0033),charMat);root.add(ember);const flame=new OwnedFlame(root);item.splint={state:'unlit',life:1,ember:0,flame,charMat,emberMesh:ember};}}
 if(def.kind==='lamp'){item.flame=new OwnedFlame(root,V(0,.0915,0));}
 if(def.kind==='wash')item.nozzle=new THREE.Vector3(...def.nozzle);
 item.dispose=()=>{if(item.disposed)return;item.disposed=true;root.removeFromParent();item.flame?.dispose();item.splint?.flame.dispose();
  if(item.v){for(const pool of [item.v.bubbles,item.v.ppt,item.v.chunks])pool.dispose();item.v.liquid.geometry.dispose();item.v.fullGeometry?.dispose();item.v.liqMat.dispose();}
  item.label?.mesh.geometry.dispose();item.label?.mesh.material.dispose();item.label?.texture.dispose();item.spoonMesh?.traverse(o=>{o.geometry?.dispose();});item.spoonMat?.dispose();item.splint?.emberMesh.geometry.dispose();item.splint?.charMat.dispose();for(const stopper of item.stoppers)model.root.attach(stopper);proxy.geometry.dispose();if(!ctx.proxyMat)proxyMaterial.dispose();model.dispose();root.clear();};
 updateVesselVisual(item,0,0,ctx);return item;
}
export function refill(item){if(!item.reagent||!item.v)return;const r=item.reagent;item.v.mix=r.solid?C.fromReagent(r.id):C.fromReagent(r.id,item.v.capacity*.72);if(r.solid)for(const k of Object.keys(item.v.mix.s))item.v.mix.s[k]*=3;item.v.app=null;item.v.appT=0;}
// The inspect consumer must invoke this after changing its clone transform.
// It owns/replaces only clone-specific geometry and a clone-specific material.
export function syncInspectLiquid(source,clone,liquid,time=0){
 if(!source.v||!liquid)return;clone.updateWorldMatrix(true,false);const p=source.v.profile,e=clone.matrixWorld.elements,normal=new THREE.Vector3(e[1],e[5],e[9]).normalize(),volume=Math.min(p.fullCapacity,source.v.mix.vol);
 if(liquid.material===source.v.liqMat)liquid.material=source.v.liqMat.clone();
 const cache=liquid.userData.ownedInspect||{};if(cache.volume!==volume||!cache.normal||cache.normal.distanceToSquared(normal)>1e-8){const geometry=createGravityLiquidGeometry(p,volume,normal);if(cache.ownedGeometry)liquid.geometry.dispose();liquid.geometry=geometry;liquid.userData.ownedInspect={volume,normal:normal.clone(),ownedGeometry:true};}
 const u=liquid.material.uniforms,s=source.v.liqMat.uniforms;for(const k of ['uOpacity','uTurb','uGlow','uBoil'])u[k].value=s[k].value;u.uColor.value.copy(s.uColor.value);u.uPpt.value.copy(s.uPpt.value);u.uTime.value=time;u.uLevel.value=liquid.geometry.userData.gravityLevel*Math.hypot(e[1],e[5],e[9])+e[13];u.uCenter.value.copy(source.v.liqMat.uniforms.uCenter.value);u.uCenter.value.y=u.uLevel.value;liquid.visible=volume>0;
}
export function mouthWorld(item,out=V()){if(!item.v)throw new TypeError('mouthWorld needs vessel');item.root.updateWorldMatrix(true,false);return item.root.localToWorld(out.set(0,item.v.profile.rim,0));}
function boundedRadius(profile,y,theta,r){return Math.max(0,profile.radiusAt(y,theta)-r);}
const tempColor=new THREE.Color();
const GAS_COLORS={H2:[.7,.88,1],O2:[.7,.95,.9],CO2:[.82,.86,.9],NO:[.88,.9,.95],NO2:[.62,.23,.055],boil:[.93,.96,1]};
function gravityCavity(profile){
 const heights=new Set(profile.pts.map(p=>p[0]));if(profile.nonAxisymmetric)for(let i=1;i<32;i++)heights.add(profile.bottom+(profile.rim-profile.bottom)*i/32);
 const ys=[...heights].sort((a,b)=>a-b),N=128,positions=[],indices=[];for(const y of ys)for(let i=0;i<N;i++){const a=i*2*Math.PI/N,r=profile.radiusAt(y,a);positions.push(r*Math.cos(a),y,-r*Math.sin(a));}
 for(let j=1;j<ys.length;j++)for(let i=0;i<N;i++){const k=(i+1)%N,a=(j-1)*N+i,b=(j-1)*N+k,c=j*N+i,d=j*N+k;indices.push(a,b,c,b,d,c);}
 for(const [j,top]of [[0,false],[ys.length-1,true]]){const center=positions.length/3;positions.push(0,ys[j],0);for(let i=0;i<N;i++){const a=j*N+i,b=j*N+(i+1)%N;indices.push(center,top?a:b,top?b:a);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);return g;
}
/** Independently clip a closed cavity against a local gravity plane and retain a closed cap.
 * Plane-volume bisection measures tetrahedra from a point on the cut, so omitted cap has zero volume.
 */
export function createGravityLiquidGeometry(profile,volumeMl,normal,fullGeometry){
 const full=fullGeometry||gravityCavity(profile),position=full.getAttribute('position'),index=full.index;
 const n=normal.clone().normalize(),reference=new THREE.Vector3(),axis=new THREE.Vector3(),second=new THREE.Vector3();
 axis.crossVectors(n,Math.abs(n.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize();second.crossVectors(n,axis);
 let min=Infinity,max=-Infinity;const vertices=[];for(let i=0;i<position.count;i++){const p=new THREE.Vector3().fromBufferAttribute(position,i);vertices.push(p);const d=n.dot(p);min=Math.min(min,d);max=Math.max(max,d);}
 const tris=[];for(let i=0;i<index.count;i+=3)tris.push([vertices[index.getX(i)],vertices[index.getX(i+1)],vertices[index.getX(i+2)]]);
 function clip(tri,level){const out=[];for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],da=n.dot(a)-level,db=n.dot(b)-level;if(da<=0)out.push(a);if((da<0&&db>0)||(da>0&&db<0))out.push(a.clone().lerp(b,da/(da-db)));}return out;}
 const scratch=new Float64Array(12);function measure(level){reference.copy(n).multiplyScalar(level);let sum=0;for(const tri of tris){let count=0;for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],da=n.dot(a)-level,db=n.dot(b)-level;if(da<=0){scratch[count++]=a.x;scratch[count++]=a.y;scratch[count++]=a.z;}if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);scratch[count++]=a.x+(b.x-a.x)*t;scratch[count++]=a.y+(b.y-a.y)*t;scratch[count++]=a.z+(b.z-a.z)*t;}}for(let j=3;j<count-3;j+=3){const ax=scratch[0]-reference.x,ay=scratch[1]-reference.y,az=scratch[2]-reference.z,bx=scratch[j]-reference.x,by=scratch[j+1]-reference.y,bz=scratch[j+2]-reference.z,cx=scratch[j+3]-reference.x,cy=scratch[j+4]-reference.y,cz=scratch[j+5]-reference.z;sum+=ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx);}}return Math.abs(sum/6)*1e6;}
 // Integrate independent horizontal sections for the root solve; traverse triangles only once.
 const horizontal=Math.hypot(n.x,n.z),angle0=Math.atan2(n.z,n.x),z0=profile.bottom,z1=profile.rim;
 function area(y,level){const radius=profile.radiusAt(y),d=level-n.y*y;if(horizontal<1e-12)return d>=0?Math.PI*radius*radius:0;
  if(!profile.nonAxisymmetric){const cut=d/horizontal;if(cut<=-radius)return 0;if(cut>=radius)return Math.PI*radius*radius;return radius*radius*(Math.asin(cut/radius)+Math.PI/2)+cut*Math.sqrt(Math.max(0,radius*radius-cut*cut));}
  let sum=0;const N=64;for(let i=0;i<N;i++){const theta=2*Math.PI*(i+.5)/N,r=profile.radiusAt(y,theta),a=horizontal*Math.cos(theta-angle0);let value;if(Math.abs(a)<1e-14)value=d>=0?r*r:0;else if(a>0)value=d<=0?0:Math.min(r,d/a)**2;else value=d>=0?r*r:Math.max(0,r*r-Math.min(r,d/a)**2);sum+=value;}return sum*Math.PI/N;
 }
 function integrated(level){const N=64,dy=(z1-z0)/N;let sum=area(z0,level)+area(z1,level);for(let i=1;i<N;i++)sum+=area(z0+dy*i,level)*(i%2?4:2);return sum*dy/3*1e6;}
 const wanted=Math.max(0,Math.min(profile.fullCapacity,volumeMl));let lo=min,hi=max;for(let i=0;i<27;i++){const mid=(lo+hi)/2;if(integrated(mid)<wanted)lo=mid;else hi=mid;}let level=(lo+hi)/2;
 // Correct residual tessellation difference with a small number of mesh-volume secant steps.
 let measured=measure(level);for(let i=0;i<2&&Math.abs(measured-wanted)>Math.max(1e-6,wanted*.0005);i++){const delta=(max-min)*.0001,slope=(measure(level+delta)-measure(level-delta))/(2*delta);if(!(slope>0))break;level=Math.max(min,Math.min(max,level+(wanted-measured)/slope));measured=measure(level);}
 const out=[],cuts=new Map();for(const tri of tris){const poly=clip(tri,level);for(let j=1;j<poly.length-1;j++)for(const p of [poly[0],poly[j],poly[j+1]])out.push(p.x,p.y,p.z);for(const p of poly)if(Math.abs(n.dot(p)-level)<1e-9)cuts.set(`${Math.round(p.x*1e9)},${Math.round(p.y*1e9)},${Math.round(p.z*1e9)}`,p);}
 const boundary=[...cuts.values()];const center=new THREE.Vector3();for(const p of boundary)center.add(p);if(boundary.length)center.divideScalar(boundary.length);
 boundary.sort((a,b)=>Math.atan2(second.dot(a.clone().sub(center)),axis.dot(a.clone().sub(center)))-Math.atan2(second.dot(b.clone().sub(center)),axis.dot(b.clone().sub(center))));
 const planar=boundary.map(p=>new THREE.Vector2(axis.dot(p),second.dot(p)));for(const tri of THREE.ShapeUtils.triangulateShape(planar,[])){const a=boundary[tri[0]],b=boundary[tri[1]],c=boundary[tri[2]],cross=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));if(cross.lengthSq()<4e-28)continue;const ordered=cross.dot(n)<0?[a,c,b]:[a,b,c];for(const p of ordered)out.push(p.x,p.y,p.z);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(out,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.userData={ownedLiquid:true,volumeMl:wanted,gravityNormal:n.toArray(),gravityLevel:level};
 if(!fullGeometry)full.dispose();return geometry;
}
export function updateVesselVisual(item,dt,time,ctx={}){
 const v=item.v;if(!v)return;if(item.disposed)return;dt=Math.max(0,Number.isFinite(dt)?dt:0);time=Number.isFinite(time)?time:0;
 const m=v.mix,p=v.profile;v.app=C.appearance(m);const app=v.app,blend=dt===0?1:smooth(dt);
 v.col.lerp(tempColor.setRGB(...app.colorRGB),blend);v.pptCol.setRGB(...app.pptRGB);v.tint+=(app.tint-v.tint)*blend;v.turb=app.turbidity;v.level=p.levelFor(m.vol);
 if(v.stir>0)v.settle=Math.max(0,v.settle-dt*v.stir);else v.settle=Math.min(1,v.settle+dt*.025);v.stir*=Math.exp(-dt*2);v.lum=m.fx.lum||0;
 const u=v.liqMat.uniforms;item.root.updateWorldMatrix(true,false);u.uCenter.value.set(0,v.level,0);item.root.localToWorld(u.uCenter.value);u.uLevel.value=u.uCenter.value.y;u.uTime.value=time;u.uColor.value.copy(v.col);u.uOpacity.value=v.tint;u.uTurb.value=v.turb*(1-v.settle*.8);u.uPpt.value.copy(v.pptCol);u.uGlow.value=v.lum;u.uBoil.value=m.fx.boil||0;
 const volume=Math.min(p.fullCapacity,Math.max(0,m.vol));const me=item.root.matrixWorld.elements;const gravity=v.gravityScratch||(v.gravityScratch=new THREE.Vector3());gravity.set(me[1],me[5],me[9]).normalize();const tilted=gravity.x*gravity.x+gravity.z*gravity.z+(gravity.y-1)**2>1e-10;
 if(Math.abs(volume-v.geometryVolume)>1e-9||gravity.distanceToSquared(v.gravityNormal)>1e-8){const old=v.liquid.geometry;if(tilted&&volume>0){if(!v.fullGeometry)v.fullGeometry=gravityCavity(p);v.liquid.geometry=createGravityLiquidGeometry(p,volume,gravity,v.fullGeometry);}else v.liquid.geometry=createLiquidGeometry(p,{volumeMl:volume});old.dispose();v.geometryVolume=volume;v.meshVolume=volume;v.gravityNormal.copy(gravity);}
 if(tilted&&v.liquid.geometry.userData.gravityLevel!==undefined){u.uLevel.value=v.liquid.geometry.userData.gravityLevel*Math.hypot(me[1],me[5],me[9])+me[13];u.uCenter.value.y=u.uLevel.value;}
 v.liquid.visible=volume>1e-9;const gas=m.fx.H2+m.fx.O2+m.fx.CO2+m.fx.NO2+m.fx.NO+(m.fx.boil||0);const bubbleCount=volume>0?Math.min(128,Math.ceil(gas*24)):0;
 const channel=Object.keys(GAS_COLORS).filter(k=>(m.fx[k]||0)>0);let n=0;for(let i=0;i<bubbleCount;i++){const s=v.bubbles.seeds[i],r=.0005;const wet=v.level-p.bottom;if(wet<r*2)continue;const y=p.bottom+r+(wet-2*r)*((s.v+time*.2)%1),rr=boundedRadius(p,y,s.a,r);if(rr<=0)continue;const gx=Math.cos(s.a)*rr*Math.sqrt(s.u),gz=Math.sin(s.a)*rr*Math.sqrt(s.u);if(tilted&&gravity.x*gx+gravity.y*y+gravity.z*gz+r>v.liquid.geometry.userData.gravityLevel)continue;const key=channel[i%Math.max(1,channel.length)]||'O2';v.bubbles.instance(n++,gx,y,gz,r,tempColor.setRGB(...GAS_COLORS[key]));}v.bubbles.finish(n);
 n=0;const count=Math.min(256,Math.ceil(app.pptAmount*30));for(let i=0;i<count;i++){const s=v.ppt.seeds[i],r=.0005,wet=v.level-p.bottom;if(wet<2*r)continue;const y=p.bottom+r+Math.max(0,wet-2*r)*s.v*(1-v.settle*.97),rr=boundedRadius(p,y,s.a,r);if(rr<=0)continue;const px=Math.cos(s.a)*rr*Math.sqrt(s.u),pz=Math.sin(s.a)*rr*Math.sqrt(s.u);if(tilted&&gravity.x*px+gravity.y*y+gravity.z*pz+r>v.liquid.geometry.userData.gravityLevel)continue;v.ppt.instance(n++,px,y,pz,r,v.pptCol);}v.ppt.finish(n);
 n=0;for(const[k,amount]of Object.entries(app.chunks)){const entries=Math.min(12,Math.ceil(amount*2));tempColor.setRGB(...((m.crystals&&['salt','KClCrystal','CuSO4Crystal'].includes(k))?m.crystals:C.SPECIES[k].color));for(let i=0;i<entries&&n<96;i++){const s=v.chunks.seeds[n],r=Math.min(.0025,p.rimR*.13),surface=(k==='Na'||k==='K')&&volume>0;const y=surface?Math.max(p.bottom+r,v.level-r*.3):p.bottom+r;const a=s.a+(surface?time*4.7:0);const rr=boundedRadius(p,y,a,r);if(rr<=0)continue;v.chunks.instance(n++,Math.cos(a)*rr*Math.sqrt(s.u),y,Math.sin(a)*rr*Math.sqrt(s.u),r,tempColor);}}v.chunks.finish(n);
 for(const stopper of item.stoppers)stopper.visible=!(item.heldBy||item.open>0);item.open=Math.max(0,item.open-dt);
 if(item.spoonMesh)item.spoonMesh.visible=!!item.tool?.load;
}
