import {rpc} from './api.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={submitted:'접수 완료',reviewed:'검토 완료',returned:'보완 요청'};
export function renderInspectionHistory(view,{data,demo}){
 let before=null,beforeId=null,busy=false;
 view.innerHTML='<h2>내 점검 제출 이력</h2><button type="button" class="secondary" id="inspection-history-refresh">새로고침</button><div id="inspection-history-list"></div><button type="button" class="secondary" id="inspection-history-more" hidden>이전 점검 더 보기</button>';
 const list=view.querySelector('#inspection-history-list'),more=view.querySelector('#inspection-history-more');
 async function load(append=false){if(busy)return;busy=true;more.disabled=true;if(!append){before=null;beforeId=null;list.textContent='조회 중…';}try{
  const result=demo?{inspections:[]}:await rpc('tms_driver_inspection_list',{p_before:before,p_before_id:beforeId});if(!view.isConnected)return;
  const html=result.inspections.map(row=>`<article><span class="tag">${esc(labels[row.status]||row.status)}</span><h3>${esc(row.inspection.date)} · ${esc(data.vehicles.find(v=>v.id===row.vehicle_id)?.plateNo||'기존 연결 차량')}</h3><p>접수번호 ${esc(row.id)}</p>${row.review?`<p class="report-text">담당자 의견: ${esc(row.review.note)}</p>`:''}</article>`).join('');
  if(append)list.insertAdjacentHTML('beforeend',html);else list.innerHTML=html||'<p>제출한 점검이 없습니다.</p>';
  before=result.inspections.at(-1)?.submitted_at||null;beforeId=result.inspections.at(-1)?.id||null;more.hidden=result.inspections.length<30;
 }catch(error){if(!append)list.textContent='점검 이력 조회 실패 · '+error.message;else{const p=document.createElement('p');p.textContent=error.message;list.appendChild(p);}}finally{busy=false;more.disabled=false;}}
 view.querySelector('#inspection-history-refresh').onclick=()=>load();more.onclick=()=>load(true);load();return ()=>load();
}
