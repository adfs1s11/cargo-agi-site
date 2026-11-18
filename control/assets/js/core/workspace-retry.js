import {canonical,delta,overlayChanges,recordKey} from './cloud-model.js';

// Only an explicit retry may advance the base of a rejected request. Any row
// edited on both sides requires review; no financial/safety validation is skipped.
export function rebasePendingRecords(base,latest,local){
 if(base.manifest.baseImportId!==latest.manifest.baseImportId||canonical(base.manifest.profile)!==canonical(latest.manifest.profile)||canonical(base.loadedStores)!==canonical(latest.loadedStores))throw Error('원장 기준 또는 권한이 변경됐습니다. 작업을 백업한 뒤 관리자에게 확인하세요.');
 const changes=delta(base.records,local,base.loadedStores);
 for(const c of changes){
  const remote=(latest.records[c.store]||[]).find(r=>recordKey(c.store,r)===c.key)??null;
  if(canonical(remote)!==canonical(c.before))throw Error('같은 자료가 다른 곳에서도 변경되어 자동으로 합치지 않았습니다. 입력은 보관 중입니다. 작업 백업 후 관리자에게 확인하세요.');
 }
 return {records:overlayChanges(latest.records,changes),changes};
}
