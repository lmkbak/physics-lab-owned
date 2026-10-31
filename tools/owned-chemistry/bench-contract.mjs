// Execute the existing public DEMOS as black-box behavior requirements.
// No choreography is copied and no original chemistry implementation is imported.
import assert from 'node:assert/strict';
import * as C from '../../src/lab/owned/chemistry/chem.js';
import {DEMOS} from '../../src/lab/glowbench/demo.js';
const vessel=key=>({key,v:{mix:C.createMixture()},sockets:[{occupant:null}]});
export async function actualDemoEvidence(){const reports=[];
 for(const demo of DEMOS){
  const world=new Map(),tubes=Array.from({length:4},(_,i)=>vessel('tube'+i)),hands={L:{},R:{}},lamps=[{on:false},{on:false}];
  for(const key of ['tripod','crucible','dish','cylinder','beaker100','beaker250','conical'])world.set(key,vessel(key));
  for(const key of ['spoon','cspoon','dropper','wash','loop','splint'])world.set(key,{key,tool:true,splint:{state:'unlit'}});
  for(const r of C.REAGENTS)world.set(r.id,{key:r.id,reagent:r});
  let fast=1,seconds=0;const observations={};
  const mixtures=()=>[...world.values(),...tubes].filter(v=>v.v).map(v=>v.v.mix);
  function tick(real){const n=Math.ceil(real/.1),dt=real/n;for(let i=0;i<n;i++){for(const v of [...world.values(),...tubes])if(v.v)C.step(v.v.mix,dt*fast,{heat:v.heated&&lamps[1].on?230:0});seconds+=dt;}}
  const api={hands,find:key=>world.get(key),tube:i=>tubes[i],lampA:()=>lamps[0],lampB:()=>lamps[1],
   clear(...vs){for(const v of vs)C.clear(v.v.mix);},async say(){},zoom(){},lights(){},fast(n){fast=n;},
   async grab(h,v){h.item=v;},async putBack(h){h.item=null;},async placeOn(h,v){v.sockets[0].occupant=h.item;h.item.heated=true;h.item=null;},setLamp(l,on){l.on=on;},
   async pour(h,v,n){assert.ok(h.item?.reagent,'pour reagent');C.merge(v.v.mix,C.fromReagent(h.item.reagent.id,n));},
   async tap(h,v){const t=h.item;if(t.key==='spoon'||t.key==='cspoon'){if(v.reagent)t.load=C.fromReagent(v.reagent.id);else if(t.load){C.merge(v.v.mix,t.load);t.load=null;}}
    else if(t.key==='loop'){t.ion=C.flameIon(C.fromReagent(v.reagent.id,1));observations.flames??=[];observations.flames.push(t.ion);}
    else if(t.key==='splint')t.splint.state='ember';},
   async suck(h,v){h.item.load=C.fromReagent(v.reagent.id,1.5);},async drip(h,v,n){C.merge(v.v.mix,C.take(h.item.load,.05*n));},clean(h){if(h.item){h.item.load=null;h.item.ion=null;}},
   async hold(h,v,predicate,max){for(let t=0;t<max&&!predicate();t+=.1){if(h.item.key==='wash')C.merge(v.v.mix,C.water(.6));tick(.1);}},
   async until(predicate,max){for(let t=0;t<max&&!predicate();t+=.1)tick(.1);observations.until??=[];observations.until.push({passed:!!predicate(),max});},
   async look(v,y,seconds=0){tick(seconds);},
   async hover(h,v,seconds){if(h.item.key==='splint'){if(v===lamps[0])h.item.splint.state='burning';else {const g=v.v.mix.gas;if(h.item.splint.state==='ember'&&g.O2>.15)observations.gasTest='relight';else if(g.H2>.2)observations.gasTest='pop';else if(g.CO2>.35)observations.gasTest='douse';}}
    else if(h.item.key==='cspoon'&&h.item.load){const m=h.item.load;for(let t=0;t<seconds;t+=.1)C.step(m,.1,{heat:300});observations.mgO=m.s.MgO||0;}
    tick(seconds);}
  };
  await demo.run(api);
  const all=mixtures(),has=k=>all.some(m=>(m.s[k]||0)>1e-5),fx=k=>all.some(m=>m.fx[k]>1e-5);
  const checks={thermite:()=>has('Fe')&&has('Al2O3'),toothpaste:()=>fx('foam'),luminol:()=>has('aminophthalate')&&fx('lum'),snake:()=>has('snakeAsh'),bread:()=>has('C'),clock:()=>all.some(m=>C.appearance(m).iodineBlue),volcano:()=>has('Cr2O3'),k:()=>has('K+')&&fx('potassium'),na:()=>has('Na+')&&fx('sodium'),feoh2:()=>has('FeOH3'),aloh3:()=>has('Al3+')&&!has('AlOH3')&&!has('AlO2-'),flame:()=>observations.flames?.length===4,o2:()=>observations.gasTest==='relight',h2:()=>observations.gasTest==='pop',co2:()=>observations.gasTest==='douse',fe3:()=>has('Fe2+'),cuhno3:()=>all.some(m=>m.gas.NO2>0),agtree:()=>has('Ag'),mg:()=>observations.mgO>0,cuoh2:()=>has('CuO'),evap:()=>all.some(m=>m.crystals&&m.vol<=.01),starch:()=>all.some(m=>C.appearance(m).iodineBlue)};
  assert.ok(checks[demo.id](),`${demo.id}: actual demo observable failed`);
  for(const u of observations.until||[])assert.ok(u.passed,`${demo.id}: actual until condition timed out after ${u.max}s`);
  reports.push({id:demo.id,realSeconds:seconds,observations,products:all.filter(m=>Object.keys(m.s).length).map(m=>({vol:m.vol,T:m.T,s:m.s,gas:m.gas,fx:m.fx}))});
 }
 return reports;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/bench-contract.mjs'))console.log(JSON.stringify({status:'pass',demos:await actualDemoEvidence()},null,2));
