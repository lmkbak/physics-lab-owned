"""Software-render owned scenes only; no reference image/font input."""
import base64,json,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent
assets=list(json.loads((ROOT/'design-specs.json').read_text())['assets'])
W,H=420,350;canvas=Image.new('RGB',(W*4,H*6),(241,244,247))
# Original CAD Z-up iso projection, front -Y visible.
view=np.array([1,-1.6,1.1]);view/=np.linalg.norm(view);right=np.cross([0,0,1],view);right/=np.linalg.norm(right);up=np.cross(view,right)
light=np.array([-.2,-.6,1]);light/=np.linalg.norm(light)
for index,asset in enumerate(assets):
    scene=json.loads((ROOT/'out'/asset/'scene.json').read_text());tris=[];colors=[]
    for m in scene['meshes']:
        v=np.frombuffer(base64.b64decode(m['posB64']),dtype='<f4').reshape(-1,3)+np.array(m['assemblyOffset_mm']);f=np.frombuffer(base64.b64decode(m['idxB64']),dtype='<u4').reshape(-1,3)
        t=v[f];n=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
        visible=(n@view)>0
        if m['opacity']<.6:continue
        t=t[visible];n=n[visible]
        shade=.45+.55*np.maximum(n@light,0);c=np.clip(np.array(m['color'])*shade[:,None]*255,0,255).astype('uint8')
        tris.extend(t);colors.extend(c)
    t=np.array(tris);c=np.array(colors);xy=np.stack([t@right,-t@up],axis=-1);bounds=np.array([xy.min(axis=(0,1)),xy.max(axis=(0,1))]);scale=min((W-35)/(bounds[1,0]-bounds[0,0]),(H-55)/(bounds[1,1]-bounds[0,1]));xy=(xy-(bounds[0]+bounds[1])/2)*scale+[W/2,H/2+10]
    tile=Image.new('RGB',(W,H),(241,244,247));draw=ImageDraw.Draw(tile)
    for j in np.argsort(t.mean(axis=1)@view):draw.polygon([tuple(x) for x in xy[j]],fill=tuple(c[j]))
    # ASCII type name with Pillow built-in bitmap font; geometry uses no fonts.
    draw.text((14,12),asset,fill=(30,45,60));canvas.paste(tile,((index%4)*W,(index//4)*H))
canvas.save(ROOT/'out'/'contact-sheet.png')
print('contact-sheet.png',canvas.size)
