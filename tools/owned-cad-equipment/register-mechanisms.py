import json
from pathlib import Path
P=Path(__file__).resolve().parent
reqs={x['number']:x for x in json.loads((P/'requirements.json').read_text(encoding='utf-8'))['requirements']}
keys={
'C25':['thermometer','sleeve','cap','column','scale'],
'C27':['clipA','brush','clipB','spring'],
'C31':['bowl','plate','lid'],
'C34':['barrel','seal','plunger','scale'],
'C36':['frame','screw','press','hose'],
'C42':['base','inlet','mix','air'],
'C43':['base','case','pan','loadcell','circuit'],
'C44':['base','case','motor','magnet','stirbar'],
'C45':['base','outer','liner','lid','rings'],
'C46':['stand','tube','hose','bead','tip','scale','stopcock'],
'C47':['body','lower','upper','stand'],
'C55':['base','case','panel','transformer','rectifier','board','posts','switch','cable'],
'C57':['base','case','circuit','switch','display','probeA','probeB'],
'C58':['base','case','probe','board','cable'],
'C64':['tube','stopcock','tip','stand','scale','bottle','hose'],
'C69':['stand','barrel','seal','plunger','cap','microcup','scale']}
assets={}
for n,gs in keys.items():
 r=reqs[n];labels=[g['label']for g in r['groups']]
 assets[n]={'asset':r['asset'],'design':'Independent physical-function BRep design; own dimensions in mechanisms.py; not reconstructed media','groupKeys':gs,'groups':{g:labels[min(i,len(labels)-1)]for i,g in enumerate(gs)},'checks':{},'pending':['group functional cross-review','graduation numbers and full profiles','new dimension parameterization','critical sections','fresh and visual review']}
(P/'specs-mechanisms.json').write_text(json.dumps({'schema':'independent-cad-equipment-specs/1','assets':assets},indent=2),encoding='utf-8')
print('registered',len(assets))
