// Requirement-only extraction. No media, geometry, original CAD scripts or inventory read.
import {readFile,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile(new URL('../../docs/ownership/cad-coverage.json',import.meta.url),'utf8'));
const requirements=source.chemistry.filter(x=>Number(x.number.slice(1))>=25&&Number(x.number.slice(1))<=74).map(x=>({number:x.number,asset:x.asset,id:x.id,name:x.name,category:x.category,dimensionFact:x.specificationEvidence.dimension,requirements:x.independentRequirements,groups:x.functionalGroups.map(g=>({label:g.label,ordinal:g.ordinal})),runtime:x.runtimeItemContracts,cavity:x.gaps.cavity,sockets:x.gaps.sockets,material:x.gaps.material,scales:x.gaps.scales,movable:x.gaps.movable}));
await writeFile(new URL('./requirements.json',import.meta.url),JSON.stringify({source:'docs/ownership/cad-coverage.json; functional facts only',geometryInput:false,requirements},null,2)+'\n');
console.log(JSON.stringify(requirements.map(x=>({number:x.number,name:x.name,groups:x.groups.map(g=>g.label),runtime:x.runtime})),null,2));
