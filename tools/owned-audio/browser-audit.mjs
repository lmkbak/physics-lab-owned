// Real Chromium candidate audit. No application source or production audio access.
import { chromium } from 'file:///D:/deepseek-skill/icbu-agent/node_modules/playwright-core/index.mjs';
import { mkdir, mkdtemp, writeFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const toolDir=path.dirname(fileURLToPath(import.meta.url));
const base='D:/deepseek-skill';await mkdir(base,{recursive:true});
const temp=await mkdtemp(path.join(base,'physics-owned-audio-browser-'));
const results=[],requests=[],errors=[];let browser;
const report={scope:'isolated owned audio candidate only; no production integration',url:'http://127.0.0.1:5173/owned-audio/audition.html',humanListening:'pending',realEngine:'Installed Chrome headless; native AudioContext and OfflineAudioContext; hardware destination muted via launch flag (not a listening verdict)',results,requests,errors};
const names=['click-switch','impact-glass','impact-metal','impact-wood','explosion','motor'];
const run=async(name,fn)=>{try{const evidence=await fn();results.push({name,pass:true,evidence});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.stack});console.log('FAIL',name,e.message);}};
try {
  browser=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chrome',headless:true,args:['--mute-audio'],env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp},viewport:{width:1200,height:900}});
  const page=await browser.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const url=route.request().url();requests.push(url);if(url.startsWith('http://127.0.0.1:5173/owned-audio/')||url.startsWith('http://127.0.0.1:5173/@vite/')||url==='http://127.0.0.1:5173/favicon.ico')await route.continue();else await route.abort();});
  await page.goto(report.url,{waitUntil:'networkidle'});
  await run('cold page has six paused preload-none players and no AudioContext',async()=>{
    const state=await page.evaluate(()=>({contextType:typeof context,active:media.size,players:[...document.querySelectorAll('audio')].map(a=>({paused:a.paused,preload:a.preload,current:a.currentTime,readyState:a.readyState}))}));
    assert.equal(state.contextType,'undefined');assert.equal(state.active,0);assert.equal(state.players.length,6);assert.ok(state.players.every(a=>a.paused&&a.preload==='none'&&a.current===0));return state;
  });
  await run('trusted click creates running real AudioContext, stop removes sources',async()=>{
    await page.locator('[data-name="motor"] .demo').click();
    await page.waitForFunction(()=>typeof context!=='undefined'&&context?.state==='running'&&media.size===1&&![...media][0].audio.paused);
    const before=await page.evaluate(()=>({type:context.constructor.name,state:context.state,sampleRate:context.sampleRate,active:media.size,loop:[...media][0].audio.loop}));
    assert.equal(before.type,'AudioContext');await page.locator('#stop').click();const after=await page.evaluate(()=>media.size);assert.equal(after,0);return {before,after};
  });
  await run('six candidates decode through native real AudioContext',async()=>{
    const decoded=await page.evaluate(async names=>{const list=[];for(const name of names){const response=await fetch(name+'.wav');if(!response.ok)throw Error('HTTP '+response.status);const buffer=await context.decodeAudioData(await response.arrayBuffer());let peak=0,energy=0;for(const v of buffer.getChannelData(0)){if(!Number.isFinite(v))throw Error('nonfinite');peak=Math.max(peak,Math.abs(v));energy+=v*v;}list.push({name,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,duration:buffer.duration,peak,rms:Math.sqrt(energy/buffer.length)});}return list;},names);
    assert.equal(decoded.length,6);for(const d of decoded){assert.equal(d.channels,1);assert.ok(d.peak<=.891&&d.rms>.005);assert.ok(d.duration>.09&&d.duration<1.9);}return decoded;
  });
  for(const name of names)await run(`${name}: real media play, nonzero analyser, natural end or timed release`,async()=>{
    // Attach before the gesture: the 180ms click transient can finish before a
    // Playwright click/wait round-trip returns. Poll the complete playback window.
    await page.evaluate(()=>{
      const original=context.createGain.bind(context);window.sampleAudit={peak:0,polls:0,analysers:[]};
      context.createGain=(...args)=>{const amp=original(...args),analyser=context.createAnalyser();analyser.fftSize=2048;amp.connect(analyser);sampleAudit.analysers.push({amp,analyser,data:new Float32Array(2048)});return amp;};
      window.restoreAuditGain=()=>{context.createGain=original;};
      window.sampleAuditTimer=setInterval(()=>{sampleAudit.polls++;for(const {analyser,data} of sampleAudit.analysers){analyser.getFloatTimeDomainData(data);for(const v of data)sampleAudit.peak=Math.max(sampleAudit.peak,Math.abs(v));}},4);
    });
    await page.locator(`[data-name="${name}"] .demo`).click();
    const evidence=await page.evaluate(async()=>{await new Promise(r=>setTimeout(r,220));const entry=[...media][0],evidence={engine:context.state,playing:entry?!entry.audio.paused:false,rate:entry?.audio.playbackRate??null,gain:entry?.amp.gain.value??null,loop:entry?.audio.loop??false,analyserPeak:sampleAudit.peak,polls:sampleAudit.polls,measurement:'analyser attached before gesture; 4ms polling captures full transient'};clearInterval(sampleAuditTimer);restoreAuditGain();for(const {amp,analyser}of sampleAudit.analysers){try{amp.disconnect(analyser);}catch{}analyser.disconnect();}return evidence;});
    assert.ok(evidence.analyserPeak>1e-5);await page.waitForFunction(()=>media.size===0,{},{timeout:3500});return {...evidence,released:true};
  });
  await run('real controls preserve bounded gain/playbackRate/rpm formulas',async()=>{
    const cases=[['click-switch','0',null,.18,.92],['click-switch','1',null,.63,1.1],['impact-metal','0','1',.1,1.05],['impact-metal','20','20',.62,.7],['explosion','0',null,.25,.95],['explosion','1',null,.8,1.05],['motor','0',null,.16,.55],['motor','600',null,.16,1],['motor','2400',null,.16,1.8]],evidence=[];
    for(const [name,a,b,gain,rate]of cases){const card=page.locator(`[data-name="${name}"]`);await card.locator('.a').fill(a);if(b!==null)await card.locator('.b').fill(b);await card.locator('.demo').click();await page.waitForFunction(()=>media.size===1);const actual=await page.evaluate(()=>{const e=[...media][0];return {rate:e.audio.playbackRate,gain:e.amp.gain.value,loop:e.audio.loop,display:e.audio.src};});assert.ok(Math.abs(actual.rate-rate)<1e-5);if(name!=='motor')assert.ok(Math.abs(actual.gain-gain)<1e-5);else assert.ok(actual.gain>0&&actual.gain<=.161);evidence.push({name,a,b,expected:{gain,rate},actual});await page.locator('#stop').click();}return evidence;
  });
  await run('native motor player completes five continuous loops at rate 1.8 and stops',async()=>{
    await page.evaluate(()=>{const audio=document.querySelector('[data-name="motor"] audio');audio.playbackRate=1.8;audio.preservesPitch=false;window.loopAudit={wraps:0,last:0,times:[]};window.loopPoll=setInterval(()=>{const t=audio.currentTime;if(t+0.05<loopAudit.last)loopAudit.wraps++;loopAudit.last=t;loopAudit.times.push(t);},15);return audio.play();});
    await page.waitForFunction(()=>window.loopAudit.wraps>=5,{},{timeout:7000});
    const state=await page.evaluate(()=>{clearInterval(window.loopPoll);const audio=document.querySelector('[data-name="motor"] audio');return {wraps:loopAudit.wraps,paused:audio.paused,ended:audio.ended,loop:audio.loop,rate:audio.playbackRate,samples:loopAudit.times.length,error:audio.error?.code??null};});
    assert.ok(state.wraps>=5);assert.equal(state.paused,false);assert.equal(state.error,null);await page.locator('#stop').click();assert.equal(await page.locator('[data-name="motor"] audio').evaluate(a=>a.paused),true);return state;
  });
  await run('browserLoopExcess: native loop versus independent continuous PCM at three rates and zero mute',async()=>{
    report.browserLoopExcessContract={version:2,threshold:.02,metric:'maximum adjacent-difference residual: native loop minus independently expanded nonloop PCM at same rate, each join +/-8 frames',rawFixedThreshold:'retained as diagnostic only; arbitrary waveform slope is not physical discontinuity',limitation:'reference repeats asset tail/head too; this checks browser-loop-added discontinuity only, not original PCM seam quality or human listening'};
    const evidence=await page.evaluate(async()=>{
      const bytes=await(await fetch('motor.wav')).arrayBuffer(),list=[];
      for(const rate of [.55,1,1.8])for(const gain of [1,0]){
        const offline=new OfflineAudioContext(1,44100*7,44100),buffer=await offline.decodeAudioData(bytes.slice(0)),source=offline.createBufferSource(),amp=offline.createGain();
        source.buffer=buffer;source.loop=true;source.playbackRate.value=rate;amp.gain.value=gain;source.connect(amp).connect(offline.destination);source.start();
        const output=await offline.startRendering(),data=output.getChannelData(0);
        // Independent non-loop reference: physically repeat the decoded PCM, then
        // let another native renderer perform the same rate interpolation.
        const control=new OfflineAudioContext(1,data.length,44100),copies=Math.ceil(7*rate/buffer.duration)+2;
        const expanded=control.createBuffer(1,buffer.length*copies,buffer.sampleRate),pcm=expanded.getChannelData(0);
        for(let k=0;k<copies;k++)pcm.set(buffer.getChannelData(0),k*buffer.length);
        const controlSource=control.createBufferSource(),controlAmp=control.createGain();controlSource.buffer=expanded;controlSource.playbackRate.value=rate;controlAmp.gain.value=gain;controlSource.connect(controlAmp).connect(control.destination);controlSource.start();
        const reference=(await control.startRendering()).getChannelData(0);
        const windowAt=frame=>{let adjacent=0,normal=0,residual=0;for(let j=frame-8;j<=frame+8;j++){adjacent=Math.max(adjacent,Math.abs(data[j]-data[j-1]));normal=Math.max(normal,Math.abs(reference[j]-reference[j-1]));residual=Math.max(residual,Math.abs((data[j]-data[j-1])-(reference[j]-reference[j-1])));}return {maxAdjacentDifference:adjacent,referenceAdjacentDifference:normal,seamExcessDifference:residual};};
        let sum=0,max=0,diff=0;for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))throw Error('nonfinite render');sum+=data[i]*data[i];max=Math.max(max,Math.abs(data[i]));if(i)diff=Math.max(diff,Math.abs(data[i]-data[i-1]));}
        const joins=[],normalWindows=[];for(let k=1;k*buffer.duration/rate<7;k++){const frame=Math.round(k*buffer.duration/rate*44100);joins.push({frame,...windowAt(frame)});const normalFrame=Math.round((k-.5)*buffer.duration/rate*44100);normalWindows.push({frame:normalFrame,...windowAt(normalFrame)});}
        source.disconnect();amp.disconnect();controlSource.disconnect();controlAmp.disconnect();
        list.push({rate,gain,engine:offline.constructor.name,renderSeconds:7,joinCount:joins.length,joins,normalWindows,rms:Math.sqrt(sum/data.length),peak:max,maxAdjacentDifference:diff,rawFixedThreshold:.02,rawFixedThresholdPass:joins.every(j=>j.maxAdjacentDifference<.02),independentSeamExcessThreshold:.02,independentSeamExcessPass:joins.every(j=>j.seamExcessDifference<.02),comparison:'native loop versus independently expanded PCM nonloop at identical rate; original raw .02 threshold retained, not reclassified'});
      }return list;
    });
    report.motorLoopEvidence=evidence;
    for(const e of evidence){assert.ok(e.joinCount>=3,'each rate crosses at least three native loop joins');if(e.gain===0)assert.equal(e.peak,0);else{assert.ok(e.rms>.05&&e.peak<.9);assert.ok(e.maxAdjacentDifference<.2);assert.ok(e.independentSeamExcessPass,'browser loop adds no excess discontinuity against independent continuous PCM');assert.ok(e.normalWindows.length>=3,'normal nonjoin windows retained as slope diagnostics');}}return evidence;
  });
  await run('browser pagehide releases real graph and page restore creates new context',async()=>{
    await page.locator('[data-name="motor"] .demo').click();await page.waitForFunction(()=>media.size===1);
    const hidden=await page.evaluate(async()=>{window.oldAuditContext=context;window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));await new Promise(r=>setTimeout(r,80));return {active:media.size,cleared:context===null,oldState:oldAuditContext.state};});
    assert.deepEqual(hidden,{active:0,cleared:true,oldState:'closed'});await page.locator('[data-name="motor"] .demo').click();await page.waitForFunction(()=>media.size===1);const restored=await page.evaluate(()=>({newContext:context!==oldAuditContext,state:context.state,active:media.size}));assert.equal(restored.newContext,true);assert.equal(restored.state,'running');await page.locator('#stop').click();return {hidden,restored,event:'real PageTransitionEvent dispatched to page; graph is native; BFCache navigation itself not asserted'};
  });
  await run('real page navigation and cold reload release playback and remain silent',async()=>{
    await page.locator('[data-name="motor"] .demo').click();await page.waitForFunction(()=>media.size===1);
    await page.goto('about:blank');await page.goto(report.url,{waitUntil:'networkidle'});
    const state=await page.evaluate(()=>({contextType:typeof context,active:media.size,paused:[...document.querySelectorAll('audio')].every(a=>a.paused)}));assert.deepEqual(state,{contextType:'undefined',active:0,paused:true});return state;
  });
  report.chromeVersion=browser.browser().version();report.screenshot=path.join(temp,'audition.png');await page.screenshot({path:report.screenshot,fullPage:true});
  report.requestsOwnedOnly=requests.every(u=>!u.includes('/audio/')&&u.startsWith('http://127.0.0.1:5173/'));assert.equal(report.requestsOwnedOnly,true);assert.deepEqual(errors,[]);
} catch(error){report.fatal=error.stack;process.exitCode=1;} finally {
  if(browser)await browser.close();report.browserClosed=true;
  const absolute=await realpath(temp),parent=await realpath(base);assert.equal(path.dirname(absolute),parent);assert.ok(path.basename(absolute).startsWith('physics-owned-audio-browser-'));
  // Screenshot was review-only; no temporary profiles, audio or images persist.
  await rm(absolute,{recursive:true});report.temporaryArtifactsCleaned=true;report.screenshot='temporary capture taken and cleaned';
  report.pass=!report.fatal&&results.length>0&&results.every(r=>r.pass)&&errors.length===0;report.status=report.pass?'objective browser candidate pass; human listening and application integration pending':'failed';
  await writeFile(path.join(toolDir,'browser-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,cases:results.length,failed:results.filter(r=>!r.pass),fatal:report.fatal??null}));if(!report.pass)process.exitCode=1;
}
