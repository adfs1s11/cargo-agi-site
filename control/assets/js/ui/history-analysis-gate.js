import {supabaseMode} from '../core/supabase-session.js';
import {referenceHistoryReady,ensureReferenceHistory} from '../core/supabase-cloud.js';
export function historyAnalysisGate(view,ready){
 if(!supabaseMode()||referenceHistoryReady())return false;
 view.innerHTML='<div class="card card-pad"><h2>추천 이력 분석</h2><p>월별 현황·파일 대조는 선택한 달만 조회하는 월별 운송이력에서 빠르게 확인하세요.</p><div class="toolbar"><a class="btn btn-primary" href="#/monthly-history" data-link>월별 운송이력 · 엑셀 대조</a><button class="btn btn-ghost" id="history-analysis-start">전체 참고 이력 분석 시작</button></div><p class="small muted">전체 분석은 과거 이력을 처음 한 번 준비합니다. 배차나 정산 자료를 변경하지 않습니다.</p><p id="history-analysis-progress" role="status"></p></div>';
 const button=view.querySelector('#history-analysis-start'),progress=view.querySelector('#history-analysis-progress');button.onclick=async()=>{button.disabled=true;try{await ensureReferenceHistory(p=>{if(view.isConnected)progress.textContent=p.store+' · '+p.loaded.toLocaleString()+' / '+p.total.toLocaleString()+'건';});if(!view.isConnected)return;progress.textContent='이력 준비 완료 · 전체 분석 중…';await new Promise(resolve=>setTimeout(resolve,0));ready();}catch(e){if(view.isConnected){progress.textContent=e.message;button.disabled=false;}}};return true;
}
