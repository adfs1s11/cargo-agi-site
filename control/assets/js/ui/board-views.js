import renderList from './pages/board.js';
import {state} from '../core/data.js';
import {esc,nf,norm,todayStr} from '../core/utils.js';
import {validDate} from '../core/schedule.js';
import {dashboardDay,displayedWorkspaceBasis} from '../core/supabase-cloud.js';
import {workspaceProfile,supabaseMode} from '../core/supabase-session.js';
import {canOpenPage} from '../core/workspace-access.js';
import {activeTransport,crewAudit} from '../core/crew-set.js';
import {mergePerformanceRows} from '../core/transport-performance.js';
import {refreshFleetClasses,fleetClass} from '../core/fleet.js';
import {availableVehicles,referenceFor} from './route-packing.js';

const modes={list:'배차 리스트',groups:'편성 묶음',available:'가용 기사·장비'};
const link=(key,date)=>'#/board?'+new URLSearchParams({date,...(key==='list'?{}:{view:key})});
const style=`<style>
.board-tabs{display:flex;flex-wrap:wrap;gap:5px;padding:5px;background:#eaf0f6;border-radius:12px;margin:0 0 16px}
.board-tabs a{flex:1;text-align:center;text-decoration:none;padding:12px 6px;color:#304359;font-weight:700;border-radius:8px}
.board-tabs a[aria-current]{background:#174c78;color:white}
.board-ops{display:grid;gap:14px}.board-ops h2,.board-ops h3{margin:0}.bo-tools,.bo-stats{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.bo-tools label{display:grid;gap:4px;font-weight:650}.bo-stats{align-items:stretch;margin:12px 0}
.bo-stats>div{background:#f0f5fa;color:#263f56;min-width:100px;padding:10px 16px;border-radius:8px}
.bo-stats strong{display:block;font-size:1.45rem}.bo-stats>div:first-child{background:#e4f3eb;color:#165235}
.bo-table{overflow:auto}.bo-table table{width:100%;border-collapse:collapse}.bo-table td,.bo-table th{text-align:left;padding:9px 12px;border-bottom:1px solid #dce4ec}.bo-table th{white-space:nowrap}
.bo-group{border:1px solid #cdd9e4;border-radius:9px;margin:8px 0}.bo-group summary{cursor:pointer;padding:12px;font-weight:650}.bo-group summary span{margin-right:10px}.bo-route{display:block;color:#46586a;margin:5px 0 0 14px;font-weight:500}.bo-group p{margin:0;padding:0 12px 10px}
@media(max-width:600px){.board-tabs a{font-size:14px}.bo-table td,.bo-table th{padding:8px}.bo-stats{gap:6px}.bo-stats>div{min-width:80px;padding:8px}.bo-tools{gap:7px}}
</style>`;
const stat=(label,value)=>`<div>${esc(label)}<strong>${nf(value)}</strong></div>`;
const options=items=>items.map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');
const canPlan=()=>!supabaseMode()||canOpenPage(workspaceProfile()?.role,'formation');
const distinct=values=>[...new Set(values.filter(Boolean))].join(' / ')||'확인 필요';

