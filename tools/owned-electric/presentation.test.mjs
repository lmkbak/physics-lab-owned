import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PRESETS } from '../../src/lab/owned/electric/presets.js';
import { TYPES } from '../../src/lab/owned/electric/models.js';
import { Simulation } from '../../src/lab/owned/electric/simulation.js';
import { renderSchematic, meterReading, escapeXML, portLocations } from '../../src/lab/owned/electric/schematic.js';
import { renderStandard } from '../../src/lab/owned/electric/standard.js';
const baseline=JSON.parse(await readFile('docs/ownership/baseline.json','utf8')).electric;
let count=0;
const test=(name,fn)=>{fn();console.log(`PASS ${++count}: ${name}`);};
const modelOf=pr=>({parts:pr.parts.map(p=>({...structuredClone(p),label:p.id,params:{...structuredClone(TYPES[p.type].params),...structuredClone(p.params??{})},state:structuredClone(TYPES[p.type].state)})),wires:pr.wires.map((w,i)=>({id:`w${i}`,a:{p:w.a.split(':')[0],t:w.a.split(':')[1]},b:{p:w.b.split(':')[0],t:w.b.split(':')[1]},color:w.color,I:0}))});
const connections=ws=>ws.map(w=>[w.a,w.b,w.color].join('|')).sort();
const check=(r,m)=>{
  assert.ok(r);const v=r.viewBox.split(/\s+/).map(Number);assert.equal(v.length,4);assert.ok(v.every(Number.isFinite)&&v[2]>0&&v[3]>0);
  assert.equal((r.svg.match(/class="part oe-part"/g)??[]).length,m.parts.length);
  assert.equal((r.svg.match(/data-connection=/g)??[]).length,m.wires.length);
  assert.equal((r.svg.match(/data-wire=/g)??[]).length,m.wires.length);
  for(const p of m.parts){assert.ok(r.svg.includes(`data-part="${escapeXML(p.id)}"`));for(const t of Object.keys(TYPES[p.type].terms))assert.ok(r.svg.includes(`data-terminal="${escapeXML(t)}"`));if(TYPES[p.type].meter)assert.ok(r.svg.includes(`data-read="${escapeXML(p.id)}"`));}
  assert.ok(!/NaN|Infinity|undefined/.test(r.svg));
};
test('all 12 lesson identities/parameters/wires retained, independently worded and positioned',()=>{
  assert.deepEqual(PRESETS.map(p=>p.id),baseline.presets.map(p=>p.id));
  for(const p of PRESETS){const b=baseline.presets.find(x=>x.id===p.id);assert.deepEqual(p.parts.map(({id,type,params})=>({id,type,params})),b.parts.map(({id,type,params})=>({id,type,params})));assert.deepEqual(connections(p.wires),connections(b.wires));assert.notEqual(p.title,b.title);assert.notEqual(p.desc,b.description);assert.equal(p.tips.length,b.teachingRequirements.length);p.tips.forEach((t,i)=>assert.notEqual(t,b.teachingRequirements[i]));assert.ok(p.parts.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)));}
});
test('22 symbols complete, immutable model and public callbacks',()=>{
  const m={parts:Object.keys(TYPES).map((type,i)=>({id:`p${i}`,type,label:`X${i}`,x:i%5*260,y:Math.floor(i/5)*220,params:structuredClone(TYPES[type].params),state:structuredClone(TYPES[type].state)})),wires:[]};
  const before=JSON.stringify(m);let calls=0;const physical=renderSchematic(m,()=>{calls++;return[0,0];},id=>{const p=m.parts.find(p=>p.id===id);return[p.x,p.y];});check(physical,m);check(renderStandard(m),m);assert.equal(JSON.stringify(m),before);assert.equal(calls,m.parts.reduce((s,p)=>s+Object.keys(TYPES[p.type].terms).length,0));
});
test('XML escapes all five delimiters; malformed standard input safely requests fallback',()=>{
  assert.equal(escapeXML('&<>"\''),'&amp;&lt;&gt;&quot;&apos;');
  const p={id:'X"><script>',label:'<img onerror="x">&\'',type:'resistor10',params:{}};
  const r=renderSchematic({parts:[p],wires:[]});assert.ok(!r.svg.includes('<script>'));assert.ok(r.svg.includes(escapeXML(p.label)));assert.equal(renderStandard({parts:[p],wires:[{a:{p:p.id,t:'bad'},b:{p:p.id,t:'A'}}]}),null);
});
test('physical terminal callbacks anchor each wire and multiport connector',()=>{
  const m={parts:[{id:'a',type:'resistor10',x:0,y:0},{id:'b',type:'resistor10',x:300,y:0}],wires:[{id:'actual',a:{p:'a',t:'A'},b:{p:'b',t:'B'}}]};
  const r=renderSchematic(m,(id,t)=>[id==='a'?-45:345,t==='A'?-30:30],id=>[id==='a'?0:300,0]);
  assert.ok(r.svg.includes('data-terminal-link="a:A"'));assert.ok(r.svg.includes('M65 70'));assert.ok(r.svg.includes('455 130'));
});
test('meter precision, units and positive zero',()=>{
  assert.equal(meterReading({reading:-.000001,unit:'A',range:.6}),'0.00 A');assert.equal(meterReading({reading:.3,unit:'A',range:3}),'0.30 A');assert.equal(meterReading({reading:-.3,unit:'A',range:.6}),'-0.30 A');assert.equal(meterReading({reading:15,unit:'V',range:15}),'15.0 V');assert.equal(meterReading({reading:123.4,unit:'μA'}),'123 μA');assert.equal(meterReading({}),'—');
});
test('bridge graph retains every wire and identity, live flow signs evaluated late',()=>{
  const parts=['P','R1','R2','R3','R4','R5','V'].map((id,i)=>({id,type:i===0?'battery':id==='V'?'voltmeter':'resistor10',params:{},state:{}}));
  const ws=[['P:+','R1:A'],['R1:B','R2:A'],['R2:B','P:-'],['P:+','R3:A'],['R3:B','R4:A'],['R4:B','P:-'],['R1:B','R5:A'],['R5:B','R3:B'],['R5:A','V:3'],['R5:B','V:-']];
  const m={parts,wires:ws.map(([a,b],i)=>({id:`b${i}`,a:{p:a.split(':')[0],t:a.split(':')[1]},b:{p:b.split(':')[0],t:b.split(':')[1]}}))};let I=.12;const r=renderStandard(m,{termIn:()=>I});check(r,m);assert.equal(r.flows.length,parts.length);assert.equal((r.svg.match(/data-flow=/g)??[]).length,r.flows.length);assert.equal(r.flows[1](),.12);I=-.2;assert.equal(r.flows[1](),-.2);I=NaN;assert.equal(r.flows[1](),0);
});
test('crossings do not invent junction dots; real repeated terminal does',()=>{
  const p=['a','b','c','d'].map((id,i)=>({id,type:'resistor10',x:i%2*300,y:Math.floor(i/2)*300}));
  const wire=(id,a,b)=>({id,a:{p:a,t:'A'},b:{p:b,t:'B'}});let r=renderSchematic({parts:p,wires:[wire('w1','a','d'),wire('w2','b','c')]});assert.equal((r.svg.match(/class="oe-node"/g)??[]).length,0);
  r=renderSchematic({parts:p,wires:[wire('w1','a','d'),wire('w2','a','c')]});assert.equal((r.svg.match(/class="oe-node"/g)??[]).length,1);
});
test('all lesson switch states render with no lost ports/selection/readout hooks',()=>{
  for(const p of PRESETS)for(const state of ['default','A','B','off']){const m=modelOf(p);if(state!=='default')for(const q of m.parts){if(q.type==='dpdt')q.params.pos=state;if(q.type==='switch')q.params.closed=true;}check(renderSchematic(m),m);check(renderStandard(m),m);}
});
test('new authored presets solve with owned Simulation and finite shared readouts',()=>{
  for(const p of PRESETS){const m=modelOf(p),sim=new Simulation();for(let i=0;i<3;i++){const r=sim.step(m,1/240,1);assert.ok(r.converged,`${p.id}: ${JSON.stringify(r)}`);}for(const q of m.parts)for(const v of Object.values(q.live??{}))if(typeof v==='number')assert.ok(Number.isFinite(v));}
});
test('teaching numeric/conclusion anchors remain explicit',()=>{
  const tip=id=>PRESETS.find(p=>p.id===id).tips.join(' ');
  for(const[id,re]of[['ohm',/3.*U.*I/],['lamp-iu',/0\.2 V/],['emf',/5.*U=E−Ir/],['parallel',/0\.1 Ω/],['led',/50 Ω/],['motor',/I²R/],['rc',/500 Ω.*4700 μF.*2\.35 s/],['fuse',/2 A/],['solenoid',/B 端为 N/],['plate',/Q\/C/]])assert.match(tip(id),re);
});
const cards=PRESETS.map(p=>{const m=modelOf(p);for(const q of m.parts)if(TYPES[q.type].meter)q.live={reading:q.type==='voltmeter'?2.93:.27,unit:q.type==='voltmeter'?'V':'A',range:3};const r=renderStandard(m);return`<section><h2>${escapeXML(p.title)}</h2><p>${escapeXML(p.desc)}</p><svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.viewBox}">${r.svg}</svg><details><summary>实验步骤与结论</summary><ol>${p.tips.map(t=>`<li>${escapeXML(t)}</li>`).join('')}</ol></details></section>`;}).join('');
const all={parts:Object.keys(TYPES).map((type,i)=>({id:`catalog${i}`,label:`${i+1}`,type,x:i%4*260,y:Math.floor(i/4)*220,params:structuredClone(TYPES[type].params),state:structuredClone(TYPES[type].state)})),wires:[]};const gallery=renderSchematic(all);
await writeFile('tools/owned-electric/presentation-preview.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>独立电学图示验收</title><style>*{box-sizing:border-box}body{margin:0;background:#edf2f5;color:#20394e;font:15px system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:24px}header{display:flex;align-items:center;justify-content:space-between;gap:16px}h1{font-size:25px}h2{font-size:19px;margin:0 0 8px}p{color:#52697d;margin:8px 0 16px}section{background:white;border:1px solid #d6e2e9;border-radius:12px;padding:22px;margin:20px 0;box-shadow:0 6px 20px #1d3a4d08}svg{width:100%;min-height:210px;height:auto;display:block;background:#fbfdfe;border:1px solid #e5edf2;border-radius:6px}output{padding:10px 16px;background:#ddecf3;border-radius:8px;font-variant-numeric:tabular-nums}details{padding-top:14px}summary{cursor:pointer;padding:8px 0}li{margin:8px 0;line-height:1.6}@media(max-width:600px){main{padding:12px}header{display:block}h1{font-size:22px}section{padding:12px}svg{min-height:250px}output{display:block}}</style><main><header><div><h1>电路连接与测量</h1><p>独立图形候选 · 22 类器材 / 12 个课题</p></div><output id="selection" aria-live="polite">点选器材查看编号</output></header><section><h2>器材符号索引</h2><svg xmlns="http://www.w3.org/2000/svg" viewBox="${gallery.viewBox}">${gallery.svg}</svg></section>${cards}</main><script>for(const g of document.querySelectorAll('.part'))g.onclick=()=>document.querySelector('#selection').textContent='已选择 '+g.dataset.part;window.previewUpdate=()=>{for(const t of document.querySelectorAll('[data-read]'))t.textContent='0.31 A';};</script></html>`);
console.log(`Owned presentation: ${count} groups passed; isolated preview generated.`);
