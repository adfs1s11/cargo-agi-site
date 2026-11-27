import {esc} from '../core/utils.js';
import {combineEfficiency} from '../core/load-efficiency.js';

const n=v=>Number(v||0).toLocaleString('ko-KR');
const ratio=(v,total)=>total?(100*v/total).toFixed(1)+'%':'—';
const table=(labels,rows)=>'<div class="table-scroll"><table class="data"><thead><tr>'+labels.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
  (rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="'+labels.length+'">해당 자료가 없습니다.</td></tr>')+'</tbody></table></div>';
const entries=map=>Array.from(map,([key,x])=>[JSON.parse(key),x]);
export function renderEfficiencyReport(months,confirmedOnly=false,filter=''){
  const {buckets,models,routes}=combineEfficiency(months,confirmedOnly);
  const equipment=entries(buckets).sort((a,b)=>a[0][0]-b[0][0]||b[1].trips-a[1].trips);
  const cargo=entries(models).sort((a,b)=>b[1].units-a[1].units);
  const lanes=entries(routes).sort((a,b)=>b[1].pairs-a[1].pairs||b[1].trips-a[1].trips);
  function totals(list){
    let two=0,full=0,candidate=0,candidateUnits=0,trips=0;
    for(const [[cap],v] of list){trips+=v.trips;if(cap===2){two+=v.trips;full+=v.full;}candidate+=v.candidate;candidateUnits+=v.candidateUnits;}
    return {two,full,candidate,candidateUnits,trips};
  }
  const total=totals(equipment);
  const patternModels=new Map(), patternRoutes=new Map();
  for(const m of months){
    for(const [name,v] of m.patternModels){
      const sum=patternModels.get(name)||{assignedUnits:0,pairedUnits:0};sum.assignedUnits+=v.assignedUnits||0;sum.pairedUnits+=v.pairedUnits||0;patternModels.set(name,sum);
    }
    for(const [key,v] of m.patternRoutes){
      const sum=patternRoutes.get(key)||{single:0,pair:0};sum.single+=v.single;sum.pair+=v.pair;patternRoutes.set(key,sum);
    }
  }
  const cargoIndex=new Map(cargo.map(([[name],v])=>[name,v]));
  const allModels=[...new Set([...cargoIndex.keys(),...patternModels.keys()])].sort((a,b)=>(patternModels.get(b)?.pairedUnits||0)-(patternModels.get(a)?.pairedUnits||0)||(cargoIndex.get(b)?.units||0)-(cargoIndex.get(a)?.units||0));
  return '<section class="card card-pad"><h2>2대 적재 장비 증차 검토</h2><div class="toolbar">'+
    ['2대 장비 배차 '+n(total.two)+'회','2대 만차율 '+ratio(total.full,total.two),'3대 이상 장비의 전환 검토 '+n(total.candidate)+'회 · '+n(total.candidateUnits)+'대'].map(v=>'<strong class="badge blue">'+esc(v)+'</strong>').join(' ')+
    '</div><p>전환 후보는 한 곳에서 상차하고 한 곳에서 하차한 1~2대 회전입니다. 실제 투입 전 차체 치수·중량, 고객 지정 장비, 시간대와 복귀 동선을 확인하세요.</p></section>'+
    '<section class="card card-pad"><h3>월별 비교</h3>'+table(['월','원본 행','분석 회전','2대 장비 회전','2대 만차율','전환 후보 회전','후보 물량'],months.map(m=>{
      const v=totals(entries(combineEfficiency([m],confirmedOnly).buckets));
      return [m.month,n(m.raw),n(v.trips),n(v.two),ratio(v.full,v.two),n(v.candidate),n(v.candidateUnits)];
    }))+'</section>'+
    '<section class="card card-pad"><h3>적재 대수·장비 형식별 운영 효율</h3>'+table(['정원','장비 형식','배차 회전','운송 대수','평균 대수/회','적재율','만차율','전환 후보 회전'],equipment.map(([[cap,type],v])=>[cap+'대',type,n(v.trips),n(v.units),(v.units/v.trips).toFixed(2),ratio(v.units,v.slots),ratio(v.full,v.trips),n(v.candidate)]))+
    '<p>회전은 운송일·기사·차량번호·회전 순번으로 묶습니다. 적재율은 실제 배차 대수 ÷ 해당 회전의 정원 합계입니다.</p></section>'+
    '<section class="card card-pad"><h3>같은 구간의 소량 배차 수요</h3><p>장비번호가 없어도 기사·운송일·회전이 확인되면 포함합니다. 차량 형식과 무관한 과거 배차 패턴입니다. 위 전환 후보와 겹칠 수 있습니다.</p>'+
    table(['월','식별된 기사 회전','동일 구간 1대 회전','동일 구간 2대 회전','2대 회전 비율'],months.map(m=>[m.month,n(m.patternCount),n(m.single),n(m.pair),ratio(m.pair,m.patternCount)]))+
    '<details><summary>동일 구간 2대 배차가 많은 상위 30구간</summary>'+table(['상차지','하차지','1대 회전','2대 회전'],entries(patternRoutes).sort((a,b)=>b[1].pair-a[1].pair||b[1].single-a[1].single).slice(0,30).map(([route,v])=>[...route,n(v.single),n(v.pair)]))+'</details></section>'+
    '<section class="card card-pad"><h3>상품차종별 2대 장비 실적</h3><p>동일 구간 2대 배차 물량순입니다. 혼적 회전은 각 차종에 한 번씩 포함하며 물량은 차종별로 나눕니다.</p>'+
    table(['대표 차종 / 출고명','기사 배정 물량','동일 구간 2대 배차 물량','배정 물량 중 비율','정원 확인 운송 대수','2대 장비 운송 대수','2대 장비 포함 회전','해당 회전 만차율','전환 후보 물량'],allModels.filter(name=>name.toLowerCase().includes(filter.trim().toLowerCase())).map(name=>{
      const v=cargoIndex.get(name)||{},p=patternModels.get(name)||{};return [name,n(p.assignedUnits),n(p.pairedUnits),ratio(p.pairedUnits||0,p.assignedUnits),n(v.units),n(v.twoUnits),n(v.twoTrips),ratio(v.twoFull,v.twoTrips),n(v.candidateUnits)];
    }))+'</section>'+
    '<section class="card card-pad"><h3>2대 장비 전환 검토 구간</h3>'+table(['상차지','하차지','후보 회전','후보 물량','정확히 2대를 실은 회전'],lanes.slice(0,30).map(([[origin,destination],v])=>[origin,destination,n(v.trips),n(v.units),n(v.pairs)]))+'<p>2대 적재 회전이 많은 순으로 상위 30구간을 표시합니다.</p></section>'+
    '<details class="card card-pad"><summary>자료 범위와 제외 내역</summary><p>확정 편성 당시 정원을 우선합니다. 명부 비교를 켜면 당시 배차판 차량번호가 현재 명부 한 대와 일치하는 회전도 포함합니다. 명부 비교값은 과거 제원 변경의 영향을 받을 수 있습니다. 배차 기준 실적이며 배송 완료·비용·이익은 별도입니다.</p>'+
    table(['월','정원 미확인 회전','자료 불확실 회전','정원 초과 확인 회전','배정 후 회전 미식별 행','운송 식별·중복 충돌 확인'],months.map(m=>[m.month,n(m.unknown),n(m.questionable),n(m.over),n(m.ungrouped),n(m.held)]))+'</details>';
}
