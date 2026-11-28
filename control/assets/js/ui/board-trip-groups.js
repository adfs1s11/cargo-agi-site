import {esc,nf,norm,normalizePlate} from '../core/utils.js';
import {REGIONS,destinationRegion} from '../core/destination-regions.js';
import {EQUIPMENT_STRUCTURES,equipmentStructure} from '../core/equipment-policy.js';
import {FLEET_LABELS,fleetClass} from '../core/fleet.js';
import {performanceResolver} from '../core/transport-performance.js';

const compare=new Intl.Collator('ko',{numeric:true}).compare;
const unknown='미분류',unknownRegion='기타/미확인';
const ranks=new Map(REGIONS.map((key,i)=>[key,i]));
const rank=key=>ranks.get(key)??REGIONS.length;
const turnNumber=t=>Number.isInteger(+t)&&+t>0?+t:Infinity;
const routeCompare=(a,b)=>rank(a.region)-rank(b.region)||compare(a.destination||'',b.destination||'');
const unique=values=>[...new Set(values.filter(Boolean))].join(' / ')||'확인 필요';

function draftGroups(plan,byId,resolve){
  const groups=new Map();
  for(const id of plan.orderIds||[]){
    const turn=turnNumber(plan.orderTurns?.[id]??plan.turn);
    if(!groups.has(turn))groups.set(turn,[]);
    groups.get(turn).push(byId.get(id));
  }
  if(!groups.size)groups.set(turnNumber(plan.turn),[]);
  const owner=resolve({driverId:plan.driverId,driver:plan.driverName});
  return [...groups].map(([turn,raw])=>{
    const known=raw.length>0&&raw.every(r=>Number.isInteger(Number(r?.count))&&Number(r.count)>0);
    return {owner:owner.key||('draft:'+plan.id),driver:owner.name||plan.driverName||'기사 미지정',plate:plan.vehicleNo,turn,
      stage:'초안',count:known?raw.reduce((sum,r)=>sum+Number(r.count),0):groups.size===1?plan.totalCount??null:null,orders:raw.filter(Boolean)};
  });
}
function tripCards(groups){
  return groups.map(g=>{
    const color=g.stage==='초안'?'amber':g.stage==='편성 확정'?'green':'blue';
    return `<details class="bo-group"><summary><span>${Number.isFinite(g.turn)?nf(g.turn)+'회전':'회전 확인'} · ${g.count==null?'대수 확인':nf(g.count)+'대'}</span><span class="badge ${color}">${g.stage}</span><span>${esc(g.plate||'장비 미지정')}</span><span class="bo-tags">${esc(g.fleetLabel)} · ${esc(g.structure)}</span><small class="bo-route">${esc(unique(g.orders.map(r=>r.region)))} ｜ ${esc(unique(g.orders.map(r=>r.origin)))} → ${esc(unique(g.orders.map(r=>r.destination)))}</small></summary>
      ${g.orders.map(r=>`<p>${esc(r.region)} · <b>${esc(r.destination||'하차지 확인')}</b> · ${esc(r.model||'차종 확인')} · ${esc(r.vin||'VIN 확인')}</p>`).join('')}</details>`;
  }).join('');
}
export function mountTripGroups(host,{date,rows,drivers,equipment,fleet,trips,drafts,review,canPlan,issues=[]}){
  const byId=new Map(rows.map(r=>[r.id,r])),resolve=performanceResolver(drivers);
  const vehicles=new Map();
  for(const e of equipment){
    const key=normalizePlate(e.plateNo);
    if(key)vehicles.set(key,vehicles.has(key)?null:e);
  }
  const all=[...trips,...drafts.flatMap(p=>draftGroups(p,byId,resolve))].map(g=>{
    const plate=normalizePlate(g.plate),cls=fleetClass({vehicleNo:plate},[],fleet);
    const structure=equipmentStructure(vehicles.get(plate))||unknown;
    const orders=g.orders.map(r=>({...r,region:issues.includes('도착 권역')?unknownRegion:destinationRegion(r)}))
      .sort((a,b)=>routeCompare(a,b)||compare(a.vin||'',b.vin||''));
    const grade=Object.hasOwn(FLEET_LABELS,cls.code)&&!issues.includes('용차 구분')?cls.code:unknown;
    return {...g,turn:turnNumber(g.turn),orders,grade,fleetLabel:FLEET_LABELS[grade]||'용차 미분류',structure,
      firstStop:orders[0]||{region:unknownRegion},search:[g.driver,g.plate,...orders.flatMap(r=>[r.region,r.destination,r.origin,r.vin])].map(norm).join('|')};
  });
  const choice=(key,label)=>({key,label});
  const grades=[choice('','전체'),...Object.entries(FLEET_LABELS).map(([k,label])=>choice(k,label)),choice(unknown,unknown)];
  const structures=['',...EQUIPMENT_STRUCTURES,unknown].map(k=>choice(k,k||'전체'));
  const active={grade:'',structure:''}, dimensions={grade:grades,structure:structures};
  const facet=(dimension,title)=>`<div class="bo-facet" role="group" aria-label="${title}"><b>${title}</b><div>${dimensions[dimension].map(({key,label})=>`<button type="button" class="btn" data-dim="${dimension}" data-key="${esc(key)}" aria-pressed="false">${esc(label)} <small></small></button>`).join('')}</div></div>`;
  const stat=(label,n)=>`<div>${label}<strong>${nf(n)}</strong></div>`;
  host.innerHTML=`<div class="bo-stats">${stat('배정된 묶음',trips.length)}${stat('편성 초안',drafts.length)}${stat('묶기 전 확인할 건',review)}</div>
    ${issues.length?`<p role="alert">${esc(issues.join(' · '))} 조회 지연 · 미확인으로 표시합니다. 최신 조회로 다시 확인하세요.</p>`:''}
    ${facet('grade','용차 구분')}${facet('structure','운송장비 종류')}
    <div class="bo-tools"><label>기사·차량·권역·도착지·VIN 검색<input type="search" class="input" data-find></label>
      <label>편성 상태<select class="select" data-stage><option value="">전체</option><option>원장 배정</option><option>편성 확정</option><option>초안</option></select></label>
      ${canPlan?`<a class="btn" href="#/formation?tab=review&date=${date}">초안 검토·확정</a>`:''}</div><p role="status"></p><div data-results></div>`;
  const find=host.querySelector('[data-find]'),stage=host.querySelector('[data-stage]');
  function draw(){
    const query=norm(find.value),byDriver=new Map(),counts={grade:new Map(),structure:new Map()};
    for(const g of all){
      if((stage.value&&stage.value!==g.stage)||(query&&!g.search.includes(query)))continue;
      for(const [dimension,other] of [['grade','structure'],['structure','grade']]){
        if(active[other]&&active[other]!==g[other])continue;
        for(const k of ['',g[dimension]])counts[dimension].set(k,(counts[dimension].get(k)||0)+1);
      }
      if((active.grade&&g.grade!==active.grade)||(active.structure&&g.structure!==active.structure))continue;
      if(!byDriver.has(g.owner))byDriver.set(g.owner,[]);
      byDriver.get(g.owner).push(g);
    }
    for(const b of host.querySelectorAll('[data-dim]')){
      const {dim,key}=b.dataset;b.setAttribute('aria-pressed',String(key===active[dim]));
      b.querySelector('small').textContent=nf(counts[dim].get(key)||0);
    }
    const blocks=[...byDriver.entries()].map(([key,groups])=>{
      groups.sort((a,b)=>compareTurns(a,b)||routeCompare(a.firstStop,b.firstStop)||compare(a.plate||'',b.plate||'')||compare(a.stage,b.stage));
      const turns=new Set(groups.map(g=>g.turn).filter(Number.isFinite));
      return {key,groups,turns:turns.size,first:groups[0]};
    });
    blocks.sort((a,b)=>Number(b.turns>1)-Number(a.turns>1)||routeCompare(a.first.firstStop,b.first.firstStop)||compare(a.first.driver,b.first.driver)||compare(a.key,b.key));
    const total=blocks.reduce((n,b)=>n+b.groups.length,0);
    host.querySelector('[role=status]').textContent=nf(blocks.length)+'개 기사 그룹 · '+nf(total)+'묶음 · 여러 회전 기사 우선, 첫 회전 도착 권역순';
    host.querySelector('[data-results]').innerHTML=blocks.map(b=>`<section class="bo-driver"><h3>${esc(b.first.driver)} <small>${b.turns?nf(b.turns)+'개 회전 · ':''}${nf(b.groups.length)}묶음</small></h3>${tripCards(b.groups)}</section>`).join('')||'<p>선택한 조건에 맞는 편성 묶음이 없습니다.</p>';
  }
  for(const b of host.querySelectorAll('[data-dim]'))b.onclick=()=>{active[b.dataset.dim]=b.dataset.key;draw();};
  find.oninput=draw;stage.onchange=draw;draw();
}
function compareTurns(a,b){return a.turn===b.turn?0:a.turn<b.turn?-1:1;}
