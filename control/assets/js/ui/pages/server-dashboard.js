import {dashboardChangeLinks} from '../dispatch-change-view.js';
import {workspaceAction,workspaceProfile} from '../../core/supabase-session.js';
import {state,setWorkdate} from '../../core/data.js';
import {esc,nf,todayStr} from '../../core/utils.js';
import {pageHead,kpi} from '../components.js';

export default async function renderServerDashboard(view){
 const date=state.workdate||todayStr(),request=Symbol('dashboard');view.dashboardRequest=request;
 view.innerHTML=pageHead('운송 현황','권한에 따른 원본 생략 없이 서버에서 동일 기준으로 집계합니다.')+
  `<form id="server-dashboard-date" class="card" style="padding:16px;display:flex;gap:12px;align-items:center"><label>운송일 <input name="date" type="date" value="${esc(date)}" required></label><button class="btn btn-primary" type="submit">조회</button></form><div id="server-dashboard-result" role="status">집계 확인 중…</div>`;
 view.querySelector('form').onsubmit=async e=>{e.preventDefault();await setWorkdate(e.currentTarget.elements.date.value);renderServerDashboard(view);};
 const result=view.querySelector('#server-dashboard-result');
 try{
  const d=await workspaceAction('dashboard.summary',{date});
  if(view.dashboardRequest!==request||!result.isConnected)return;
  const s=d.summary;
  result.innerHTML=`<p class="muted">${esc(d.date)} · 서버 ${nf(d.revision)}차 기준 · 실제 운송과 중복·확인 필요 내역을 구분합니다.</p>
   ${d.changes?`<section class="card" style="padding:16px"><b>날짜 변경 · 수정 · 취소</b>${dashboardChangeLinks(date,d.changes,{links:!['executive','finance'].includes(workspaceProfile()?.role)})}<b>미배차 세부 구분</b>${dashboardChangeLinks(date,d.changes,{pending:true,links:!['executive','finance'].includes(workspaceProfile()?.role)})}</section>`:''}
   <div class="kpi-grid">${[
    ['유효 운송',s.units,'대'],['배정 완료',s.assignedUnits,'대'],['미배차',s.pendingUnits,'대'],['확인 필요',s.heldRecords,'행'],['중복',s.duplicateRecords,'행'],['운송 제외',s.excludedRecords,'행']
   ].map(([label,value,unit])=>kpi({label,value:nf(value),unit})).join('')}</div>
   <section class="card" style="padding:20px"><h3>브랜드별 운송 현황</h3><div class="table-wrap"><table><thead><tr><th>브랜드</th><th>운송 대수</th><th>배정 완료</th><th>미배차</th></tr></thead><tbody>${d.brands.map(b=>`<tr><td>${esc(b.brand)}</td><td>${nf(b.units)}</td><td>${nf(b.assignedUnits)}</td><td>${nf(b.pendingUnits)}</td></tr>`).join('')}</tbody></table></div></section>
   <section class="card" style="padding:20px"><h3>최근 14일 배차 추이</h3><div class="table-wrap"><table><thead><tr><th>운송일</th><th>운송 대수</th><th>배정 완료</th><th>미배차</th><th>확인 필요</th></tr></thead><tbody>${d.trend.map(r=>`<tr><td>${esc(r.date)}</td><td>${nf(r.units)}</td><td>${nf(r.assignedUnits)}</td><td>${nf(r.pendingUnits)}</td><td>${nf(r.heldRecords)}</td></tr>`).join('')}</tbody></table></div></section>`;
 }catch(e){
  if(view.dashboardRequest!==request||!result.isConnected)return;
  const timedOut=e.name==='AbortError'||/timeout|시간.*초과/i.test(e.message||'');
  result.innerHTML=`<section class="card" style="padding:20px;border:1px solid #e0b4b4" role="alert"><h3>대시보드 집계를 불러오지 못했습니다</h3><p>${timedOut?'서버 집계 응답이 지연되고 있습니다. 잠시 후 다시 조회해 주세요.':esc(e.message||'서버 조회에 실패했습니다.')}</p><p class="muted">조회일 ${esc(date)} · 조회 실패는 배차가 0건이라는 뜻이 아닙니다.</p><button class="btn btn-primary" id="server-dashboard-retry">다시 조회</button>${['admin','dispatch','settlement'].includes(workspaceProfile()?.role)?` <a class="btn" href="#/board?date=${esc(date)}">같은 날짜 배차판 확인</a>`:''}</section>`;
  result.querySelector('#server-dashboard-retry').onclick=()=>renderServerDashboard(view);
 }
}
