"""stdout-only independent local CAD check; explicit --write persists receipt."""
import argparse
import json
from pathlib import Path
from verify_first_batch import verify_asset
HERE=Path(__file__).resolve().parent

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');parser.add_argument('--full',action='store_true');args=parser.parse_args()
 keys=['chem_conical_flask_owned','chem_droppers_owned','chem_porcelain_heating_owned','chem_round_flasks_owned']
 results=[verify_asset(HERE/'out'/key) for key in keys]
 receipt={'schema':'owned-cad-oracle-verification/1','result':'PASS_LOCAL_BREP_SECTIONS_AND_ORACLE_SELFCHECK_ONLY','replacementReady':False,'runtimeProfileVerified':False,'localThicknessVerified':False,'chordalDeviationVerified':False,'assets':results}
 if args.write:(HERE/'out'/'second-verification.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(receipt if args.full else {'result':receipt['result'],'assets':len(results),'profiles':sum(len(a['profiles']) for a in results),'replacementReady':False,'wroteReceipt':args.write}))
if __name__=='__main__':main()
