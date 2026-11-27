import {state} from '../core/data.js';
import {esc,nf,norm} from '../core/utils.js';
import {createDispatchLedger} from '../core/dispatch-metrics.js';
import {availabilityRows} from '../core/schedule.js';
import {formationInput,saveFormations} from '../core/formation.js';
import {workspaceRpc,supabaseMode} from '../core/supabase-session.js';
import {confirmSupabaseSaved} from '../core/supabase-cloud.js';
import {fleetRows} from '../core/shared-fleet.js';
import {referenceList,referenceSheet} from '../core/dispatch-reference-store.js';
import {metroRoster,metroOperation,rosterSheets,rosterMonth} from '../core/metro-fixed.js';
import {targetCapacity,nearbyGroups,packRoutes} from '../core/route-packing.js';
import {transportKey} from '../core/dispatch-identity.js';

let boardSelection;
export function selectBoardOrders(rows) {
  const dates=new Set(rows.map(r=>r.date));
  if(dates.size!==1)throw Error('같은 운송일의 배차를 선택하세요.');
  const date=rows[0].date,selection=crypto.randomUUID();
  boardSelection={selection,date,ids:new Set(rows.map(r=>r.id))};
  location.hash='#/formation?tab=packing&date='+encodeURIComponent(date)+'&selection='+selection;
}
async function referenceFor(date) {
  const books=await referenceList(),month=date.slice(0,7);
  const book=books.find(b=>b.kind==='metro'&&rosterSheets(b).some(s=>rosterMonth(s.name)===month));
  if(!book)return {members:new Map(),message:month+' 수도권 순번표 미등록'};
  const header=rosterSheets(book).find(s=>rosterMonth(s.name)===month);
  const sheet=await referenceSheet(book.id,header.name),roster=metroRoster(sheet,state.drivers);
  const members=new Map(roster.filter(p=>p.driver).map(p=>[p.driver.id,{label:'수도권 고정',capacity:p.capacity}]));
  for(const day of metroOperation(sheet,roster)){
    const member=members.get(day.person.driver?.id);
    if(member&&day.date===date&&day.status!=='참고 기록'){member.block=day.status;member.label=day.status;}
  }
  return {members,message:book.name+' · '+header.name};
}
function pendingPool(date,selection) {
  const rows=state.dispatch.filter(r=>r.date===date&&!r.archivedAt&&!r.duplicateOf);
  const plans=state.assignments.filter(p=>p.date===date);
  const reserved=new Set(plans.filter(p=>p.status==='draft').flatMap(p=>p.orderIds||[]));
  const ledger=createDispatchLedger(rows,{assignments:plans,drivers:state.drivers});
  return rows.filter(r=>{
    const entry=ledger.byId.get(r.id);
    return (!selection||selection.has(r.id))&&entry?.kind==='pending'&&!entry.duplicate&&
      (!norm(r.driver)||['미배차','미정','대기','미배정','미지정','-'].includes(norm(r.driver)))&&!reserved.has(r.id)&&!r.vehicleNo&&!r.driverId&&!!transportKey(r);
  });
}
async function availableVehicles(date,references,skipIds=new Set()) {
  const fleet=await workspaceRpc('tms_shared_fleet',{p_day:date});
  if(fleet.day!==date)throw Error('통합 가용 차량의 조회 일자를 확인하세요.');
  const shared=new Map(fleetRows(fleet).map(r=>[r.equipment.id,r]));
  const local=availabilityRows(state.drivers,date,state.equipment,state.dispatch,state.assignments);
  const drafts=state.assignments.filter(p=>p.date===date&&p.status==='draft'&&!skipIds.has(p.id));
  return local.filter(v=>v.equipment&&v.available).map(v=>{
    const {driver,equipment}=v,server=shared.get(equipment.id);
    const occupied=new Set(v.turns.map(t=>t.turn));
    const sameResource=drafts.filter(p=>p.driverId===driver.id||norm(p.vehicleNo)===norm(equipment.plateNo));
    for(const p of sameResource)for(const turn of [p.turn,...Object.values(p.orderTurns||{})])if(+turn>0)occupied.add(+turn);
    const openTurns=Array.from({length:v.maxTurns},(_,i)=>i+1).filter(t=>!occupied.has(t));
    const turn=openTurns[0];
    const ref=references.get(driver.id),issues=server?.issues.filter(s=>s!=='적재 한도 확인')||[];
    let block=ref?.block||issues.join(' · ');
    if(!server||server.driver?.id!==driver.id||server.key==='conflict'||!server.schedule.available||server.bookings.some(b=>b.department!=='import'||b.uncertain))block='통합 가용 차량 배정·연결 확인';
    if(sameResource.some(p=>!Number(p.turn)&&!Object.values(p.orderTurns||{}).length)||v.unknown||v.invalidCount||v.over||v.unreviewedMixedOrigin||!turn)block='기존 회전·잔여 일정 확인';
    return {driver,equipment,capacity:v.capacity,target:targetCapacity(equipment,v.capacity),turn,openTurns,block,ref};
  }).sort((a,b)=>Number(!!a.block)-Number(!!b.block)||a.driver.name.localeCompare(b.driver.name,'ko'));
}
export async function checkPackingAvailability(plans) {
  const packed=plans.filter(p=>p.packingTarget&&p.status!=='confirmed');if(!packed.length||!supabaseMode())return;
  const date=packed[0].date,refs=await referenceFor(date),fleet=await availableVehicles(date,refs.members,new Set(packed.map(p=>p.id)));
  for(const p of packed){
    const v=fleet.find(v=>v.driver.id===p.driverId&&norm(v.equipment.plateNo)===norm(p.vehicleNo));
    if(!v||v.block||!v.openTurns.includes(Number(p.turn))||!v.capacity||p.totalCount>v.capacity)throw Error(p.driverName+' · 통합 가용 차량, 순번표 또는 적재 한도를 다시 확인하세요.');
  }
}
export async function renderRoutePacking(view,date,params) {
  const key=params.get('selection'),selection=key&&boardSelection?.selection===key&&boardSelection.date===date?boardSelection.ids:null;
  view.innerHTML='<section class="formation-workspace card card-pad"><h2>동선별 배차 편성</h2><p data-message role="status">가용 차량과 순번표를 확인하고 있습니다…</p></section>';
  const root=view.firstElementChild,msg=root.querySelector('[data-message]');
  if(key&&!selection){msg.textContent='선택한 배차 정보가 만료됐습니다. 배차판에서 다시 선택하세요.';return;}
  if(!supabaseMode()){msg.textContent='통합 가용 차량을 조회하려면 직원 계정으로 접속하세요.';return;}
  try{
    const [fleet,reference]=await Promise.all([availableVehicles(date,new Map()),referenceFor(date).catch(e=>({members:new Map(),message:'참고자료 조회 실패 · '+e.message,failed:true}))]);
    if(!root.isConnected)return;
    if(reference.failed)throw Error(reference.message);
    const vehicles=fleet.map(v=>{const ref=reference.members.get(v.driver.id);return {...v,ref,block:v.block||ref?.block};});
    const pool=pendingPool(date,selection);
    root.innerHTML=`<h2>동선으로 편성</h2><p><b>선택 가능 ${nf(vehicles.filter(v=>!v.block).length)}세트</b> · 확인 필요 ${nf(vehicles.filter(v=>v.block).length)}세트</p><p><b>${esc(date)} · 편성 가능 ${nf(pool.length)}건 / ${nf(pool.reduce((n,r)=>n+Number(r.count),0))}대</b>${selection?' · 배차판 선택 '+selection.size+'건 기준':''}</p><p>동일 상·하차지를 먼저 묶고, 같은 상차지의 인접 하차지, 인접 상·하차지 순으로 조합합니다.</p>
    <p><a href="#/fleet?date=${date}" target="_blank" rel="noopener">통합 가용 차량</a> · <a href="#/dispatch-reference" target="_blank" rel="noopener">배차 참고자료</a> · ${esc(reference.message)}</p>
    <details class="card card-pad" data-team-panel><summary><strong>용차A 조별 운영</strong> · 월별 조 편성 및 가용 장비 선택</summary><div data-teams></div></details>
    <label>기사·차량 검색 <input class="input" type="search" data-search></label>
    <div style="overflow:auto;max-height:340px"><table class="data"><thead><tr><th>사용</th><th>배송 세트 · 기사 / 장비</th><th>장비</th><th>회전</th><th>등록 한도</th><th>이번 목표(대)</th><th>순번표 · 상태</th></tr></thead><tbody>${vehicles.map((v,i)=>`<tr data-vehicle="${i}"><td><input type="checkbox" aria-label="${esc(v.driver.name)} 장비 선택" ${v.block?'disabled':''}></td><td>${esc(v.driver.name)} · ${esc(v.equipment.plateNo)}</td><td>${esc([v.equipment.structure||v.equipment.type,v.equipment.model].filter(Boolean).join(' '))}</td><td>${v.turn||'–'}</td><td>${v.capacity||'미등록'}</td><td><input type="number" aria-label="${esc(v.driver.name)} 목표 대수" min="1" max="${v.capacity||50}" value="${v.target||''}" style="width:5em" ${v.block?'disabled':''}></td><td>${esc(v.block||[v.ref?.label,v.ref?.capacity?'순번표 '+v.ref.capacity+'대':'',v.capacity?'가용':'초안만 가능'].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>
    <details><summary>인접 지점 지정</summary><p>같은 시·구가 명시된 주소를 인접 후보로 봅니다. 출고장·전시장 별칭은 한 줄에 한 묶음으로 입력하세요. 예: 분당서현 | 분당서현보관소</p><textarea class="input" data-near aria-label="인접 지점 묶음" rows="3"></textarea></details>
    <p class="muted">장비당 비어 있는 회전 하나를 제안합니다. 복수 상차는 출고지별 출입·상차 시간을 검토하세요.</p><button class="btn btn-primary" data-propose>선택 장비로 편성 미리보기</button><div data-preview></div><p data-status role="status"></p>`;
    const vehicleRows=[...root.querySelectorAll('[data-vehicle]')],preview=root.querySelector('[data-preview]'),status=root.querySelector('[data-status]');
    root.querySelector('[data-search]').oninput=e=>{for(const tr of vehicleRows)tr.hidden=!norm(tr.cells[1].textContent).includes(norm(e.target.value));};
    root.addEventListener('input',e=>{if(!e.target.closest('[data-search],[data-teams]')){preview.replaceChildren();status.textContent='';}});
    const teamsPanel=root.querySelector('[data-team-panel]'),teamContent=teamsPanel.querySelector('[data-teams]');
    let teamLoaded=false,teamOrder=new Map();
    teamsPanel.ontoggle=async()=>{
      if(!teamsPanel.open||teamLoaded)return;
      teamLoaded=true;
      try{
        const {openFleetTeams}=await import('./fleet-a-teams.js');
        await openFleetTeams(teamContent,date,vehicles,reference.members,(indices,prioritize)=>{
          teamOrder=prioritize?new Map([...indices].map((index,rank)=>[index,rank])):new Map();
          root.querySelector('[data-search]').value='';
          for(const tr of vehicleRows){
            const box=tr.querySelector('[type=checkbox]');
            box.checked=!box.disabled&&indices.has(Number(tr.dataset.vehicle));tr.hidden=false;
          }
          preview.replaceChildren();status.textContent='선택 장비 '+indices.size+'대'+(prioritize?' · 월 누계 회전이 적은 순서':'')+' · 편성을 미리보세요.';
        });
      }catch(e){teamLoaded=false;teamContent.textContent='조 편성 조회 실패 · '+e.message+' · 닫았다가 다시 열어주세요.';}
    };
    root.querySelector('[data-propose]').onclick=()=>{
      try{
        const checked=vehicleRows.filter(tr=>tr.querySelector('[type=checkbox]').checked);
        if(teamOrder.size)checked.sort((a,b)=>(teamOrder.get(Number(a.dataset.vehicle))??Infinity)-(teamOrder.get(Number(b.dataset.vehicle))??Infinity));
        const selected=checked.map(tr=>({...vehicles[Number(tr.dataset.vehicle)],target:Number(tr.querySelector('[type=number]').value)}));
        if(!selected.length)throw Error('편성에 사용할 가용 장비를 선택하세요.');
        const result=packRoutes(pool,selected,state.products,nearbyGroups(root.querySelector('[data-near]').value));
        preview.innerHTML=`<h3>회전별 편성안</h3>${result.groups.map(g=>`<details class="card card-pad"><summary><b>${esc(g.driver.name)} · ${esc(g.equipment.plateNo)} · ${g.turn}회전 · ${g.count}/${g.target}대</b> · ${['','동일 상·하차','인접 하차 · 검토','인접 상·하차 · 검토'][g.priority]}</summary>${g.orders.map(o=>`<div>${esc(o.vin)} · ${esc(o.origin)} → ${esc(o.destination)} · ${o.count}대</div>`).join('')}</details>`).join('')}<p>남은 운송 ${result.remaining.length}건 · ${result.remaining.reduce((n,r)=>n+Number(r.count),0)}대</p>${result.groups.length?'<button data-save class="btn btn-primary">초안 저장 후 검토</button>':''}`;
        status.textContent='';
        const save=preview.querySelector('[data-save]');
        if(save)save.onclick=async()=>{
          save.disabled=true;
          try{
            const [live,latestRef]=await Promise.all([availableVehicles(date,new Map()),referenceFor(date)]);
            const allowed=new Set(pendingPool(date,selection).map(r=>r.id));
            for(const g of result.groups){
              const v=live.find(v=>v.driver.id===g.driver.id&&v.equipment.id===g.equipment.id);
              if(!v||v.block||latestRef.members.get(g.driver.id)?.block||v.turn!==g.turn||(v.capacity&&g.target>v.capacity)||g.orders.some(r=>!allowed.has(r.id)))throw Error('가용 상태 또는 운송이 변경되었습니다. 화면을 다시 열어 검토하세요.');
            }
            const plans=result.groups.map(g=>({...formationInput({date,driver:g.driver,vehicleNo:g.equipment.plateNo,orders:g.orders,turn:g.turn,note:'동선별 편성 · 목표 '+g.target+'대 · '+g.priority+'순위'}),packingTarget:g.target}));
            await saveFormations(plans);await confirmSupabaseSaved();
            if(root.isConnected)location.hash='#/formation?tab=review&date='+date;
          }catch(e){status.textContent=e.message;if(root.isConnected)save.disabled=false;}
        };
      }catch(e){preview.replaceChildren();status.textContent=e.message;}
    };
  }catch(e){msg.textContent='가용 차량을 조회하지 못했습니다. '+e.message;}
}
