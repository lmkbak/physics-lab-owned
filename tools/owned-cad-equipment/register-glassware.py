"""Freeze independent geometry requirements for new families before build; no old geometry."""
import json
from pathlib import Path
P=Path(__file__).resolve().parent
R={x['number']:x for x in json.loads((P/'requirements.json').read_text(encoding='utf-8'))['requirements']}
DATA={
 'C29':{'groups':['short','long'],'checks':{'short':{'bounds_mm':[[-20,-20,0],[20,20,180]],'void':[[0,0,5],[0,0,154],[0,0,178]],'solid':[[2.6,0,30]]},'long':{'bounds_mm':[[-20,-20,0],[20,20,240]],'void':[[0,0,20],[0,0,214]],'solid':[[2.6,0,30]]}}},
 'C35':{'groups':['body','stopper','connector'],'checks':{'body':{'bounds_mm':[[-22,-22,0],[22,22,86]],'void':[[0,0,5],[0,0,48],[0,0,84]],'solid':[[3,0,15]]},'connector':{'bounds_mm':[[-2.5,-2.5,0],[2.5,2.5,45]],'void':[[0,0,20]],'solid':[[2,0,20]]}}},
 'C38':{'groups':['bridge','stand'],'checks':{'bridge':{'bounds_mm':[[-46,-6,0],[46,6,116]],'void':[[-40,0,20],[0,0,110],[40,0,20]],'solid':[[-45,0,20]]}}},
 'C39':{'groups':['tank','beam','electrodeA','electrodeB'],'checks':{'tank':{'bounds_mm':[[-60,-39,0],[60,39,90]],'void':[[0,0,30]],'solid':[[0,0,1],[59,0,30]]}}},
 'C40':{'groups':['rack','tube1','tube1_stopper','tube2','tube2_stopper'],'checks':{'tube1':{'bounds_mm':[[-11,-11,0],[11,11,190]],'void':[[0,0,50]],'solid':[[0,0,1],[10,0,50]]},'tube2':{'bounds_mm':[[-11,-11,0],[11,11,190]],'void':[[0,0,50]],'solid':[[10,0,50]]}}},
 'C41':{'groups':['body','support','stopper0','stopper1','stopper2'],'checks':{'body':{'bounds_mm':[[-55.66,-45,0],[55.66,45,135]],'void':[[0,0,45],[0,0,133]],'solid':[[0,44.3,45]]}}},
 'C48':{'groups':['body','support','stopper0'],'checks':{'body':{'bounds_mm':[[-45,-45,0],[60,45,135]],'void':[[0,0,45],[0,0,107],[58,0,107]],'solid':[[0,44.3,45]]}}},
 'C60':{'groups':['bottle','stopper','tubeA','tubeB'],'checks':{'bottle':{'bounds_mm':[[-34,-34,0],[34,34,150]],'void':[[0,0,100]],'solid':[[0,0,1],[33,0,70]]},'tubeA':{'bounds_mm':[[-3.4,-3.4,0],[3.4,3.4,55]],'void':[[0,0,20]],'solid':[[3,0,20]]}}},
 'C61':{'groups':['T','Y','sleeve'],'checks':{'T':{'bounds_mm':[[-22,-4,0],[22,4,39]],'void':[[0,0,5],[0,0,35],[20,0,35]],'solid':[[3.2,0,10]]},'Y':{'bounds_mm':[[-24.828427,-4,0],[24.828427,4,59.828427]],'void':[[0,0,10],[-20,0,55],[20,0,55]]}}},
 'C62':{'groups':['adapter','upper','clip'],'checks':{'adapter':{'bounds_mm':[[-12,-12,0],[12,12,58]],'void':[[0,0,5],[0,0,45]],'solid':[[6.5,0,5],[11.5,0,40]]}}},
 'C67':{'groups':['stand','funnel','cup'],'checks':{'cup':{'bounds_mm':[[-40,-40,0],[40,40,70]],'void':[[0,0,30]],'solid':[[0,0,.75],[39,0,30]]}}},
 'C68':{'groups':['stand','tube','boat','left_stopper','left_connector','right_stopper','right_connector'],'checks':{'tube':{'bounds_mm':[[0,-14,-14],[240,14,14]],'void':[[10,0,0],[120,0,0],[230,0,0]],'solid':[[120,13.3,0]]}}},
 'C70':{'groups':['stand','cup','membrane','upper','lower'],'checks':{'cup':{'bounds_mm':[[-50,-50,0],[50,50,115]],'void':[[0,0,60]],'solid':[[49.2,0,60]]},'membrane':{'bounds_mm':[[-16,-16,0],[16,16,76]],'void':[[0,0,30]],'solid':[[15.9,0,30],[0,0,.1]]}}},
 'C71':{'groups':['outer','insulation','inner','lid','probe','stirrer'],'checks':{'inner':{'bounds_mm':[[-38,-38,0],[38,38,83]],'void':[[0,0,40]],'solid':[[37.4,0,40]]}}},
 'C73':{'groups':['tank','lid','clip','paper','front','spotA','spotB'],'checks':{'tank':{'bounds_mm':[[-55,-32.5,0],[55,32.5,145]],'void':[[0,0,100]],'solid':[[54,0,80]]}}},
 'C74':{'groups':['box','lid','light','sample','absorber'],'checks':{'sample':{'bounds_mm':[[-16,-16,0],[16,16,75]],'void':[[0,0,40]],'solid':[[15.2,0,30],[0,0,.75]]}}}
}
assets={}
for n,d in DATA.items():
 r=R[n];labels=[x['label']for x in r['groups']];groups={g:labels[min(i,len(labels)-1)]for i,g in enumerate(d['groups'])}
 assets[n]=dict(asset=r['asset'],design='Independent hollow BRep design from functional facts; detailed new dimensions in own glassware.py; no old geometry',groups=groups,dimensions={'source':'independent constants in glassware.py (to be fully parameterized)'},checks=d['checks'],pending=['full local critical-section checks','all original graduations','profile/capacity oracle','full group mapping review'])
(P/'specs-glassware.json').write_text(json.dumps({'schema':'independent-cad-equipment-specs/1','ready':False,'assets':assets},indent=2),encoding='utf-8')
print('registered',len(assets))
