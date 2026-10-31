// Baseline black-box observation only. Never imported by independent source generators.
// No implementation or geometry parsing; public factory/current/solveStep calls only.
import fs from 'node:fs';
import { Lamp, Motor, Source, solveStep } from '../../src/lab/clbench/solver.js';
const lamp = [];
for (const [Vr, Ir] of [[2.5,.3],[3.8,.3],[6.3,.15]]) for (const factor of [0,.01,.05,.1,.25,.5,.75,1,1.5,2,-.5,-1]) {
  const el = Lamp(0,1,Vr,Ir,.18), U = factor * Vr;
  lamp.push({ Vr, Ir, factor, U, I: el.current([U,0]) });
}
const motor = [];
for (const dt of [1/120,1/60,.1]) {
  const state = { w:0, angle:0, stalled:false };
  const m = Motor(0,1,{},state), source = Source(0,1,3,.02);
  let V;
  for (let k=1;k<=300;k++) { const result = solveStep(2,[source,m],{dt,V,refs:[1]}); V=result.V; if ([1,10,60,300].includes(k)) motor.push({dt,step:k,U:V[0]-V[1],I:m.current(V),state:{...state},converged:result.converged}); }
}
const report = { purpose:'behavior-observation-only-not-independent-generation-input', lamp, motor };
fs.writeFileSync(new URL('../../docs/ownership/electric-behavior-baseline.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
