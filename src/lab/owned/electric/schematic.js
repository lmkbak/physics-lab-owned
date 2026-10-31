// Independent SVG circuit notation. Electrical metadata comes from owned models.
import { TYPES, shortValue } from './models.js';
export const escapeXML = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const number = v => Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
const path = d => `<path d="${d}"/>`;
const line = (a,b,c,d) => `<path d="M${a} ${b}L${c} ${d}"/>`;
const circle = (x,y,r,attrs='') => `<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`;
const text = (x,y,v,attrs='') => `<text x="${x}" y="${y}" ${attrs}>${escapeXML(v)}</text>`;
const palette = {red:'#ba4439',black:'#657488',yellow:'#ac8314',blue:'#316eae',green:'#278459',white:'#8092a1',orange:'#bd7523'};
export function meterReading(r={}) {
  if (!Number.isFinite(r.reading)) return '—';
  let s=r.reading.toFixed(r.unit==='μA'?0:r.range>=15?1:2);
  if (/^-0(?:\.0*)?$/.test(s)) s=s.slice(1);
  return `${s} ${r.unit??''}`.trim();
}
const styles=`<style>
.oe-part{cursor:pointer;touch-action:manipulation;color:#233c51}.oe-hit{fill:transparent;stroke:transparent}.oe-part:hover,.oe-part:focus{color:#066b9b}.oe-part:focus .oe-hit{stroke:#087cae;stroke-width:2;fill:#e6f4fa}.oe-body{fill:#fff;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.oe-body path{fill:none;vector-effect:non-scaling-stroke}.oe-body text{stroke:none;fill:currentColor;text-anchor:middle;font:14px system-ui}.oe-label{fill:#20394e;font:600 12px system-ui;text-anchor:middle}.oe-sub{fill:#50677c;font:11px system-ui;text-anchor:middle}.oe-read{fill:#00648e;font:600 12px system-ui;text-anchor:middle;font-variant-numeric:tabular-nums}.oe-pin{fill:#fff;stroke:#536e81;stroke-width:1.3}.oe-term{fill:#536b7d;font:10px system-ui}.oe-wire{fill:none;stroke:#6a7d8e;stroke-width:1.6;stroke-linejoin:round;vector-effect:non-scaling-stroke}.oe-flow{fill:none;stroke:#079ab1;stroke-width:2.5;stroke-dasharray:3 9;opacity:0;pointer-events:none;vector-effect:non-scaling-stroke}.oe-flow.electron{stroke:#9e57c4}.oe-node{fill:#286981;stroke:#fff;stroke-width:1}.oe-state{fill:#a1462c;font:10px system-ui;text-anchor:middle}.oe-note{fill:#47647a;font:12px system-ui}
@media(prefers-reduced-motion:reduce){.oe-flow{stroke-dasharray:none!important}}
</style>`;
export function portLocations(p) {
  if(p.type==='dpdt') return {A1:[-34,-36],C1:[-66,0],B1:[-34,36],A2:[34,-36],C2:[66,0],B2:[34,36]};
  if(p.type==='rheostat') return {A:[-66,0],B:[66,0],C:[-22,-36],D:[22,-36]};
  if(p.type==='ammeter') return {'-':[-66,0],'0.6':[66,-22],'3':[66,22]};
  if(p.type==='voltmeter') return {'-':[-66,0],'3':[66,-22],'15':[66,22]};
  return Object.fromEntries(Object.keys(TYPES[p.type]?.terms??{}).map((t,i)=>[t,[i%2?66:-66,Math.floor(i/2)*22]]));
}
function symbol(p) {
  const t=p.type,q={...TYPES[t]?.params,...p.params},s=p.state??{};
  const leads=line(-66,0,-28,0)+line(28,0,66,0),box='<rect x="-28" y="-12" width="56" height="24" rx="1"/>';
  if(t.startsWith('resistor')||['resbox','ntc','ldr','rheostat'].includes(t)) {
    let out=leads+box;
    if(t==='resbox') out+=text(0,5,'R');
    if(t==='ntc') out+=path('M-21 22L21 -22H28')+text(19,30,'−t°');
    if(t==='ldr') out+=path('M-25 -32L-13 -18M-24 -23L-13 -18L-15 -29M-3 -32L9 -18M-2 -23L9 -18L7 -29');
    if(t==='rheostat') {const x=-22+44*Math.max(0,Math.min(1,q.s??0));out+=path(`M-22 -36V-25H22V-36M0 -25H${x}V-12M${x-4} -18L${x} -12L${x+4} -18`);}
    return out;
  }
  if(t==='battery') return line(-66,0,-14,0)+line(14,0,66,0)+line(-14,-23,-14,23)+line(0,-12,0,12)+line(14,-23,14,23)+text(-30,-13,'+');
  if(t==='dcsupply') return leads+circle(0,0,28)+text(0,5,'DC')+text(-17,-11,'+')+text(16,-11,'−');
  if(t==='switch') return line(-66,0,-22,0)+line(22,0,66,0)+circle(-22,0,3)+circle(22,0,3)+line(-22,0,22,q.closed?0:-24);
  if(t==='dpdt') return [-34,34].map((x,i)=>line(i?66:-66,0,x,0)+circle(x,0,3)+circle(x,-36,3)+circle(x,36,3)+line(x,0,x+(q.pos==='off'?(i?-10:10):0),q.pos==='A'?-36:q.pos==='B'?36:-20)).join('')+path('M-23 -11H23');
  if(t==='lamp') return leads+circle(0,0,27)+path(s.burnt?'M-17 -17L-3 -3M4 4L17 17M-17 17L17 -17':'M-18 -18L18 18M-18 18L18 -18');
  if(t==='led'||t==='diode') return leads+path('M-24 -18V18L15 0Z M18 -20V20')+(t==='led'?path('M0 -27L12 -39M6 -39H12V-33M19 -25L31 -37M25 -37H31V-31'):'');
  if(TYPES[t]?.meter) return line(-66,0,-27,0)+circle(0,0,27)+text(0,6,t==='ammeter'?'A':t==='voltmeter'?'V':'G')+(t==='galvanometer'?line(27,0,66,0):path('M27 0H43L66 -22M43 0L66 22'));
  if(t==='capacitor'||t==='elcap') return line(-66,0,-7,0)+line(9,0,66,0)+line(-7,-25,-7,25)+(t==='capacitor'?line(9,-25,9,25):path('M13 -25Q0 0 13 25'))+(t==='elcap'?text(-24,-13,'+'):'');
  if(t==='motor') return leads+circle(0,0,27)+text(0,6,'M')+path('M-14 -33Q0 -43 14 -33M9 -39L14 -33L7 -31');
  if(t==='solenoid') return line(-66,0,-32,0)+path('M-32 0C-32 -29 -16 -29 -16 0C-16 -29 0 -29 0 0C0 -29 16 -29 16 0C16 -29 32 -29 32 0')+line(32,0,66,0)+(q.core?path('M-30 10H30M-30 16H30'):'');
  if(t==='fuse') return leads+box+path(s.blown?'M-28 0H-5M6 0H28':'M-28 0H28');
  return leads+box+text(0,5,'?');
}
function status(p) {
  if(p.state?.burnt)return '已损坏 · 断开';if(p.state?.blown)return '已熔断 · 断开';
  if(p.type==='switch')return p.params?.closed?'闭合':'断开';if(p.type==='dpdt')return `位置 ${p.params?.pos??'off'}`;
  if(p.type==='motor'&&p.params?.stalled)return '转子锁定';if(p.type==='dcsupply')return p.params?.on===false?'输出关闭':p.live?.mode??'CV';return '';
}
export function deviceSVG(p,center,report=p.live,flow=null) {
  const name=TYPES[p.type]?.name??p.type,id=escapeXML(p.id),[x,y]=center;
  let value='';try{value=shortValue({...p,params:{...TYPES[p.type]?.params,...p.params}});}catch{}
  const key="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.dispatchEvent(new MouseEvent('click',{bubbles:true}))}";
  let svg=`<g class="part oe-part" data-part="${id}" tabindex="0" role="button" aria-label="${escapeXML(`${p.label??p.id} ${name}`)}" onkeydown="${key}" transform="translate(${number(x)} ${number(y)})"><title>${escapeXML(name)}</title><rect class="oe-hit" x="-86" y="-66" width="172" height="151" rx="7"/><g class="oe-body">${symbol(p)}</g>`;
  svg+=Object.entries(portLocations(p)).map(([t,[px,py]])=>circle(px,py,2.8,`class="oe-pin" data-terminal="${escapeXML(t)}"`)+text(px+(px<0?5:-5),py-7,t,`class="oe-term" text-anchor="${px<0?'start':'end'}"`)).join('');
  svg+=text(0,-51,`${p.label??p.id} · ${name}`,'class="oe-label"');
  svg+=TYPES[p.type]?.meter?text(0,61,meterReading(report),`class="oe-read" data-read="${id}"`):text(0,61,value,'class="oe-sub"');
  if(status(p))svg+=text(0,77,status(p),'class="oe-state"');
  if(flow!==null){const [px,py]=Object.values(portLocations(p))[0]??[-66,0];const tx=px===0?0:px-Math.sign(px)*18,ty=py===0?0:py-Math.sign(py)*12;svg+=`<path class="flow oe-flow" data-flow="${flow}" d="M${px} ${py}L${tx} ${ty}"/>`;}
  return svg+'</g>';
}
function segmentHit(a,b,r) {
  if(a[0]===b[0])return a[0]>r.x-5&&a[0]<r.x+r.w+5&&Math.max(a[1],b[1])>r.y-5&&Math.min(a[1],b[1])<r.y+r.h+5;
  return a[1]>r.y-5&&a[1]<r.y+r.h+5&&Math.max(a[0],b[0])>r.x-5&&Math.min(a[0],b[0])<r.x+r.w+5;
}
function orthogonal(a,b,boxes,index,ac,bc) {
  const escape=(p,c)=>{const dx=p[0]-c[0],dy=p[1]-c[1];return Math.abs(dx)>=Math.abs(dy)?[p[0]+Math.sign(dx||1)*32,p[1]]:[p[0],p[1]+Math.sign(dy||1)*32];};
  const sa=escape(a,ac),sb=escape(b,bc),mx=(sa[0]+sb[0])/2,my=(sa[1]+sb[1])/2;
  const routes=[[a,sa,[mx,sa[1]],[mx,sb[1]],sb,b],[a,sa,[sa[0],my],[sb[0],my],sb,b]];
  for(const lane of [Math.min(a[1],b[1])-100-index%4*15,Math.max(a[1],b[1])+115+index%4*15])routes.push([a,sa,[sa[0],lane],[sb[0],lane],sb,b]);
  const score=points=>points.slice(1).reduce((n,p,i)=>n+Math.abs(p[0]-points[i][0])+Math.abs(p[1]-points[i][1])+3000*boxes.filter(r=>segmentHit(points[i],p,r)).length,0);
  return routes.sort((u,v)=>score(u)-score(v))[0];
}
export function diagramSVG(model,positions,{flows=false,live=p=>p.live,caption='电路连接图',terminalAnchors=null}={}) {
  const parts=model.parts??[],wires=model.wires??[];
  if(!parts.length)return {svg:styles+text(24,52,'先放入器材，再连接两端接线柱。','class="oe-note"'),viewBox:'0 0 480 110'};
  const anchors=new Map(),boxes=parts.map(p=>{const[x,y]=positions.get(p.id);for(const[t,[dx,dy]]of Object.entries(portLocations(p)))anchors.set(`${p.id}:${t}`,[x+dx,y+dy]);return{id:p.id,x:x-43,y:y-39,w:86,h:80};});
  if(terminalAnchors)for(const[k,v]of terminalAnchors)anchors.set(k,[...v]);
  const points=[],uses=new Map();let wiresSVG='',valid=0;
  wires.forEach((w,i)=>{
    const a=anchors.get(`${w.a?.p}:${w.a?.t}`),b=anchors.get(`${w.b?.p}:${w.b?.t}`);if(!a||!b)return;
    const pts=orthogonal(a,b,boxes,i,positions.get(w.a.p),positions.get(w.b.p));points.push(...pts);valid++;
    const d=pts.map((p,j)=>`${j?'L':'M'}${number(p[0])} ${number(p[1])}`).join('');
    wiresSVG+=`<path class="wire oe-wire" data-connection="${escapeXML(`${w.a.p}:${w.a.t}|${w.b.p}:${w.b.t}`)}" d="${d}" style="stroke:${palette[w.color]??'#657488'}"/><path class="flow oe-flow" data-wire="${escapeXML(w.id??`wire-${i}`)}" d="${d}"/>`;
    for(const[e,point]of[[w.a,a],[w.b,b]]){const k=`${e.p}:${e.t}`,v=uses.get(k)??{point,n:0};v.n++;uses.set(k,v);}
  });
  const dots=[...uses.values()].filter(v=>v.n>1).map(v=>circle(v.point[0],v.point[1],4,'class="oe-node"')).join('');
  const devices=parts.map((p,i)=>{const source=positions.get(p.id);let svg=deviceSVG(p,source,live(p),flows?i:null);const entries=Object.entries(portLocations(p));for(const [t,[dx,dy]]of entries){const actual=anchors.get(`${p.id}:${t}`),local=[source[0]+dx,source[1]+dy];if(actual&&(Math.abs(actual[0]-local[0])>.01||Math.abs(actual[1]-local[1])>.01))svg+=`<path class="wire oe-wire" data-terminal-link="${escapeXML(`${p.id}:${t}`)}" d="M${number(local[0])} ${number(local[1])}L${number(actual[0])} ${number(actual[1])}"/>`;}return svg;}).join('');
  for(const[, [x,y]]of positions)points.push([x-98,y-76],[x+98,y+96]);
  const minX=Math.min(...points.map(p=>p[0]))-20,minY=Math.min(...points.map(p=>p[1]))-38,maxX=Math.max(...points.map(p=>p[0]))+20,maxY=Math.max(...points.map(p=>p[1]))+24;
  return {svg:styles+text(minX+8,minY+20,caption,'class="oe-note"')+`<g data-wire-count="${valid}">${wiresSVG}${dots}${devices}</g>`,viewBox:[minX,minY,maxX-minX,maxY-minY].map(number).join(' ')};
}
export function renderSchematic(model,terminalPosition,partPosition) {
  const parts=model.parts??[],positions=new Map(),centers=parts.map((p,i)=>{let v;try{v=partPosition?.(p.id);}catch{}return Array.isArray(v)&&v.length>=2&&v.every(Number.isFinite)?v:[Number.isFinite(p.x)?p.x:i%4*300,Number.isFinite(p.y)?p.y:Math.floor(i/4)*220];});
  const xs=[...new Set(centers.map(p=>p[0]))].sort((a,b)=>a-b),ys=[...new Set(centers.map(p=>p[1]))].sort((a,b)=>a-b),used=new Set();
  parts.forEach((p,i)=>{let x=xs.indexOf(centers[i][0]),y=ys.indexOf(centers[i][1]);while(used.has(`${x}:${y}`))x++;used.add(`${x}:${y}`);positions.set(p.id,[110+x*220,100+y*205]);});
  const terminalAnchors=new Map();
  if(typeof terminalPosition==='function'&&parts.length){
    let gap=Infinity;for(let i=0;i<centers.length;i++)for(let j=0;j<i;j++){const d=Math.hypot(centers[i][0]-centers[j][0],centers[i][1]-centers[j][1]);if(d>1e-6)gap=Math.min(gap,d);}
    const scale=Number.isFinite(gap)?Math.max(1,220/gap):1,minX=Math.min(...centers.map(c=>c[0])),minY=Math.min(...centers.map(c=>c[1]));
    parts.forEach((p,i)=>{positions.set(p.id,[(centers[i][0]-minX)*scale+110,(centers[i][1]-minY)*scale+100]);for(const t of Object.keys(TYPES[p.type]?.terms??{})){let v;try{v=terminalPosition(p.id,t);}catch{}if(Array.isArray(v)&&v.length>=2&&v.every(Number.isFinite))terminalAnchors.set(`${p.id}:${t}`,[(v[0]-minX)*scale+110,(v[1]-minY)*scale+100]);}});
  }
  return diagramSVG(model,positions,{caption:'位置关系图 · 每条连接对应独立端子',terminalAnchors});
}
