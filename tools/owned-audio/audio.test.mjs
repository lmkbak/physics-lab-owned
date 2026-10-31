import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Script, createContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESIGNS, synthesize, encodeWav } from './synthesis.mjs';
import { decodeWav, measure, seam, resampleLoop, validate, validateMaterials } from './analysis.mjs';
import { response, auditionHtml } from './audition.mjs';
const toolDir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(toolDir,'../..'),out=path.join(root,'public/owned-audio');
const hash=b=>createHash('sha256').update(b).digest('hex');
const own=['synthesis.mjs','analysis.mjs','audition.mjs','generate.mjs'];
const stats={};
for(const name of Object.keys(DESIGNS)) test(`${name}: format, independent PCM checks, seed, disk and contract`,async()=>{
  const float=synthesize(name),bytes=encodeWav(float),disk=await readFile(path.join(out,name+'.wav'));
  assert.deepEqual(bytes,encodeWav(synthesize(name)));assert.notDeepEqual(bytes,encodeWav(synthesize(name,DESIGNS[name].seed+1)));
  assert.deepEqual(disk,bytes);assert.equal(disk.readUInt32LE(24),44100);assert.equal(disk.readUInt16LE(22),1);assert.equal(disk.readUInt16LE(34),16);
  assert.equal(disk.length,44+Math.round(DESIGNS[name].duration*44100)*2);
  // Independent PCM inspection (does not rely on the generator's measure/validate implementation).
  let sum=0,sq=0,max=0,nonzero=0;
  for(let i=44;i<disk.length;i+=2){const v=disk.readInt16LE(i)/32768;sum+=v;sq+=v*v;max=Math.max(max,Math.abs(v));nonzero+=v!==0?1:0;assert.notEqual(Math.abs(disk.readInt16LE(i)),32767);}
  const frames=(disk.length-44)/2;assert.ok(max<=.89);assert.ok(Math.sqrt(sq/frames)>.005);assert.ok(Math.abs(sum/frames)<.01);assert.ok(nonzero/frames>.25);
  for(const v of float)assert.ok(Number.isFinite(v));
  const {pcm}=decodeWav(disk),m=measure(pcm);stats[name]=m;
  const loops=name==='motor'?Object.fromEntries([.55,1,1.8].map(r=>[r,seam(resampleLoop(pcm,r))])):null;
  assert.deepEqual(validate(name,m,loops),[]);
  const credits=JSON.parse(await readFile(path.join(out,'CREDITS.json'),'utf8')),entry=credits.assets.find(a=>a.file===name+'.wav');
  assert.equal(entry.sha256,hash(disk));assert.deepEqual(entry.parameters,DESIGNS[name]);assert.deepEqual(entry.inputAssets,[]);assert.equal(entry.license,'not specified by user');
});
test('materials have independently confirmed separated bands and at least three local spectral modes',async()=>{
  const m={};for(const name of ['impact-wood','impact-metal','impact-glass'])m[name]=measure(decodeWav(await readFile(path.join(out,name+'.wav'))).pcm);
  assert.deepEqual(validateMaterials(m).fail,[]);
  // Direct DFT probes at declared modal frequencies: each is well above its neighbouring off-modal probe.
  for(const [name,d]of Object.entries(DESIGNS).filter(([n])=>n.startsWith('impact-'))){
    const x=decodeWav(await readFile(path.join(out,name+'.wav'))).pcm;
    const probe=f=>{let re=0,im=0;const n=Math.min(x.length,16384);for(let i=0;i<n;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(n-1));re+=x[i]*w*Math.cos(2*Math.PI*f*i/44100);im+=x[i]*w*Math.sin(2*Math.PI*f*i/44100);}return re*re+im*im;};
    let strong=0;for(const [hz]of d.modes)if(probe(hz)>probe(hz+85)*4)strong++;assert.ok(strong>=3,`${name}: ${strong} resolved modes`);
  }
});
test('motor five-cycle quantized joins, no silence and physical rpm response',async()=>{
  const x=decodeWav(await readFile(path.join(out,'motor.wav'))).pcm;
  for(const rate of [.55,1,1.8]){
    const y=resampleLoop(x,rate),joined=new Float64Array(y.length*5);for(let k=0;k<5;k++)joined.set(y,k*y.length);
    assert.ok(Math.abs(y.length/44100-1.2/rate)<1/44100);
    for(let k=1;k<5;k++){const j=k*y.length;assert.ok(Math.abs(joined[j]-joined[j-1])<=2/32768);assert.ok(Math.abs((joined[j+1]-joined[j])-(joined[j-1]-joined[j-2]))<=4/32768);}
    // Direct DFT physically verifies 50 Hz commutation moves with rate in the interpolated output.
    const power=f=>{let a=0,b=0;for(let i=0;i<y.length;i++){a+=y[i]*Math.cos(2*Math.PI*f*i/44100);b+=y[i]*Math.sin(2*Math.PI*f*i/44100);}return a*a+b*b;};
    assert.ok(power(50*rate)>power(57*rate)*20);
  }
  const bands=measure(x).spectrum.bandEnergy;assert.ok(bands.every(v=>v>.00001),'three nonempty motor bands');
});
test('reject NaN/infinity/over-limit rather than silently quantizing',()=>{
  for(const v of [NaN,Infinity,-Infinity,.891,-.891])assert.throws(()=>encodeWav(Float64Array.of(0,v)));
});
test('audition response boundaries preserve existing formulas, no negative gain and no API imports',()=>{
  assert.deepEqual(response('click-switch',-4),{gain:.18,rate:.92});assert.equal(response('click-switch',9).gain,.63);
  assert.equal(response('explosion',-1).gain,.25);assert.equal(response('explosion',5).gain,.8);
  assert.equal(response('impact-metal',-1,-5).gain,.1);assert.equal(response('impact-metal',1e9,1e9).gain,.62);assert.equal(response('impact-metal',1,1e9).rate,.7);
  assert.equal(response('motor',-600).rate,.55);assert.equal(response('motor',600).rate,1);assert.equal(response('motor',1e6).rate,1.8);
  const html=auditionHtml(Object.keys(DESIGNS));assert.ok(html.includes('待人工试听'));assert.ok(!html.includes('autoplay'));assert.ok(!/https?:\/\//.test(html));assert.ok(html.includes('audio.preservesPitch=false'));
});
test('offline audition script compiles and releases media nodes on stop/end/pagehide',async()=>{
  const html=auditionHtml(Object.keys(DESIGNS)),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const compiled=new Script(script),buttons={},events={},nodes=[],players=[];
  const cards=['click-switch','motor'].map(name=>({dataset:{name},querySelector(sel){if(sel==='.demo')return buttons[name]??={};if(sel==='.a')return {value:name==='motor'?600:1};if(sel==='output')return this.output??={};return null;}}));
  const stopButton={};let closed=0,created=0,failResume=false;
  class Player {constructor(){players.push(this);}pause(){}removeAttribute(){}load(){this.unloaded=true;}async play(){}}
  class Context {constructor(){created++;}destination={};currentTime=0;async resume(){if(failResume)throw Error('mock resume denied');}async close(){closed++;}createMediaElementSource(){const x={connect(){return x;},disconnect(){x.disconnected=true;}};nodes.push(x);return x;}createGain(){const x={gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){return x;},disconnect(){x.disconnected=true;}};nodes.push(x);return x;}}
  const sandbox=createContext({Audio:Player,AudioContext:Context,document:{querySelector:()=>stopButton,querySelectorAll:sel=>sel==='article'?cards:[]},window:{addEventListener:(name,fn)=>events[name]=fn},setTimeout:()=>1,clearTimeout(){}});
  compiled.runInContext(sandbox);
  await buttons['click-switch'].onclick();assert.equal(players.length,1);players[0].onended();assert.ok(nodes.every(n=>n.disconnected));assert.ok(players[0].unloaded);
  for(let i=0;i<12;i++){await buttons.motor.onclick();stopButton.onclick();}
  assert.ok(nodes.every(n=>n.disconnected));assert.ok(players.every(p=>p.unloaded));assert.equal(new Script('media.size').runInContext(sandbox),0);
  events.pagehide();assert.equal(closed,1);assert.equal(new Script('context').runInContext(sandbox),null);
  await buttons.motor.onclick();assert.equal(created,2,'page restore creates new context');stopButton.onclick();
  failResume=true;await buttons['click-switch'].onclick();assert.match(cards[0].output.textContent,/音频启动失败/);assert.equal(new Script('media.size').runInContext(sandbox),0);
});
test('full generation import/read closure and CREDITS source hashes',async()=>{
  const credits=JSON.parse(await readFile(path.join(out,'CREDITS.json'),'utf8'));
  const allowed=new Set(['node:fs/promises','node:url','node:path','node:crypto','./synthesis.mjs','./analysis.mjs','./audition.mjs']);
  for(const file of own){const source=await readFile(path.join(toolDir,file),'utf8');
    for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g))assert.ok(allowed.has(match[1]),`${file}: unexpected import ${match[1]}`);
    assert.ok(!/\b(?:fetch|XMLHttpRequest|eval)\s*\(|\bimport\s*\(|node:(?:http|https|net|tls|child_process|worker_threads)|public\/audio|soundRecipes|process\.env/.test(source),`${file}: external or hidden input`);
    assert.equal(credits.sourceFiles.find(s=>s.path.endsWith('/'+file)).sha256,hash(source));
  }
  const generator=await readFile(path.join(toolDir,'generate.mjs'),'utf8');
  assert.equal((generator.match(/await readFile\(/g)||[]).length,1,'only explicit own source hashing reads allowed');
});
test('fresh offline source-only project rebuilds all candidates byte-for-byte',async()=>{
  const base='D:/deepseek-skill';await mkdir(base,{recursive:true});
  const fresh=await mkdtemp(path.join(base,'physics-owned-audio-fresh-'));
  const freshTools=path.join(fresh,'tools/owned-audio');let cleaned=false,comparisons=[];
  try {
    await mkdir(freshTools,{recursive:true});for(const file of own)await cp(path.join(toolDir,file),path.join(freshTools,file));
    const guard=path.join(fresh,'offline.cjs');
    await writeFile(guard,`const M=require('node:module');const original=M._load;M._load=function(id,...args){if(/^(node:)?(http|https|net|tls|dgram|dns|child_process|worker_threads)$/.test(id))throw Error('Offline generation: forbidden '+id);return original.call(this,id,...args)};globalThis.fetch=undefined;globalThis.WebSocket=undefined;`);
    const result=spawnSync(process.execPath,['--permission',`--allow-fs-read=${fresh}`,`--allow-fs-write=${fresh}`,'--no-experimental-fetch','--require',guard,path.join(freshTools,'generate.mjs')],{cwd:fresh,stdio:'inherit'});
    assert.equal(result.error,undefined);assert.equal(result.status,0,'fresh isolated generation');
    for(const file of [...Object.keys(DESIGNS).map(n=>n+'.wav'),'CREDITS.json','validation.json','audition.html']){
      const expected=await readFile(path.join(out,file)),actual=await readFile(path.join(fresh,'public/owned-audio',file));assert.deepEqual(actual,expected,file);comparisons.push({file,sha256:hash(actual),byteIdentical:true});
    }
  } finally {
    const resolved=await realpath(fresh),baseReal=await realpath(base);
    assert.equal(path.dirname(resolved),baseReal);assert.ok(path.basename(resolved).startsWith('physics-owned-audio-fresh-'));
    console.log('Verified fresh cleanup target:',resolved);await rm(resolved,{recursive:true});cleaned=true;
    await writeFile(path.join(out,'fresh-validation.json'),JSON.stringify({status:comparisons.length===9?'pass':'failed',inputClosure:own,network:'No network imports; built-in network loading denied, fetch disabled; Node filesystem permission isolated to fresh directory; no child/worker permission',comparisons,tempCleaned:cleaned},null,2)+'\n');
  }
});
