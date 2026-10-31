// Measurements consume only explicitly supplied new candidate PCM/WAV data.
export const RATE=44100;
export function decodeWav(b) {
  if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,16)!=='WAVEfmt '||b.toString('ascii',36,40)!=='data') throw Error('Unsupported WAV');
  const format={format:b.readUInt16LE(20),channels:b.readUInt16LE(22),sampleRate:b.readUInt32LE(24),byteRate:b.readUInt32LE(28),blockAlign:b.readUInt16LE(32),bits:b.readUInt16LE(34),dataBytes:b.readUInt32LE(40)};
  if(format.format!==1||format.channels!==1||format.sampleRate!==RATE||format.bits!==16||format.byteRate!==88200||format.blockAlign!==2||format.dataBytes!==b.length-44||b.readUInt32LE(4)!==b.length-8) throw Error('Invalid PCM16 mono WAV');
  const pcm=new Float64Array(format.dataBytes/2);
  for(let i=0;i<pcm.length;i++) pcm[i]=b.readInt16LE(44+i*2)/32768;
  return {format,pcm};
}
export function rms(x) { let sum=0; for(const v of x) sum+=v*v; return Math.sqrt(sum/x.length); }
function fft(re,im) {
  const n=re.length;
  for(let i=1,j=0;i<n;i++){ let bit=n>>1; for(;j&bit;bit>>=1)j^=bit; j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];} }
  for(let size=2;size<=n;size*=2){const a=-2*Math.PI/size;for(let start=0;start<n;start+=size)for(let k=0;k<size/2;k++){
    const c=Math.cos(a*k),s=Math.sin(a*k),p=start+k,q=p+size/2,vr=re[q]*c-im[q]*s,vi=re[q]*s+im[q]*c;
    re[q]=re[p]-vr;im[q]=im[p]-vi;re[p]+=vr;im[p]+=vi;
  }}
}
export function spectrum(x) {
  const size=8192,hop=4096,power=new Float64Array(size/2+1); let windows=0;
  // Identical full-file Welch power accumulation, zero-padding only the final frame.
  for(let start=0;start<x.length;start+=hop) {
    const re=new Float64Array(size),im=new Float64Array(size);
    for(let i=0;i<size;i++) re[i]=(x[start+i]??0)*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));
    fft(re,im);for(let k=1;k<power.length;k++) power[k]+=re[k]**2+im[k]**2;windows++;
  }
  let total=0,weighted=0;const bands=[0,0,0];let max=0;
  for(let k=1;k<power.length;k++){const f=k*RATE/size,v=power[k];total+=v;weighted+=f*v;bands[f<800?0:f<2400?1:2]+=v;max=Math.max(max,v);}
  const peaks=[];
  for(let k=2;k<power.length-1;k++)if(power[k]>power[k-1]&&power[k]>=power[k+1]&&power[k]>=max*10**(-25/10))peaks.push({hz:k*RATE/size,relativeDb:10*Math.log10(power[k]/max)});
  peaks.sort((a,b)=>b.relativeDb-a.relativeDb);
  return {centroidHz:weighted/total,bandEnergy:bands.map(v=>v/total),significantPeaks:peaks,method:{fftSize:size,hop,hann:true,start:0,end:x.length,windows,aggregation:'sum windowed squared FFT magnitude; DC bin omitted; final window zero-padded'}};
}
export function seam(x) {
  const n=x.length,edge=Math.round(RATE*.003),diff=[];let seamMax=0;
  for(let i=1;i<n;i++){const d=Math.abs(x[i]-x[i-1]);if(i<edge||i>n-edge)seamMax=Math.max(seamMax,d);else diff.push(d);}
  diff.sort((a,b)=>a-b);const p99=diff[Math.floor(diff.length*.99)];
  const valueJump=Math.abs(x[0]-x[n-1]),slopeJump=Math.abs((x[1]-x[0])-(x[n-1]-x[n-2]));
  seamMax=Math.max(seamMax,valueJump);
  const count=Math.round(.02*RATE),whole=rms(x);
  return {valueJump,valueJumpLSB:valueJump*32768,slopeJump,slopeJumpLSB:slopeJump*32768,headRmsRatio:rms(x.subarray(0,count))/whole,tailRmsRatio:rms(x.subarray(n-count))/whole,seamMaxDifference:seamMax,internalDifferenceP99:p99,differenceRatio:seamMax/p99,repeatedJoinCount:4};
}
export function resampleLoop(x,rate) {
  const n=Math.round(x.length/rate),out=new Float64Array(n);
  // A loop fits one exact cycle into rounded output frame count; linear interpolation, no endpoint duplication.
  for(let i=0;i<n;i++){const p=i*x.length/n,j=Math.floor(p),f=p-j;out[i]=x[j]*(1-f)+x[(j+1)%x.length]*f;}
  return out;
}
export function measure(x) {
  let peak=0,mean=0,nonzero=0;for(const v of x){if(!Number.isFinite(v))throw Error('Nonfinite PCM');peak=Math.max(peak,Math.abs(v));mean+=v/x.length;if(v!==0)nonzero++;}
  return {frames:x.length,duration:x.length/RATE,peak,rms:rms(x),dc:mean,nonzeroRatio:nonzero/x.length,head:x[0],tail:x[x.length-1],tail20msRms:rms(x.subarray(Math.max(0,x.length-882))),spectrum:spectrum(x)};
}
export function validate(name,m,loop=null) {
  const ranges={'click-switch':[.1,.3],'impact-glass':[.6,1.5],'impact-metal':[.7,1.8],'impact-wood':[.2,.65],explosion:[.6,1.4],motor:[1,2]};
  const [min,max]=ranges[name],fail=[];
  const check=(ok,msg)=>{if(!ok)fail.push(msg);};
  check(m.peak<=.89,'peak');check(m.rms>.005,'rms');check(m.nonzeroRatio>.25,'nonzero');check(Math.abs(m.dc)<.01,'DC');check(m.duration>=min&&m.duration<=max,'duration');
  if(name!=='motor'){check(Math.abs(m.head)<=2/32768&&Math.abs(m.tail)<=2/32768,'endpoints');check(m.tail20msRms<m.rms*.2,'tail RMS');}
  else for(const [rate,s] of Object.entries(loop)) {check(s.valueJump<=2/32768,`loop ${rate} value`);check(s.slopeJump<=4/32768,`loop ${rate} slope`);check(s.headRmsRatio>=.45&&s.tailRmsRatio>=.45,`loop ${rate} edge RMS`);check(s.differenceRatio<=1.5,`loop ${rate} difference`);}
  if(name.startsWith('impact-'))check(m.spectrum.significantPeaks.length>=3,'three modes');
  return fail;
}
export function validateMaterials(measurements) {
  const w=measurements['impact-wood'].spectrum,m=measurements['impact-metal'].spectrum,g=measurements['impact-glass'].spectrum,fail=[];
  if(!(w.centroidHz<1200&&m.centroidHz>1200&&g.centroidHz>2400&&m.centroidHz-w.centroidHz>=500&&g.centroidHz-m.centroidHz>=400))fail.push('material centroids');
  const distances={};for(const [a,b]of [['wood','metal'],['metal','glass'],['wood','glass']]){const d=measurements[`impact-${a}`].spectrum.bandEnergy.reduce((v,x,i)=>v+Math.abs(x-measurements[`impact-${b}`].spectrum.bandEnergy[i]),0);distances[`${a}/${b}`]=d;if(d<.2)fail.push(`material bands ${a}/${b}`);}
  return {fail,distances};
}
