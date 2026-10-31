"""Read-only inventory and mesh/STEP metrology of independently generated outputs."""
import argparse
import base64
import json
from pathlib import Path
import numpy as np
import trimesh
import cadquery as cq
HERE=Path(__file__).resolve().parent

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');parser.add_argument('--only',nargs='*');a=parser.parse_args();assets=[]
 folders=sorted((HERE/'out').glob('*_owned'))
 for folder in folders:
  if a.only and folder.name not in a.only:continue
  if not (folder/'scene.json').exists():continue
  s=json.loads((folder/'scene.json').read_text(encoding='utf-8'));rows=[];fail=[]
  for m in s['meshes']:
   assert 'positions' not in m and 'indices' not in m,'Numeric-array legacy scene rejected'
   mesh=trimesh.Trimesh(np.frombuffer(base64.b64decode(m['posB64']),dtype='<f4').reshape(-1,3),np.frombuffer(base64.b64decode(m['idxB64']),dtype='<u4').reshape(-1,3),process=False,validate=False)
   row={'name':m['name'],'group':m['group'],'triangles':len(mesh.faces),'marking':m['marking']}
   if not m['marking']:
    step=folder/(m['name']+'.step')
    if not step.exists():fail.append(m['name']+':missing-step')
    else:
     cad=cq.importers.importStep(str(step)).val();vol=cad.Volume();error=abs(abs(mesh.volume)-vol)/vol*100 if vol else float('inf')
     row.update(brepValid=cad.isValid(),meshWatertight=bool(mesh.is_watertight),recomputedVolumeError_pct=error)
     if not cad.isValid() or not mesh.is_watertight or error>.2:fail.append(m['name']+':metrology')
   rows.append(row)
  if sum(r['triangles'] for r in rows)>60000:fail.append('asset:triangle-budget')
  if (folder/'scene.json').stat().st_size>3000000:fail.append('asset:scene-byte-budget')
  assets.append({'asset':s['asset'],'meshCount':len(rows),'triangles':sum(r['triangles'] for r in rows),'jsonBytes':(folder/'scene.json').stat().st_size,'glbBytes':(folder/(folder.name+'.glb')).stat().st_size,'profiles':len(s['profiles']),'groups':rows,'failures':fail,'replacementReady':False})
  print(json.dumps({'asset':s['asset'],'meshes':len(rows),'triangles':sum(r['triangles'] for r in rows),'failures':fail}),flush=True)
 receipt={'schema':'owned-output-metrology/1','result':'PASS_LOCAL_MESH_BREP_VOLUME_ONLY' if not any(a['failures'] for a in assets) else 'FAIL_LOCAL_METROLOGY','replacementReady':False,'assets':assets,'trianglesTotal':sum(a['triangles'] for a in assets),'jsonBytesTotal':sum(a['jsonBytes'] for a in assets),'glbBytesTotal':sum(a['glbBytes'] for a in assets),'performancePending':True,'chordDeviationPending':True,'wallThicknessPending':True}
 if a.write:(HERE/'out'/'output-audit.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({k:v for k,v in receipt.items() if k!='assets'}))
 if any(a['failures'] for a in assets):raise SystemExit(1)
if __name__=='__main__':main()
