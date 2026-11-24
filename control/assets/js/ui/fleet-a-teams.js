import {state} from '../core/data.js';
import {esc,addDays,normalizePlate} from '../core/utils.js';
import {evaluate} from '../core/evaluation.js';
import {summarizePerformance} from '../core/transport-performance.js';
import {destinationRegion} from '../core/destination-regions.js';
import {loadRegionMappings} from '../core/destination-regions-store.js';
import {workspaceRpc} from '../core/supabase-session.js';
import {ensureWorkspaceStores} from '../core/supabase-cloud.js';
import {availabilityOn} from '../core/schedule.js';

const teams=['A','B'];
const key=m=>JSON.stringify([m.driver,m.plate]);
const compare=(a,b)=>a.plate.localeCompare(b.plate,'ko')||a.driver.localeCompare(b.driver);
const monthPlan=month=>workspaceRpc('tms_fleet_a_teams',{p_month:month});
const signature=members=>JSON.stringify([...members].sort(compare).map(m=>[m.driver,m.plate,m.team]));

export function linkedRoster(data){
  const roster=new Map(),active=data.drivers.filter(d=>d.status==='active'),rows=[],held=[];
  for(const entry of data.settings.fleet?.roster||[]){
    const plate=normalizePlate(entry.plate);
    if(!plate)continue;
    if(!roster.has(plate))roster.set(plate,new Set());
    roster.get(plate).add(entry.grade);
  }
  for(const [plate,classes] of roster){
    if(!classes.has('A'))continue;
    const equipment=data.equipment.filter(e=>normalizePlate(e.plateNo)===plate);
    const owners=active.filter(d=>normalizePlate(d.vehicleNo)===plate||equipment.some(e=>e.driverId===d.id));
    const driver=owners[0],eq=equipment[0];
    if(classes.size!==1||equipment.length!==1||owners.length!==1||
       (driver.vehicleNo&&normalizePlate(driver.vehicleNo)!==plate)||(eq.driverId&&eq.driverId!==driver.id)||
       data.equipment.some(e=>e.driverId===driver.id&&e!==eq)){
      held.push(plate);continue;
    }
    rows.push({driver:driver.id,plate,name:driver.name,master:driver,equipment:eq});
  }
  return {rows,held};
}

// Keep manual choices. Within each evaluation grade, fill the smaller side first.
export function proposeTeams(rows,current,inScope=()=>true){
  const plan=new Map(current),size={A:0,B:0},counts=new Map();
  const ordered=[...rows].sort((a,b)=>a.grade.localeCompare(b.grade)||compare(a,b));
  const tally=row=>{
    if(!counts.has(row.grade))counts.set(row.grade,{A:0,B:0});
    const team=plan.get(key(row));
    if(team){counts.get(row.grade)[team]++;size[team]++;}
  };
  ordered.forEach(tally);
  for(const row of ordered){
    if(plan.has(key(row))||!inScope(row))continue;
    const n=counts.get(row.grade);
    const team=(n.A-n.B||size.A-size.B)<=0?'A':'B';
    plan.set(key(row),team);tally(row);
  }
  return plan;
}

