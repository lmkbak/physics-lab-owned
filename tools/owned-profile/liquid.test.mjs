import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCavityProfile } from '../../src/lab/owned/cad/profile.js';
import { createLiquidGeometry } from '../../src/lab/owned/cad/liquid.js';
let checked = 0;
for (const asset of ['chem_beakers_owned','chem_test_tubes_owned','chem_graduated_cylinders_owned','chem_reagent_bottles_owned']) {
  const data=JSON.parse(fs.readFileSync(new URL(`../owned-cad/out/${asset}/scene.json`,import.meta.url)));
  for(const [name,spec] of Object.entries(data.profiles)) {
    const p=createCavityProfile(spec);
    for(const fraction of [.01,.25,.5,.75,1]) {
      const expected=p.fullCapacity*fraction;
      const g=createLiquidGeometry(p,{volumeMl:expected});
      const pos=g.getAttribute('position'),idx=g.index.array;
      const edges=new Map(); let volumeM3=0;
      const P=i=>[pos.getX(i),pos.getY(i),pos.getZ(i)];
      for(let i=0;i<idx.length;i+=3){
        const ids=[idx[i],idx[i+1],idx[i+2]], [a,b,c]=ids.map(P);
        volumeM3+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
        for(let k=0;k<3;k++){const x=ids[k],y=ids[(k+1)%3],key=x<y?`${x}:${y}`:`${y}:${x}`;edges.set(key,(edges.get(key)??0)+1);}
      }
      assert.ok(volumeM3>0,`${name} has inverted winding`);
      for(const n of edges.values())assert.equal(n,2,`${name} nonmanifold liquid edge`);
      const volumeMl=volumeM3*1e6,relative=Math.abs(volumeMl-expected)/expected;
      assert.ok(relative<.002,`${name} mesh relative volume ${relative}`);
      assert.equal(g.userData.nonAxisymmetric,!!p.nonAxisymmetric);
      g.dispose();checked++;
    }
    const empty=createLiquidGeometry(p,{volumeMl:0});assert.equal(empty.index.count,0);empty.dispose();
  }
}
console.log(JSON.stringify({pass:true,closedLiquidMeshes:checked,volumeToleranceRelative:.002,productionIntegrated:false}));
