import {BASE_TEMPLATE,STATUSES} from '../../../../driver/policy.js';
const inspectionStatus={submitted:'접수 완료',reviewed:'검토 완료',returned:'보완 요청'};
import {openDriverAccounts} from './driver-account-management.js';
import {state} from '../../core/data.js';
import {renderEquipmentReportInbox} from './equipment-report-inbox.js';
import {workspaceRpc,workspaceProfile} from '../../core/supabase-session.js';
import {esc,openModal,toast} from '../../core/utils.js';
export default async function renderDriverAppAdmin(view){
 let records={access:[],notices:[],receipts:[],inspections:[]};
 const invoke=(action,payload={})=>workspaceRpc('tms_driver_admin',{p_action:action,p_payload:payload});
 async function load(){try{records=await invoke('list');draw();}catch(e){draw(e.message);}}
 function draw(error=''){
 view.innerHTML=`<h1>기사 앱 관리</h1><p>기사·장비 연결 · 공지 확인 현황 · 차량 위치 전달 · 점검 접수</p><div class="insight">${error?'기사 서비스 활성화 준비 중 · '+esc(error):'관리자가 기사별 아이디를 발급하고 이용 차량을 지정합니다.'}</div><p><a class="btn btn-primary" href="driver-app/" target="_blank" rel="noopener">기사 앱 열기</a></p><div class="row"><button class="btn" id="da-bind" ${error||workspaceProfile()?.role!=='admin'?'disabled':''}>기사 아이디·차량 관리</button><a class="btn" href="#/driver-notices">공지 관리 · 기사 확인 현황</a><button class="btn" id="da-position" ${error||workspaceProfile()?.role==='safety'?'disabled':''}>배차 차량 위치 전달</button></div><h2>자가 점검 접수 (최근 200건)</h2>${records.inspections.map(i=>`<article class="card card-pad"><b>${esc(state.drivers.find(d=>d.id===i.driver_id)?.name||i.driver_id)} · ${esc(i.inspection.date)}</b><p>${esc(state.equipment.find(e=>e.id===i.vehicle_id)?.plateNo||i.vehicle_id)} · ${esc(inspectionStatus[i.status]||i.status)}</p><details><summary>점검 내용</summary>${Object.entries(i.inspection.answers||{}).map(([k,a])=>`<p>${esc(BASE_TEMPLATE.items.find(item=>item.id===k)?.label||k)} · ${esc(STATUSES[a.status]||a.status)} · ${esc(a.note)}</p>`).join('')}</details>${i.status==='submitted'&&['admin','safety'].includes(workspaceProfile()?.role)?`<button class="btn" data-review="${i.id}">검토</button>`:''}</article>`).join('')||'<p>접수 내역이 없습니다.</p>'}`;
 const inbox=document.createElement('section');view.appendChild(inbox);renderEquipmentReportInbox(inbox);
 const modal=(title,body,action,collect)=>openModal({title,body,foot:'<button class="btn" data-close>닫기</button><button class="btn btn-primary" id="da-save">저장</button>',onMount(el,close){el.querySelector('#da-save').onclick=async e=>{e.target.disabled=true;try{await invoke(action,collect(el));close();await load();toast('저장했습니다.','success');}catch(err){toast(err.message,'error');e.target.disabled=false;}};}});
 view.querySelector('#da-bind').onclick=()=>openDriverAccounts(records,load);
 view.querySelector('#da-position').onclick=()=>modal('차량 위치 전달','<p>배차판의 기존 위치보다 이곳에서 확인한 위치를 우선 표시합니다.</p><label>운송일<input type="date" id="da-date"></label><label>VIN<input id="da-vin" maxlength="17"></label><label>현재 위치<input id="da-location" maxlength="200"></label>','position',el=>{const matches=state.dispatch.filter(r=>r.date===el.querySelector('#da-date').value&&r.vin===el.querySelector('#da-vin').value.trim().toUpperCase()&&!r.archivedAt);if(matches.length!==1)throw Error('해당 날짜·VIN의 배차가 한 건으로 확인되지 않습니다. 배차판에서 구간을 확인하세요.');return {orderId:matches[0].id,position:el.querySelector('#da-location').value};});
 view.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>modal('점검 검토','<label>결과<select id="da-status"><option value="reviewed">검토 완료</option><option value="returned">보완 요청</option></select></label><label>의견<textarea id="da-note"></textarea></label>','review',el=>({id:b.dataset.review,status:el.querySelector('#da-status').value,note:el.querySelector('#da-note').value})));
 }
 draw();await load();
}
