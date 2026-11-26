import {workspaceProfile,workspaceRpc,workspaceSession} from './supabase-session.js';

const format=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function koreaTime(value,missing='기록 없음'){
  const time=value?Date.parse(value):NaN;
  return Number.isFinite(time)?format.format(time):missing;
}
const scope=()=>JSON.stringify([workspaceProfile()?.id,workspaceProfile()?.accessRevision,workspaceSession()?.nonce]);
let latestTime,latestSheet;
export function showRevisionTime(host,manifest,label='표시 원장'){
  if(!host||!manifest||!Number.isSafeInteger(manifest.revision))return;
  const key=JSON.stringify([scope(),manifest.baseImportId,manifest.revision]);
  host.dataset.basis=key;
  const prefix=label+' '+manifest.revision.toLocaleString()+'차 · 원장 기록 시각 ';
  host.textContent=prefix+'조회 중…';
  if(latestTime?.key!==key){
    const request=workspaceRpc('tms_workspace_revision_time',{p_base:manifest.baseImportId,p_revision:manifest.revision},{timeoutMs:6000});
    latestTime={key,request};
    request.catch(()=>{if(latestTime?.request===request)latestTime=null;});
  }
  const set=value=>{if(host.isConnected&&host.dataset.basis===key)host.textContent=prefix+value;};
  latestTime.request.then(value=>set(koreaTime(value,'기록 없음')+' (한국시간)'),()=>set('확인 불가'));
}
export function readSheetStatus({force=false}={}){
  const key=scope();
  if(latestSheet?.key===key&&(!latestSheet.done||!force&&Date.now()-latestSheet.at<15000))return latestSheet.request;
  const entry={key,done:false};
  entry.request=workspaceRpc('mm_sheet_status',{},{timeoutMs:8000}).then(data=>{
    entry.done=true;entry.at=Date.now();return data;
  },error=>{if(latestSheet===entry)latestSheet=null;throw error;});
  latestSheet=entry;return entry.request;
}
export function sheetDayText(d){
  return d.day+' 배차 · 시트 자동 대조 완료 '+koreaTime(d.verified_at)+' · 마지막 변경 반영 '+koreaTime(d.applied_at);
}
export function showStartupSheets(host){
  if(!['admin','dispatch'].includes(workspaceProfile()?.role))return;
  host.textContent='금일·익일 구글시트 갱신 이력 확인 중…';
  readSheetStatus().then(data=>{
    if(!host.isConnected)return;
    host.textContent=[data.enabled?'구글시트 자동 갱신 (한국시간)':'구글시트 자동 갱신 중지',...(data.days||[]).map(sheetDayText)].join('\n');
    if(!data.days?.length)host.textContent+=' · 금일·익일 확인 기록 없음';
  },()=>{if(host.isConnected)host.textContent='구글시트 갱신 이력 확인 불가 · 운영 원장 조회는 계속합니다.';});
}
