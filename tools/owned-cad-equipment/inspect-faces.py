import json,base64
from pathlib import Path
import numpy as np,trimesh,cadquery as cq
P=Path(__file__).resolve().parent
for asset,g in [('chem_branch_connectors_cadquery','T'),('chem_buchner_filtration_cadquery','bottle')]:
 s=json.loads((P/'out'/asset/'scene.json').read_text());e=next(m for m in s['meshes']if m['group']==g)
 m=trimesh.Trimesh(np.frombuffer(base64.b64decode(e['posB64']),dtype='<f4').reshape(-1,3),np.frombuffer(base64.b64decode(e['idxB64']),dtype='<u4').reshape(-1,3),process=False)
 sh=cq.importers.importStep(str(P/'out'/asset/(g+'.step'))).val();worst=[]
 for idx in np.linspace(0,len(m.faces)-1,500,dtype=int):
  p=m.triangles_center[idx];v=cq.Vertex.makeVertex(*p);d=min(v.distance(f)for f in sh.Faces());worst.append((d,idx,p.tolist(),m.triangles[idx].tolist()))
 print(asset,sorted(worst,reverse=True)[:3])
