import {state} from '../core/data.js';
import {mergePerformanceRows} from '../core/transport-performance.js';
import {crewAudit,activeTransport,crewLabels} from '../core/crew-set.js';
import {esc,nf,norm} from '../core/utils.js';

import {supabaseMode} from '../core/supabase-session.js';
import {dashboardDay,displayedWorkspaceBasis} from '../core/supabase-cloud.js';

export async function renderCrewBoard(view,date){
  let rows=state.dispatch;
  if(supabaseMode()){
    view.innerHTML='<section class="card card-pad"><h2>기사·장비 세트 점검</h2><p role="status">선택일 원장을 확인하고 있습니다…</p></section>';
    const status=view.querySelector('[role=status]'),basis=displayedWorkspaceBasis();
    try{
      rows=await dashboardDay(date,count=>{status.textContent=date+' 배차 '+nf(count)+'건 확인 중…';});
      const after=displayedWorkspaceBasis();
      if(!basis||basis.baseImportId!==after?.baseImportId||basis.revision!==after?.revision)throw Error('조회 중 원장이 변경되었습니다.');
    }catch(error){
      status.textContent=error.message;const retry=document.createElement('button');retry.className='btn';retry.textContent='다시 조회';retry.onclick=()=>renderCrewBoard(view,date);status.after(retry);return;
    }
    if(!view.isConnected)return;
  }
  const day=rows.filter(r=>r.date===date&&activeTransport(r));
  const merged=mergePerformanceRows({dispatch:day,drivers:state.drivers,assignments:state.assignments.filter(p=>p.date===date)},{from:date,to:date});
  const audit=crewAudit(merged.rows,merged.resolve);
  const labels={...crewLabels,held:'운송 식별 보류'};
  const held=merged.held.map(entry=>({kind:'held',row:entry.row,detail:entry.reason||'원본 중복·확정 편성 확인'}));
  const items=[...audit.items,...held],counts={...audit.counts,held:held.length};
  const keys=['conflict','partial','held','carrier','pending','ready'];
  items.sort((a,b)=>keys.indexOf(a.kind)-keys.indexOf(b.kind)||String(a.row.driver||'').localeCompare(b.row.driver||'','ko'));
  view.innerHTML=`<section class="card card-pad"><h2>기사·장비 세트 점검</h2><p><b>${esc(date)} · 식별된 ${nf(audit.trips)}회전</b> · 같은 날 같은 기사와 장비가 함께 운행한 회전을 묶었습니다.</p>
  <div class="toolbar"><a class="btn btn-primary" href="#/formation?tab=packing&date=${date}">가용 세트로 편성</a>
  <a class="btn" href="#/formation?tab=review&date=${date}">초안 검토·확정</a> <a class="btn" href="#/board?date=${date}">당일 배차판</a> <a class="btn" href="#/load-efficiency">3개월 운송 분석</a></div></section>
  <section class="card card-pad"><div class="toolbar" role="group" aria-label="세트 상태별 조회">${['all',...keys].map(k=>`<button type="button" data-kind="${k}" class="btn" aria-pressed="false">${esc(labels[k]||'전체')} ${nf(k==='all'?items.length:counts[k])}건</button>`).join(' ')}</div>
  <label>기사·장비·차대번호 검색 <input type="search" class="input" data-search></label><p role="status"></p>
  <div class="table-scroll"><table class="data"><thead><tr>${['상태','기사','배송 장비','회전','차대번호','출발 → 도착','확인 사항'].map(s=>'<th>'+s+'</th>').join('')}</tr></thead><tbody></tbody></table></div>
  <div class="toolbar"><button class="btn" data-prev>이전</button><button class="btn" data-next>다음</button></div></section>`;
  let kind='all',page=0;
  const search=view.querySelector('[data-search]'),body=view.querySelector('tbody'),buttons=[...view.querySelectorAll('[data-kind]')];
  function draw(){
    const q=norm(search.value),matches=items.filter(i=>(kind==='all'||i.kind===kind)&&(!q||[i.row.driver,i.row.vehicleNo,i.row.vin].some(v=>norm(v).includes(q))));
    const start=page*50,visible=matches.slice(start,start+50);
    body.innerHTML=visible.map(({kind:k,row:r,detail})=>`<tr><td><strong class="badge ${k==='ready'?'green':k==='conflict'?'red':'gray'}">${labels[k]}</strong></td>${[r.driver,r.vehicleNo,r.turn,r.vin,[r.origin,r.destination].filter(Boolean).join(' → '),k==='ready'?'':detail].map(v=>'<td>'+esc(v||'—')+'</td>').join('')}</tr>`).join('')||'<tr><td colspan="7">조건에 맞는 운송이 없습니다.</td></tr>';
    view.querySelector('[role=status]').textContent=matches.length?nf(matches.length)+'건 중 '+nf(start+1)+'–'+nf(start+visible.length)+'건':'0건';
    view.querySelector('[data-prev]').disabled=page===0;view.querySelector('[data-next]').disabled=start+50>=matches.length;
    for(const b of buttons){const active=b.dataset.kind===kind;b.setAttribute('aria-pressed',String(active));b.classList.toggle('btn-primary',active);}
  }
  for(const b of buttons)b.onclick=()=>{kind=b.dataset.kind;page=0;draw();};
  search.oninput=()=>{page=0;draw();};
  view.querySelector('[data-prev]').onclick=()=>{page--;draw();};view.querySelector('[data-next]').onclick=()=>{page++;draw();};draw();
}
