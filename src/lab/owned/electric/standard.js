// Terminal-net graph ranking, independent of device coordinates and preset identity.
import { TYPES } from './models.js';
import { diagramSVG } from './schematic.js';
const key = (id, t) => `${id}:${t}`;
export function renderStandard(model, { termIn = () => 0, live = () => undefined } = {}) {
  const parts = model.parts ?? [], wires = model.wires ?? [];
  if (!parts.length) return { ...diagramSVG(model, new Map()), flows: [] };
  const byId = new Map(parts.map(p => [p.id, p])), parent = new Map();
  if (byId.size !== parts.length || parts.some(p => !TYPES[p.type])) return null;
  const root = k => { if (!parent.has(k)) parent.set(k,k); if (parent.get(k)!==k) parent.set(k,root(parent.get(k))); return parent.get(k); };
  const union = (a,b) => parent.set(root(a),root(b));
  for (const p of parts) for (const t of Object.keys(TYPES[p.type].terms)) root(key(p.id,t));
  for (const w of wires) {
    const a=byId.get(w.a?.p),b=byId.get(w.b?.p);
    if(!a||!b||!TYPES[a.type].terms[w.a.t]||!TYPES[b.type].terms[w.b.t])return null;
    union(key(a.id,w.a.t),key(b.id,w.b.t));
  }
  // C and D are the same wiper conductor; all other ports remain distinct.
  for(const p of parts)if(p.type==='rheostat')union(key(p.id,'C'),key(p.id,'D'));
  const netParts=new Map();
  for(const p of parts)for(const t of Object.keys(TYPES[p.type].terms)){
    const r=root(key(p.id,t));if(!netParts.has(r))netParts.set(r,new Set());netParts.get(r).add(p.id);
  }
  const neighbors=new Map(parts.map(p=>[p.id,new Set()]));
  for(const ids of netParts.values())for(const a of ids)for(const b of ids)if(a!==b)neighbors.get(a).add(b);
  const rank=new Map(),components=[],pending=new Set(parts.map(p=>p.id));
  const sources=parts.filter(p=>p.type==='battery'||p.type==='dcsupply').map(p=>p.id);
  while(pending.size){
    const start=sources.find(id=>pending.has(id))??[...pending].sort()[0],queue=[start],component=[];
    rank.set(start,0);pending.delete(start);
    for(let q=0;q<queue.length;q++){
      const id=queue[q];component.push(id);
      for(const next of [...neighbors.get(id)].sort())if(pending.has(next)){pending.delete(next);rank.set(next,rank.get(id)+1);queue.push(next);}
    }
    components.push(component);
  }
  const positions=new Map();let band=0;
  for(const component of components){
    const layers=new Map();for(const id of component){const r=rank.get(id);if(!layers.has(r))layers.set(r,[]);layers.get(r).push(id);}
    const maxRows=Math.max(...[...layers.values()].map(v=>v.length));
    for(const [r,ids]of layers){
      // Stable barycentric neighbor ordering shortens cross-layer connections.
      ids.sort((a,b)=>{const avg=id=>{const ns=[...neighbors.get(id)].map(n=>positions.get(n)?.[1]).filter(Number.isFinite);return ns.length?ns.reduce((s,v)=>s+v,0)/ns.length:0;};return avg(a)-avg(b)||String(a).localeCompare(String(b));});
      ids.forEach((id,i)=>positions.set(id,[120+r*255,110+band*215+(i+(maxRows-ids.length)/2)*215]));
    }
    band+=maxRows+1;
  }
  const flows=parts.map(p=>()=>{
    const ports=Object.keys(TYPES[p.type].terms),first=ports[0];
    try{const I=termIn(p.id,first);return Number.isFinite(I)?I:0;}catch{return 0;}
  });
  const result=diagramSVG(model,positions,{flows:true,live:p=>live(p.id)??p.live,caption:'拓扑整理图 · 跨线不相接，端子连接以导线为准'});
  return {...result,flows};
}
