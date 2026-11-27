import {esc} from '../core/utils.js';
import {combineEfficiency} from '../core/load-efficiency.js';
import {reviewDemand} from '../core/two-car-demand.js';

const n=value=>Number(value||0).toLocaleString('ko-KR');
const rate=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';
const table=(labels,rows)=>'<div class="table-scroll"><table class="data"><thead><tr>'+labels.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
  (rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="'+labels.length+'">해당 자료가 없습니다.</td></tr>')+'</tbody></table></div>';
const card=(heading,body)=>'<section class="card card-pad"><h3>'+heading+'</h3>'+body+'</section>';

export function renderEfficiencyReport(months,confirmedOnly=false,filter='',reviews=months.map(m=>reviewDemand(m.demand.lots))){
  const stats={},routes=new Map(),models=new Map(),days=new Map();
  for(const r of reviews){
    for(const [k,v] of Object.entries(r.totals))stats[k]=(stats[k]||0)+v;
    for(const [k,v] of r.routes)routes.set(k,(routes.get(k)||0)+v);
    for(const [k,v] of r.days)days.set(k,v);
    for(const [name,counts] of r.models){
      const model=models.get(name)||{};
      for(const [k,v] of Object.entries(counts))model[k]=(model[k]||0)+v;
      models.set(name,model);
    }
  }
  const {buckets,models:actual}=combineEfficiency(months,confirmedOnly);
  const actualModels=new Map([...actual].map(([key,v])=>[JSON.parse(key)[0],v]));
  const equipment=[...buckets].map(([key,v])=>[...JSON.parse(key),v]).sort((a,b)=>a[0]-b[0]||b[2].trips-a[2].trips);
  const names=[...new Set([...models.keys(),...actualModels.keys()])].filter(name=>name.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a,b)=>(models.get(b)?.same||0)+(models.get(b)?.near||0)-(models.get(a)?.same||0)-(models.get(a)?.near||0)||a.localeCompare(b,'ko'));
  const monthly=reviews.map(({totals:t},i)=>[months[i].month,n(t.units),n(t.same),n(t.near),n(t.solo),n(t.large),n(t.review+t.pending),n(t.open)]);
  return '<section class="card card-pad"><h2>2대 장비를 어디에 투입할 수 있나</h2><div class="toolbar">'+
    ['동일 도착지 정확히 2대 · '+n(stats.same)+'조','인접 도착지 1+1 · '+n(stats.near)+'조','초대형 SUV 단독 조건 지정 · '+n(stats.solo)+'대','대형 카캐리어 우선 검토 · '+n(stats.large)+'대'].map(x=>'<strong class="badge blue">'+esc(x)+'</strong>').join(' ')+
    '</div><p>운송일과 상차지가 같은 전체 물량을 도착지별로 합산합니다. 같은 곳에 일반 물량이 3대 이상이면 대형 장비 합적 대상으로 모두 남기고, 그 안에서 2대씩 떼어 세지 않습니다.</p></section>'+
    card('월별 편성 기회',table(['월','분석 물량(대)','동일 2대(조)','인접 1+1(조)','단독 조건(대)','대형 우선(대)','차종·혼적 확인(대)','미결합 1대(대)'],monthly)+
    '<p>인접은 배차 편성과 같은 기준으로 명시된 시·구가 일치하거나 담당자가 지정한 지점에서 각각 1대씩 짝지은 예시입니다. 한 대는 한 조에만 포함합니다. 주소가 상세한 브랜드는 인접 조합이 더 많이 식별됩니다. 지점명만 있는 거래처는 인접 지점 묶음을 추가해 비교하세요. 실제 이동거리·납기·상차 가능 시간·고객별 제한은 배차 전에 확인하세요.</p>')+
    card('초대형 SUV 단독 운송','<p>선택 장비에 1대는 실을 수 있고 2대 혼적이 불가능하다고 확인한 차종만 단독 조건에 넣습니다. 기본값은 미지정입니다. 에스컬레이드·내비게이터·유콘·익스페디션 계열은 우선 확인 예시이며, 이들 차종과 모델명 누락 물량 '+n(stats.review)+'대, 함께 보류한 일반 물량 '+n(stats.pending)+'대입니다.</p>'+table(['단독 적재 여부 확인 대상','배차판 물량(대)'],[...models].filter(([,v])=>v.review).sort((a,b)=>b[1].review-a[1].review).map(([name,v])=>[name,n(v.review)])))+
    card('반복되는 2대 편성 구간',table(['편성 유형','상차지','하차지','발생 일수'],[...routes].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>[...JSON.parse(k),n(v)]))+
    '<p>상위 30구간입니다. 수요가 있었던 날은 '+n(days.size)+'일이며 하루 최대 '+n(Math.max(0,...days.values()))+'개 편성 후보가 있었습니다. 같은 장비의 하루 회전 가능 횟수와 복귀시간은 별도로 계산해야 합니다.</p>')+
    card('상품차종별 2대 장비 검토',table(['대표 차종 / 출고명','동일 2대 물량','인접 1+1 물량','단독 조건','대형 우선','차종·혼적 확인','미결합','실제 2대 장비 운송'],names.map(name=>{
      const v=models.get(name)||{};return [name,n(v.same),n(v.near),n(v.solo),n(v.large),n((v.review||0)+(v.pending||0)),n(v.open),n(actualModels.get(name)?.twoUnits)];
    })))+
    card('적재 대수·장비 형식별 운영 효율',table(['정원','장비 형식','실제 배차 회전','운송 대수','평균 대수/회','적재율','만차율'],equipment.map(([cap,type,v])=>[cap+'대',type,n(v.trips),n(v.units),(v.units/v.trips).toFixed(2),rate(v.units,v.slots),rate(v.full,v.trips)]))+
    '<p>당시 확정 편성 정원을 우선하고, 명부 비교를 켜면 차량번호가 일치한 명부 정원도 포함합니다. 배차판에서 확인한 회전 기준입니다.</p>')+
    '<details class="card card-pad"><summary>분석 범위와 보류 자료</summary><p>월별 배차판 최종 기록을 사용하므로 주문이 동시에 준비됐는지는 알 수 없습니다. 같은 날짜·VIN·구간의 원장 기록을 우선하고 취소·지원·연기·미출고를 제외합니다. 식별 충돌이나 수량 오류가 있는 구간은 수요 집계에서 보류합니다. 도착지 별칭·주소 표기 차이로 동일 지점 또는 인접 지점을 추가 확인해야 할 수 있습니다.</p>'+
    table(['월','식별·수량 등 보류 건','영향 구간 보류','정원 미확인 회전','회전 자료 불확실','정원 초과 확인'],months.map(m=>[m.month,n(m.demand.held),n(m.demand.blocked),n(m.unknown),n(m.questionable),n(m.over)]))+'</details>';
}