export function dayGroups(date,rows,drivers,assignments){
  const plans=assignments.filter(p=>p.date===date);
  const merged=mergePerformanceRows({dispatch:rows.filter(r=>r.date===date&&activeTransport(r)),drivers,assignments:plans});
  const audit=crewAudit(merged.rows,merged.resolve),groups=new Map();
  let review=merged.held.length;
  for(const item of audit.items){
    if(item.kind!=='ready'){if(['partial','conflict'].includes(item.kind))review++;continue;}
    const r=item.row;
    if(!groups.has(item.trip))groups.set(item.trip,{driver:merged.resolve(r).name,plate:r.vehicleNo,turn:Number(r.turn),orders:[]});
    groups.get(item.trip).orders.push(r);
  }
  const confirmed=new Map(plans.filter(p=>p.status==='confirmed'&&p.formation).map(p=>[p.id,p]));
  const trips=[...groups.values()].map(g=>{
    const p=confirmed.get(g.orders[0].performancePlanId);
    const complete=p&&p.orderIds?.length===g.orders.length&&g.orders.every(r=>r.performancePlanId===p.id);
    const valid=g.orders.every(r=>Number.isInteger(+r.count)&&+r.count>0);
    return {...g,stage:complete?'편성 확정':'원장 배정',count:valid?g.orders.reduce((n,r)=>n+Number(r.count),0):null};
  }).sort((a,b)=>a.turn-b.turn||a.driver.localeCompare(b.driver,'ko'));
  return {trips,review,drafts:plans.filter(p=>p.status==='draft')};
}
function showGroups(host,date,rows){
  const {trips,drafts,review}=dayGroups(date,rows,state.drivers,state.assignments);
  host.innerHTML=`<div class="bo-stats">${stat('배정된 묶음',trips.length)}${stat('편성 초안',drafts.length)}${stat('묶기 전 확인할 건',review)}</div>
    <div class="bo-tools"><label>기사·차량·도착지·VIN 검색<input type="search" class="input" data-find></label>
    <label>편성 상태<select class="select" data-stage>${options([['','전체'],['원장 배정','원장 배정'],['편성 확정','편성 확정'],['초안','초안']])}</select></label>
    ${canPlan()?`<a class="btn" href="#/formation?tab=review&date=${date}">초안 검토·확정</a>`:''}</div><p role="status"></p><div data-results></div>`;
  const byId=new Map(rows.map(r=>[r.id,r]));
  const all=[...trips,...drafts.map(p=>({driver:p.driverName||'기사 미지정',plate:p.vehicleNo||'장비 미지정',turn:p.turn,stage:'초안',count:p.totalCount??null,orders:(p.orderIds||[]).map(id=>byId.get(id)).filter(Boolean)}))];
  function draw(){
    const q=norm(host.querySelector('[data-find]').value),stage=host.querySelector('[data-stage]').value;
    const matches=all.filter(g=>(!stage||stage===g.stage)&&(!q||[g.driver,g.plate,...g.orders.flatMap(r=>[r.destination,r.origin,r.vin])].some(v=>norm(v).includes(q))));
    host.querySelector('[role=status]').textContent='조회 '+nf(matches.length)+'묶음 · 묶음을 누르면 상품차량과 하차지를 볼 수 있습니다.';
    host.querySelector('[data-results]').innerHTML=matches.map(g=>`<details class="bo-group"><summary><span class="badge ${g.stage==='초안'?'amber':g.stage==='편성 확정'?'green':'blue'}">${g.stage}</span><span>${esc(g.driver)} · ${esc(g.plate)}</span><span>${g.turn?esc(g.turn)+'회전':'회전 확인'} · ${g.count==null?'대수 확인':nf(g.count)+'대'}</span><small class="bo-route">${esc(distinct(g.orders.map(r=>r.origin)))} → ${esc(distinct(g.orders.map(r=>r.destination)))}</small></summary>${g.orders.map(r=>`<p>${esc(r.vin||'VIN 확인')} · ${esc(r.model||'차종 확인')} · ${esc(r.destination||'하차지 확인')}</p>`).join('')}</details>`).join('')||'<p>조건에 맞는 편성 묶음이 없습니다.</p>';
  }
  host.querySelector('[data-find]').oninput=draw;host.querySelector('[data-stage]').onchange=draw;draw();
}
function showCrews(host,date,vehicles,reference){
  const all=vehicles.map(v=>{
    const cls=fleetClass(v.driver,state.equipment,state.settings.fleet),fixed=v.ref||['A','CF'].includes(cls.code);
    return {...v,fixed:!!fixed,label:[cls.label,v.ref?'수도권 순번표':''].filter(Boolean).join(' · '),reason:v.block||(!v.capacity?'적재 한도 확인':'')};
  }).sort((a,b)=>Number(!!a.reason)-Number(!!b.reason)||Number(b.fixed)-Number(a.fixed)||a.driver.name.localeCompare(b.driver.name,'ko'));
  const ready=all.filter(v=>!v.reason);
  host.innerHTML=`<div class="bo-stats">${stat('가용 고정장비',ready.filter(v=>v.fixed).length)}${stat('전체 가용 세트',ready.length)}${stat('전체 가용 세트 1회씩 적재 시(대)',ready.reduce((n,v)=>n+v.capacity,0))}</div>
  <div class="bo-tools"><label>장비 구분<select class="select" data-scope>${options([['fixed','고정장비'],['all','전체 장비']])}</select></label>
  <label>가용 상태<select class="select" data-status>${options([['ready','가용'],['blocked','보류·운행 불가'],['all','전체 상태']])}</select></label>
  <label>기사·차량 검색<input type="search" class="input" data-find></label>
  <a class="btn btn-primary" href="#/formation?tab=packing&date=${date}">동선으로 편성</a></div><p>고정장비 기준은 용차A, 용차C 고정, 해당 월 수도권 순번표 등재 장비입니다. ${esc(reference.message)}</p>
  <p class="muted">수입차·KGM·포워딩 배정 기준입니다. 실제 출발 전 상용트럭 일정과 앞 회전의 복귀 시간을 확인하세요.</p>
  <p role="status"></p><div class="bo-table"><table><thead><tr>${['기사 / 차량','장비 구분','적재 한도','비어 있는 회전','가용 상태'].map(t=>'<th>'+t+'</th>').join('')}</tr></thead><tbody></tbody></table></div>`;
  function draw(){
    const q=norm(host.querySelector('[data-find]').value),scope=host.querySelector('[data-scope]').value,filter=host.querySelector('[data-status]').value;
    const matches=all.filter(v=>(scope==='all'||v.fixed)&&(filter==='all'||(filter==='ready')===!v.reason)&&(!q||[v.driver.name,v.equipment.plateNo].some(s=>norm(s).includes(q))));
    host.querySelector('[role=status]').textContent='조회 '+nf(matches.length)+'세트';
    host.querySelector('tbody').innerHTML=matches.map(v=>`<tr><td><strong>${esc(v.driver.name)}</strong><br>${esc(v.equipment.plateNo)}</td><td>${esc(v.label)}</td><td>${v.capacity?nf(v.capacity)+'대':'미등록'}</td><td>${v.reason?'—':v.openTurns.join(' · ')+'회전'}</td><td><span class="badge ${v.reason?'amber':'green'}">${v.reason?'보류':'가용'}</span> ${esc(v.reason)}</td></tr>`).join('')||'<tr><td colspan="5">조건에 맞는 기사·장비가 없습니다. 장비 구분이나 가용 상태를 변경해 확인하세요.</td></tr>';
  }
  host.querySelector('[data-find]').oninput=draw;host.querySelectorAll('select').forEach(s=>s.onchange=draw);draw();
}
function boardContext(params){
  const request=params.get('view');
  const mode=request==='groups'||(request==='available'&&canPlan())?request:'list';
  const date=validDate(params.get('date'))?params.get('date'):state.workdate||todayStr();
  return {mode,date};
}
export function mountBoardTabs(view,params){
  const {mode,date}=boardContext(params),nav=document.createElement('nav');
  nav.id='board-view-switch';nav.className='board-tabs no-print';nav.setAttribute('aria-label','배차판 보기');
  nav.innerHTML=style+Object.entries(modes).filter(([k])=>k!=='available'||canPlan()).map(([k,name])=>`<a data-mode="${k}" href="${esc(link(k,date))}" ${k===mode?'aria-current="page"':''}>${name}</a>`).join('');
  if(mode==='list'){
    const syncDate=()=>{const day=view.querySelector('#f-to')?.value||date;for(const a of nav.querySelectorAll('a'))a.href=link(a.dataset.mode,validDate(day)?day:date);};
    nav.addEventListener('click',syncDate,true);nav.addEventListener('focusin',syncDate);nav.addEventListener('pointerover',syncDate);
  }
  view.before(nav);
}
async function readBoardSource(label,fetchSource,panel){
  try{return await fetchSource();}
  catch(first){
    if(!panel.isConnected||!/statement timeout|timed?\s*out|시간\s*초과/i.test(String(first.message)))throw first;
    panel.textContent=label+' 조회가 지연되어 한 번 더 확인하고 있습니다…';
    try{return await fetchSource();}catch(second){throw Error(label+' · '+second.message);}
  }
}
export default async function renderBoardViews(view,ctx={}){
  const {mode,date}=boardContext(ctx.params||new URLSearchParams());
  if(mode==='list')return renderList(view,ctx);
  const body=document.createElement('section');body.className='board-ops card card-pad';view.replaceChildren(body);
  body.innerHTML=`<h2>${modes[mode]}</h2><div class="bo-tools"><label>운송일<input class="input" type="date" value="${date}"></label><button class="btn" data-refresh>최신 조회</button></div><div data-panel role="region" aria-label="${modes[mode]}"></div>`;
  const panel=body.querySelector('[data-panel]'),refresh=body.querySelector('[data-refresh]');
  body.querySelector('input').onchange=e=>{if(validDate(e.target.value))location.hash=link(mode,e.target.value);};
  async function load(){
    refresh.disabled=true;panel.innerHTML='<p role="status">선택일의 배차 원장을 확인하고 있습니다…</p>';
    try{
      const basis=displayedWorkspaceBasis(),live=supabaseMode();
      const rows=live?await readBoardSource('선택일 배차 원장',()=>dashboardDay(date,count=>{panel.textContent='배차 원장 '+nf(count)+'건 확인 중…';}),panel):state.dispatch.filter(r=>r.date===date);
      if(!view.isConnected)return;
      if(mode==='groups')showGroups(panel,date,rows);
      else{
        if(!live)throw Error('직원 계정으로 접속해 가용 원장을 조회하세요.');
        panel.textContent='당일 가용 장비와 고정 순번표를 대조하고 있습니다…';
        const [vehicles,reference]=await Promise.all([
          readBoardSource('통합 가용 차량',()=>availableVehicles(date,new Map(),new Set(),{rows,includeBlocked:true}),panel),
          readBoardSource('수도권 순번표',()=>referenceFor(date),panel),
          readBoardSource('고정장비 구분',refreshFleetClasses,panel)
        ]);
        if(!view.isConnected)return;
        showCrews(panel,date,vehicles.map(v=>{const ref=reference.members.get(v.driver.id);return {...v,ref,block:v.block||ref?.block};}),reference);
      }
      const latest=displayedWorkspaceBasis();
      if(live&&(!basis||basis.revision!==latest?.revision||basis.baseImportId!==latest?.baseImportId))throw Error('조회 중 원장이 변경되었습니다. 최신 조회로 다시 확인하세요.');
    }catch(e){panel.textContent='조회하지 못했습니다. '+e.message;}
    finally{refresh.disabled=false;}
  }
  refresh.onclick=load;await load();
}