export async function openFleetTeams(panel,date,vehicles,references,selectVehicles){
  panel.textContent='월별 조 편성과 배차 실적을 불러오고 있습니다…';
  const month=date.slice(0,7),start=month+'-01',prevEnd=addDays(start,-1);
  let [saved,,regions]=await Promise.all([monthPlan(month),
    ensureWorkspaceStores(['dispatch','drivers','equipment','assignments','settings']),
    loadRegionMappings().then(()=>true,()=>false)]);
  if(!panel.isConnected)return;
  const roster=linkedRoster(state),rows=roster.rows;
  // Use the same operational evidence for both roles. Private incident records are outside the dispatcher's scope.
  const data={...state,dispatch:state.dispatch.filter(r=>!r.archivedAt&&!r.duplicateOf&&r.date>=prevEnd.slice(0,7)+'-01'&&r.date<=date),transportHistory:[],incidents:[]};
  const grades=evaluate({from:prevEnd.slice(0,7)+'-01',to:prevEnd,data}).results;
  const byGrade=new Map(grades.filter(r=>r.driverId&&r.count>0).map(r=>[r.driverId,r.grade]));
  const performance=summarizePerformance(data,{from:start,to:date});
  const byVehicle=new Map(vehicles.map((v,i)=>[key({driver:v.driver.id,plate:normalizePlate(v.equipment.plateNo)}),{...v,index:i}]));
  for(const r of rows){
    r.grade=byGrade.get(r.driver)||'미평가';
    const p=performance.byDriver.get(r.driver);
    r.units=p?.units||0;r.days=p?.days||0;r.trips=p?.tripCount||0;r.multi=p?.multiStopTrips||0;
    r.regional=0;r.unknown=0;r.missing=p?.unclassifiedRecords||0;
    for(const trip of p?.groups||[]){
      const areas=trip.orders.map(destinationRegion);
      if(areas.some(a=>a&&a!=='수도권'&&a!=='기타/미확인'))r.regional++;
      else if(areas.some(a=>!a||a==='기타/미확인'))r.unknown++;
    }
    const v=byVehicle.get(key(r));
    const schedule=availabilityOn(r.master,date,state.equipment);
    r.block=v?(v.block||(!v.capacity?'적재 한도 확인':'')):(schedule.available?'잔여 회전 확인':schedule.reason);
    r.index=v?.index;
  }
  const keys=new Set(rows.map(key));
  const loadPlan=()=>new Map(saved.members.filter(m=>keys.has(key(m))).map(m=>[key(m),m.team]));
  let draft=loadPlan(),obsolete=saved.members.filter(m=>!keys.has(key(m))),busy=false;
  const members=()=>[...obsolete,...rows.filter(r=>draft.has(key(r))).map(r=>({driver:r.driver,plate:r.plate,team:draft.get(key(r))}))].sort(compare);
  const dirty=()=>signature(members())!==signature(saved.members);
  const guard=e=>{
    if(!panel.isConnected||!dirty())return;
    if(e.type==='beforeunload'){e.preventDefault();e.returnValue='';return;}
    if(e.type==='click'&&!e.target.closest('a[href^="#/"]'))return;
    if(!confirm('저장하지 않은 월별 조 편성이 있습니다. 이동할까요?')){e.preventDefault();e.stopImmediatePropagation();}
  };
  window.addEventListener('beforeunload',guard);window.addEventListener('formation-date-change',guard);document.addEventListener('click',guard,true);
  const observer=new MutationObserver(()=>{if(!panel.isConnected){
    document.removeEventListener('click',guard,true);window.removeEventListener('formation-date-change',guard);window.removeEventListener('beforeunload',guard);observer.disconnect();
  }});observer.observe(document.body,{childList:true,subtree:true});
  panel.innerHTML=`<h3>${esc(month)} 용차A 조별 운영</h3>
    <p>전월 운송등급에 맞춰 월별 A·B조를 편성하세요. 배차 지표와 취소율로 계산하며 사고·비용 감점은 제외합니다. 실적은 ${esc(start)}부터 ${esc(date)}까지 기사 기준입니다.</p>
    <div data-summary style="display:flex;gap:12px;flex-wrap:wrap"></div>
    <label><input type="checkbox" data-trip-order> 조 장비 선택 시 월 누계 회전이 적은 순서로 편성 미리보기</label>
    <p data-issues></p><div class="fm-actions"><label>균형 제안 대상 <select data-scope><option value="all">용차A 전체</option><option value="metro" ${rows.some(r=>references.has(r.driver))?'':'disabled'}>이번 달 수도권 고정 순번표 등재 기사</option></select></label>
    <button class="btn" data-balance>미편성 기사 등급별 균형 제안</button> <button class="btn btn-primary" data-store>월별 조 저장</button> <button class="btn" data-reload>저장본 다시 조회</button></div>
    <p role="status" aria-live="polite" data-team-status></p>
    <label>조원 검색 <input type="search" data-team-search placeholder="기사명 또는 차량번호"></label>
    <label>조 보기 <select data-filter><option value="all">전체</option><option value="A">A조</option><option value="B">B조</option><option value="">미편성</option></select></label>
    <div style="overflow:auto;max-height:400px"><table class="data"><thead><tr><th>기사 · 장비</th><th>배차조</th><th>전월 운송등급</th><th>가용 상태</th><th>운행일</th><th>회전</th><th>운송 대수</th><th>복수 하차 회전</th><th>지방 회전</th></tr></thead><tbody data-team-body></tbody></table></div>
    <p class="muted">회전이 적은 기사부터 표시합니다. 같은 날 같은 기사·장비·회전의 여러 하차는 한 회전입니다. 지방 회전은 수도권 밖 도착지가 한 곳 이상인 회전입니다.</p>`;
  const get=s=>panel.querySelector(s),message=t=>{get('[data-team-status]').textContent=t;};
  const inScope=r=>get('[data-scope]').value==='all'||references.has(r.driver);
  function draw(){
    const filtered=rows.filter(r=>(get('[data-filter]').value==='all'||(draft.get(key(r))||'')===get('[data-filter]').value)&&
      (r.name+r.plate).toLowerCase().replace(/\s/g,'').includes(get('[data-team-search]').value.toLowerCase().replace(/\s/g,'')))
      .sort((a,b)=>a.trips-b.trips||a.units-b.units||compare(a,b));
    get('[data-team-body]').innerHTML=filtered.map(r=>`<tr><td>${esc(r.name)} · ${esc(r.plate)}</td><td><select data-set="${rows.indexOf(r)}" aria-label="${esc(r.name)} 배차조">${['',...teams].map(t=>`<option value="${t}" ${(draft.get(key(r))||'')===t?'selected':''}>${t?t+'조':'미편성'}</option>`).join('')}</select></td><td>${esc(r.grade)}</td><td>${esc(r.block||'가용')}</td><td>${r.days}</td><td>${r.trips}</td><td>${r.units}</td><td>${r.multi}</td><td>${regions?r.regional:'확인 필요'}</td></tr>`).join('')||'<tr><td colspan="9">해당하는 기사가 없습니다.</td></tr>';
    get('[data-summary]').innerHTML=teams.map(t=>{
      const group=rows.filter(r=>draft.get(key(r))===t),sum=field=>group.reduce((n,r)=>n+r[field],0),available=group.filter(r=>!r.block).length;
      const counts=new Map();for(const r of group)counts.set(r.grade,(counts.get(r.grade)||0)+1);
      return `<section style="flex:1;min-width:210px;padding:12px;border-left:4px solid ${t==='A'?'#2563a3':'#137460'};background:#f4f7fa;color:#172737"><b>${t}조 · ${group.length}명 · 가용 ${available}대</b><p>운송 ${sum('units')}대 · ${sum('trips')}회전<br>복수 하차 ${sum('multi')}회 · 지방 ${regions?sum('regional')+'회':'확인 필요'}</p><p>${[...counts].sort().map(([g,n])=>esc(g)+' '+n+'명').join(' · ')||'조원 미편성'}</p><button class="btn" data-pick="${t}" ${!available||dirty()?'disabled':''}>${t}조 가용 장비 선택</button></section>`;
    }).join('');
    get('[data-store]').disabled=!dirty();
    get('[data-balance]').disabled=!rows.some(r=>inScope(r)&&!draft.has(key(r)));
    const issues=['미편성 '+(rows.length-draft.size)+'명',dirty()?'변경 후 저장 필요':saved.revision?'저장본 '+saved.revision+'차':'이번 달 저장본 없음'];
    if(roster.held.length)issues.push('기사·장비 연결 확인 '+roster.held.length+'대 ('+roster.held.join(', ')+')');
    if(obsolete.length)issues.push('승무·명부 변경으로 기존 조원 '+obsolete.length+'명 장비 선택 제외');
    if(!regions)issues.push('권역 전환표 조회 필요');
    const missing=rows.reduce((n,r)=>n+r.missing,0),unknown=rows.reduce((n,r)=>n+r.unknown,0);
    if(missing)issues.push('회전 미확인 '+missing+'건');
    if(regions&&unknown)issues.push('권역 미확인 '+unknown+'회전');
    get('[data-issues]').textContent=issues.join(' · ');
  }
  panel.onchange=e=>{if(busy)return;if(e.target.matches('[data-set]')){
    const r=rows[Number(e.target.dataset.set)],t=e.target.value;
    if(t)draft.set(key(r),t);else draft.delete(key(r));message('조원을 조정했습니다.');
  }draw();};
  get('[data-team-search]').oninput=draw;
  panel.onclick=async e=>{
    const button=e.target.closest('button');if(!button||busy)return;
    busy=true;panel.inert=true;
    try{
      if(button.hasAttribute('data-balance')){
        draft=proposeTeams(rows,draft,inScope);message('균형 제안입니다. 조원을 검토한 뒤 월별 조 저장을 누르세요.');
      }else if(button.hasAttribute('data-store')){
        const list=members();
        if(new Set(list.map(m=>m.driver)).size!==list.length||new Set(list.map(m=>m.plate)).size!==list.length)
          throw Error('승무 변경 전 기록과 겹칩니다. 아래의 이전 연결 정리 후 다시 저장하세요.');
        const result=await workspaceRpc('tms_save_fleet_a_teams',{p_month:month,p_revision:saved.revision,p_members:list});
        if(result.month!==month||signature(result.members)!==signature(list))throw Error('저장 결과가 일치하지 않습니다. 다시 조회하세요.');
        saved=result;message('월별 조 편성을 저장했습니다.');
      }else if(button.hasAttribute('data-reload')){
        if(dirty()&&!confirm('화면에서 변경한 조 편성을 취소하고 저장본을 다시 조회할까요?'))return;
        saved=await monthPlan(month);draft=loadPlan();obsolete=saved.members.filter(m=>!keys.has(key(m)));message('저장본을 불러왔습니다.');
      }else if(button.hasAttribute('data-retired')){
        if(confirm('현재 기사·장비 명부와 일치하지 않는 이전 연결을 이번 달 편성안에서 정리할까요?')){obsolete=[];message('이전 연결을 편성안에서 정리했습니다. 월별 조를 저장하세요.');}
      }else if(button.dataset.pick){
        const live=await monthPlan(month);
        if(live.revision!==saved.revision||dirty())throw Error('저장본이 변경되었습니다. 다시 조회한 뒤 선택하세요.');
        const candidates=rows.filter(r=>draft.get(key(r))===button.dataset.pick&&!r.block&&r.index!=null);
        const prioritize=get('[data-trip-order]').checked;
        if(prioritize&&candidates.some(r=>r.missing))throw Error('회전을 확인할 수 없는 운송 기록이 있습니다. 회전순 제안을 해제하거나 기록을 확인하세요.');
        if(prioritize)candidates.sort((a,b)=>a.trips-b.trips||a.units-b.units||compare(a,b));
        const indices=candidates.map(r=>r.index);
        if(indices.length){selectVehicles(new Set(indices),prioritize);message(button.dataset.pick+'조 가용 장비 '+indices.length+'대를 선택했습니다. 아래에서 편성을 미리보세요.');}
      }
    }catch(err){message(err.message);}finally{busy=false;panel.inert=false;draw();get('[data-retired]').hidden=!obsolete.length;}
  };
  const retire=document.createElement('button');retire.className='btn';retire.dataset.retired='';retire.textContent='승무 변경 이전 연결 정리';get('[data-reload]').after(retire);retire.hidden=!obsolete.length;
  draw();
}

