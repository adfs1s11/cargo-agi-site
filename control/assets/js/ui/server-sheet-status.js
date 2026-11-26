import {workspaceProfile,workspaceRpc,supabaseMode} from '../core/supabase-session.js';
import {recoverSheetConnection} from '../core/sheet-connection.js';
import {sourceCall,spreadsheetId} from '../core/sheet-import.js';
import {esc} from '../core/utils.js';
import {readSheetStatus,sheetDayText,koreaTime} from '../core/workspace-freshness.js';

const labels={queued:'실행 대기',running:'원본 확인 중',no_tab:'일자 탭 없음',failed:'재확인 필요',verified:'원장 대조 완료'};
export function mountServerSheetStatus(view){
 const role=workspaceProfile()?.role;
 if(!supabaseMode()||!['admin','dispatch'].includes(role))return;
 const panel=document.createElement('section');panel.className='card card-pad';
 panel.innerHTML='<div class="row"><h3>구글시트 자동 갱신</h3><button class="btn btn-sm btn-ghost" data-check>상태 확인</button></div><p data-note role="status">서버 실행 기록 확인 중…</p><div data-days></div><button class="btn btn-sm btn-ghost" data-config hidden></button>';
 const root=view.querySelector('.dispatch-dashboard')||view;
 const head=root.querySelector('.page-head');if(head)head.after(panel);else root.prepend(panel);
 const note=panel.querySelector('[data-note]'),days=panel.querySelector('[data-days]'),configButton=panel.querySelector('[data-config]');
 const check=panel.querySelector('[data-check]');let enabled=false,busy=false;
 async function load(force=false){
  if(busy)return;busy=true;check.disabled=true;
  try{
   const data=await readSheetStatus({force});
   if(!panel.isConnected)return;
   enabled=data.enabled;panel.dataset.serverSync=String(enabled);
   note.textContent=enabled?'금일·익일 배차를 날짜별로 10분마다 확인합니다. '+(data.days?.length?'시간은 한국 기준입니다.':'첫 실행을 기다리고 있습니다.'):'서버 자동 갱신 연결 전입니다.';
   configButton.hidden=role!=='admin';configButton.textContent=enabled?'자동 갱신 일시 중지':'이 PC의 시트 연결로 자동 갱신 시작';
   days.innerHTML=(data.days||[]).map(d=>{
    const issues=d.issues||[],stale=enabled&&Date.now()-Date.parse(d.started)>20*60000;
    return '<p>'+esc(sheetDayText(d))+'</p><details><summary>'+esc(d.day)+' · '+esc(labels[d.status]||d.status)+(stale?' · 갱신 지연':'')+(d.status==='verified'?' · 신규 '+Number(d.inserted)+' · 변경 '+Number(d.updated)+' · 보류 '+issues.length:'')+'</summary><p>최근 시도 '+esc(koreaTime(d.started))+'</p><p>'+esc(d.stage||'')+'</p>'+issues.map(i=>'<p>'+esc(String(i.row))+'행 · '+esc(i.reason)+'</p>').join('')+'</details>';
   }).join('');
  }catch{note.textContent='서버 실행 기록을 확인하지 못했습니다. 상태 확인을 눌러 다시 조회하세요.';}
  finally{busy=false;check.disabled=false;}
 }
 configButton.onclick=async()=>{
  configButton.disabled=true;
  try{
   if(enabled){await workspaceRpc('mm_sheet_pause',{});}
   else{
    const c=await recoverSheetConnection(),id=spreadsheetId(c.sourceUrl);
    note.textContent='등록된 원본 시트 연결을 확인하고 있습니다.';
    const meta=await sourceCall(c,'mainMeta',{spreadsheetId:id,year:new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date())});
    if(meta.spreadsheetId!==id||meta.version!=='main-readonly-1')throw Error('원본 배차판을 확인하세요.');
    await workspaceRpc('mm_sheet_configure',{p_url:c.url,p_id:id,p_token:c.token});
   }
   await load(true);
  }catch{note.textContent='설정을 저장하지 못했습니다. 원본 구글시트 연결 설정과 관리자 로그인을 확인하세요.';}
  finally{configButton.disabled=false;}
 };
 check.onclick=()=>load(true);load();
 const timer=setInterval(()=>{if(!panel.isConnected){clearInterval(timer);return;}if(!document.hidden)load();},60000);
 return panel;
}
