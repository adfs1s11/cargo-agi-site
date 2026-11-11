// Poll metadata first; unchanged workspaces never count or read ledger rows.
export async function pollManifest(api,previous){
 const head=await api.head();
 const validate=result=>{
  if(result?.profile?.id!==previous.profile.id||result.profile.role!==previous.profile.role||result.profile.accessRevision!==previous.profile.accessRevision){const e=Error('계정 권한이 변경됐습니다. 다시 로그인하세요.');e.code='42501';throw e;}
  if(result.baseImportId!==previous.baseImportId)throw Error('운영 원장 기준이 변경됐습니다. 작업을 백업한 뒤 다시 접속하세요.');
  if(!Number.isSafeInteger(result.revision)||result.revision<previous.revision)throw Error('서버 자료 버전 확인이 필요합니다.');
 };
 validate(head);
 if(head.revision===previous.revision)return null;
 const manifest=await api.manifest();validate(manifest);
 if(manifest.revision<head.revision)throw Error('조회 중 자료 버전이 변경됐습니다. 다시 확인하세요.');
 return manifest;
}
export const pollRetryDelay=failures=>Math.min(300000,30000*2**Math.min(4,Math.max(0,failures-1)));
export function syncFailureMessage(error,stage){
 const timeout=error?.code==='57014'||/statement timeout|timeout|timed out|aborted/i.test(error?.message||'');
 if(stage==='save')return timeout?'저장 결과 확인이 지연됩니다. 작업은 이 브라우저에 보관 중입니다. ‘저장 다시 확인’을 누르세요.':`${error.message} · 작업은 이 브라우저에 보관 중입니다.`;
 return timeout?'자동 조회가 지연됐습니다. 마지막으로 확인한 자료를 표시하고 있습니다. 잠시 후 자동 재연결하며, ‘다시 연결’로 바로 확인할 수 있습니다.':`최신 자료 확인 실패 · ${error.message}`;
}
