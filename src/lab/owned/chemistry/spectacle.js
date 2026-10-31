import * as THREE from 'three';
import {VisualPool,OwnedFlame} from './items.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export class Spectacle {
 constructor(ctx,benchY=0){this.ctx=ctx;this.benchY=benchY;this.snakes=new Map();this.breads=new Map();this.states=new Map();this.disposed=false;this.pile=new VisualPool(1024,0x967557,{shape:'chunk',radius:.001});this.pile.grid=new Map();ctx.scene.add(this.pile.mesh);this.color=new THREE.Color();this.world=V();}
 state(it){let s=this.states.get(it);if(s)return s;const root=new THREE.Group();root.name='owned-reaction-visuals';it.root.add(root);
  const foam=new VisualPool(96,0xe4ece9,{radius:.004}),sparks=new VisualPool(64,0xffb04e,{radius:.0008}),flame=new OwnedFlame(root);root.add(foam.mesh,sparks.mesh);
  const breadMat=new THREE.MeshStandardMaterial({color:0x171416,roughness:.98}),bread=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,18,5),breadMat);bread.visible=false;root.add(bread);
  const snakeMat=new THREE.MeshStandardMaterial({color:0x8c7946,roughness:.98}),snake=new THREE.InstancedMesh(new THREE.SphereGeometry(1,9,7),snakeMat,48);snake.count=0;root.add(snake);
  s={root,foam,sparks,flame,bread,snake,matrix:new THREE.Matrix4(),position:V(),scale:V(),quat:new THREE.Quaternion(),hadK:false,popped:false,lastExtent:0,disposed:false};this.states.set(it,s);return s;
 }
 update(items,dt,time){if(this.disposed)return;dt=Math.max(0,Number.isFinite(dt)?dt:0);time=Number.isFinite(time)?time:0;const live=new Set(items);
  for(const it of this.states.keys())if(!live.has(it)||it.disposed)this.reset(it);
  for(const it of items){if(!it.v||it.disposed)continue;const m=it.v.mix,fx=m.fx,p=it.v.profile;
   const active=fx.foam+fx.bread+fx.snake+fx.thermite+fx.volcano+fx.sodium+fx.potassium;
   if(!(active>1e-9)&&!this.states.has(it))continue;
   const s=this.state(it),r=p.rimR,level=it.v.level;
   const foamN=Math.min(96,Math.ceil(Math.max(0,fx.foam)*20));for(let i=0;i<foamN;i++){const seed=s.foam.seeds[i],rad=.002+r*.12,angle=seed.a,rr=Math.max(0,r-rad)*Math.sqrt(seed.u);s.foam.instance(i,Math.cos(angle)*rr,level+rad+i/Math.max(1,foamN)*Math.min(.28,fx.foam*.035),Math.sin(angle)*rr,rad);}s.foam.finish(foamN);
   const carbon=m.s.C||0,breadAmount=carbon>0?(m.extent.bread||0):0;s.bread.visible=breadAmount>1e-9;
   if(s.bread.visible){s.bread.position.set(0,p.bottom+Math.min(.28,.008+carbon*.001)/2,0);s.bread.scale.set(r*.78,Math.min(.28,.008+carbon*.001),r*.78);this.breads.set(it,s.bread);}else this.breads.delete(it);
   const ash=m.s.snakeAsh||0,segments=ash>0?Math.min(48,Math.ceil(ash*22)):0;
   for(let i=0;i<segments;i++){const t=i/Math.max(1,segments-1),a=t*8+Math.sin(time*.25)*.08;const size=Math.max(.001,r*.22)*(1-t*.65);s.position.set(Math.cos(a)*r*.43*t,p.bottom+size+t*Math.min(.34,ash*.06),Math.sin(a)*r*.43*t);s.scale.set(size,size*1.15,size);s.matrix.compose(s.position,s.quat,s.scale);s.snake.setMatrixAt(i,s.matrix);}s.snake.count=segments;s.snake.instanceMatrix.needsUpdate=true;if(segments)this.snakes.set(it,s.snake);else this.snakes.delete(it);
   const power=fx.thermite+fx.volcano;const sparkN=Math.min(64,Math.ceil(power*18));this.color.setRGB(1,.35,.04);
   for(let i=0;i<sparkN;i++){const seed=s.sparks.seeds[i],age=(seed.v+time*.9)%1,rr=r*.9*age;s.sparks.instance(i,Math.cos(seed.a)*rr,Math.max(level,p.bottom+.004)+.14*age-.11*age*age,Math.sin(seed.a)*rr,.0006,this.color);}s.sparks.finish(sparkN);
   const alkali=(m.s.Na||0)+(m.s.K||0),alkaliFx=fx.sodium+fx.potassium;
   s.flame.on=alkaliFx>1e-4&&(alkali>1e-8||fx.potassium>.01);const theta=time*4.7,rr=Math.max(0,r-.006)*.65;
   s.flame.group.position.set(Math.cos(theta)*rr,level+.001,Math.sin(theta)*rr);it.v.sodiumPos.set(Math.cos(theta)*rr,Math.sin(theta)*rr);it.v.sodium=s.flame.group;
   s.flame.update(dt,time,fx.potassium>fx.sodium?[.65,.25,1]:[1,.66,.06]);
   if((m.extent.waterK||0)>0)s.hadK=true;
   if(s.hadK&&!s.popped&&(m.s.K||0)<1e-5){s.popped=true;it.root.updateWorldMatrix(true,false);this.world.copy(s.flame.group.position);it.root.localToWorld(this.world);this.ctx.onPop?.(this.world,[.65,.25,1]);}
   // Deposits are sampled only from actual Fe/Cr2O3 product growth, never arbitrary ash.
   const total=(m.s.Fe||0)+(m.s.Cr2O3||0);const target=Math.min(1024,Math.floor(total*12));
   if(power>0&&target>s.lastExtent){it.root.updateWorldMatrix(true,false);for(let i=s.lastExtent;i<target&&this.pile.n<1024;i++){const k=this.pile.n,seed=this.pile.seeds[k];this.world.set(Math.cos(seed.a)*r,p.bottom,Math.sin(seed.a)*r);it.root.localToWorld(this.world);this.pile.instance(k,this.world.x,this.benchY+.0015,this.world.z,.0015);this.pile.n++;}s.lastExtent=target;this.pile.finish(this.pile.n);this.pile.grid.set(it.id,target);}
  }
 }
 reset(it){const s=this.states.get(it);if(!s)return;s.root.removeFromParent();s.foam.dispose();s.sparks.dispose();s.flame.dispose();s.bread.geometry.dispose();s.bread.material.dispose();s.snake.geometry.dispose();s.snake.material.dispose();s.snake.dispose();s.root.clear();this.states.delete(it);this.snakes.delete(it);this.breads.delete(it);this.pile.grid.delete(it.id);this.pile.reset();for(const [other,state]of this.states){const target=state.lastExtent,r=other.v.profile.rimR;other.root.updateWorldMatrix(true,false);for(let i=0;i<target&&this.pile.n<1024;i++){const k=this.pile.n,seed=this.pile.seeds[k];this.world.set(Math.cos(seed.a)*r,other.v.profile.bottom,Math.sin(seed.a)*r);other.root.localToWorld(this.world);this.pile.instance(k,this.world.x,this.benchY+.0015,this.world.z,.0015);this.pile.n++;}}this.pile.finish(this.pile.n);if(it.v){it.v.sodium=null;it.v.sodiumPos.set(0,0);}if(this.states.size===0){this.pile.reset();this.pile.grid.clear();}}
 dispose(){if(this.disposed)return;this.disposed=true;for(const it of [...this.states.keys()])this.reset(it);this.pile.dispose();this.snakes.clear();this.breads.clear();}
}
