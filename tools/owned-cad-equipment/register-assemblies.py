import json
from pathlib import Path
P=Path(__file__).resolve().parent
reqs={r['number']:r for r in json.loads((P/'requirements.json').read_text(encoding='utf-8'))['requirements']}
keys={'C49':['base','rod','boss','ring','clamp','jawA','jawB','padA','padB'],'C50':['base','top','frontA','frontB','rearA','rearB','screw','pivot'],'C52':['base','pillar','beam','pointer','scale','leftpan','leftsupport','rightpan','rightsupport'],'C53':['box','lid','weight0','weight1','weight2','weight3','weight4','tweezers'],'C56':['insulation','copper','bananaGrip','bananaPin','jawLower','jawUpper','hinge','boot','terminalInsulator','terminalConductor'],'C59':['body','stopper','valve','support'],'C63':['lower','middle','upper','stem','gasout','stopper','stand'],'C65':['base','left','leftpad','leftscrew','right','rightpad','rightscrew'],'C66':['column','top','bottom','stand'],'C72':['base','cup','probe','wire','lower','panel','board'],'C55':['shell','panel','base','transformer','bridge','capacitors','regulator','control','wires'],'C57':['case','head','switch','va','ac','ohm','accessories'],'C58':['case','panel','probe','stand','cap']}
assets={}
for n,gs in keys.items():
 r=reqs[n];labels=[g['label']for g in r['groups']]
 assets[n]={'asset':r['asset'],'design':'Independent functional BRep assembly; own dimensions and surfaces, no old input','groups':{g:labels[min(i,len(labels)-1)]for i,g in enumerate(gs)},'checks':{},'pending':['complete parameterization','full component contact and pivot oracles','functional group mapping','graduation/profile','fresh and visual review']}
(P/'specs-assemblies.json').write_text(json.dumps({'schema':'independent-cad-equipment-specs/1','assets':assets},indent=2),encoding='utf-8')
print('registered',len(assets))
