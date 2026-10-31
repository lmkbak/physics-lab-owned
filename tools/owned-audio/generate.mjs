import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DESIGNS, VERSION, synthesize, encodeWav } from './synthesis.mjs';
import { decodeWav, measure, seam, resampleLoop, validate, validateMaterials } from './analysis.mjs';
import { auditionHtml } from './audition.mjs';
export const sha256 = b => createHash('sha256').update(b).digest('hex');
const toolDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(toolDir,'../..'),out=path.join(root,'public','owned-audio');
if(process.argv.length>2)throw Error('No custom output paths accepted');
if(path.basename(toolDir)!=='owned-audio'||path.basename(path.dirname(toolDir))!=='tools'||out!==path.resolve(root,'public/owned-audio'))throw Error('Unexpected isolated project layout');
const sourceNames=['synthesis.mjs','analysis.mjs','audition.mjs','generate.mjs'];
const sources=[];
for(const name of sourceNames)sources.push({path:`tools/owned-audio/${name}`,sha256:sha256(await readFile(path.join(toolDir,name)))});
const assets=[],measurements={},buffers={},loops={};let failures=[];
for(const [name,design]of Object.entries(DESIGNS)) {
  const bytes=encodeWav(synthesize(name)),{pcm,format}=decodeWav(bytes),measurement=measure(pcm);
  let loop=null;
  if(name==='motor') {loop={};for(const rate of [.55,1,1.8])loop[rate]=seam(resampleLoop(pcm,rate));loops.motor=loop;}
  const failed=validate(name,measurement,loop);failures.push(...failed.map(x=>`${name}: ${x}`));measurements[name]=measurement;buffers[name]=bytes;
  assets.push({file:`${name}.wav`,sha256:sha256(bytes),generator:'tools/owned-audio/generate.mjs',generatorVersion:VERSION,format,seed:design.seed,parameters:design,designSource:design.origin,inputAssets:[],license:'not specified by user',measurement,loop});
}
const materials=validateMaterials(measurements);failures.push(...materials.fail);
if(failures.length)throw Error('Contract failed: '+failures.join(', ')+'\n'+JSON.stringify({measurements,loops,materials},null,2));
await mkdir(out,{recursive:true});
for(const [name,bytes]of Object.entries(buffers))await writeFile(path.join(out,name+'.wav'),bytes);
await writeFile(path.join(out,'CREDITS.json'),JSON.stringify({schema:'physics-lab/owned-audio/v1',generatorVersion:VERSION,sourceFiles:sources,designOrigin:'Independent mathematical physical-acoustic design; no recording reference or analysis',dependencyClosure:'Only listed own JavaScript sources and Node standard library; no network/cache/third-party media/models',thirdPartyInputs:[],license:'not specified by user',auditionStatus:'pending human listening',assets},null,2)+'\n');
await writeFile(path.join(out,'validation.json'),JSON.stringify({status:'objective pass; pending human listening',sampleRate:44100,thresholds:{peakMax:.89,rmsMin:.005,absDcMax:.01,nonzeroRatioMin:.25,materialCentroidHz:{woodMax:1200,metalMin:1200,glassMin:2400,metalWoodGapMin:500,glassMetalGapMin:400},materialBandL1Min:.2,significantPeaksMin:3,motorValueJumpLSBMax:2,motorSlopeJumpLSBMax:4,motorEdgeRmsRatioMin:.45,motorDifferenceRatioMax:1.5},resampling:'linear periodic interpolation; one cycle fitted to round(frames/rate); duplicated endpoint not inserted',measurements,loops,materialDistances:materials.distances,failures},null,2)+'\n');
await writeFile(path.join(out,'audition.html'),auditionHtml(Object.keys(DESIGNS)));
console.log(JSON.stringify({out,assets:assets.map(a=>({file:a.file,sha256:a.sha256,peak:a.measurement.peak,rms:a.measurement.rms,centroid:a.measurement.spectrum.centroidHz})),loops,materialDistances:materials.distances}));
