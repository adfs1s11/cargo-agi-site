import {createDispatchLedger} from './dispatch-metrics.js';
import {summarizePerformance,performanceResolver} from './transport-performance.js';
import {productHistoryBrand} from './brand-policy.js';
export const REVIEW_FIELDS={skill:'운송 숙련도',safety:'안전수칙 준수',cooperation:'업무 협조',customer:'고객 대응'};
export const REVIEW_LEVELS=['미평가','우수','양호','개선 필요'];
const iso=d=>d.toISOString().slice(0,10);
export function reviewPeriod(type,date){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||iso(new Date(date+'T00:00:00Z'))!==date)throw Error('기준일을 확인하세요.');
 const y=Number(date.slice(0,4)),m=Number(date.slice(5,7))-1;if(!['month','quarter','year'].includes(type))throw Error('평가 기간을 확인하세요.');
 const first=type==='year'?0:type==='quarter'?Math.floor(m/3)*3:m,span=type==='year'?12:type==='quarter'?3:1;
 return {type,from:iso(new Date(Date.UTC(y,first,1))),to:iso(new Date(Date.UTC(y,first+span,0))),label:type==='year'?`${y}년`:type==='quarter'?`${y}년 ${Math.floor(m/3)+1}분기`:`${y}년 ${m+1}월`};
}
export function shiftReviewPeriod(p,step){return reviewPeriod(p.type,iso(new Date(Date.UTC(Number(p.from.slice(0,4)),Number(p.from.slice(5,7))-1+{month:1,quarter:3,year:12}[p.type]*step,1))));}
export function reviewReport(data,period){
 const raw=data.dispatch.filter(r=>r.date>=period.from&&r.date<=period.to),ledger=createDispatchLedger(raw,{assignments:data.assignments,drivers:data.drivers}),resolve=performanceResolver(data.drivers);
 const performance=summarizePerformance({...data,dispatch:ledger.summary.counted},{from:period.from,to:period.to}),byDriver=new Map();
 for(const driver of data.drivers){const d=performance.byDriver.get(driver.id),rows=ledger.summary.assigned.filter(r=>resolve(r).key===driver.id),held=ledger.summary.held.flatMap(g=>g.items).filter(x=>resolve(x.row).key===driver.id).length;
  const metric={driverId:driver.id,name:driver.name,vehicleNo:driver.vehicleNo||'',units:d?.units||0,days:d?.days||0,trips:d?.tripCount||0,avgPerDay:d?.days?Math.round(d.units/d.days*100)/100:null,avgPerTrip:d?.avgPerTrip??null,utilization:d?.utilization??null,capacityTrips:d?.recordedCapacityTrips||0,unknownTurns:d?.unclassifiedRecords||0,held,incidents:0,customers:[...new Set(rows.map(r=>r.customer||'미확인'))].sort(),brands:[...new Set(rows.map(productHistoryBrand))].sort(),orderIds:rows.map(r=>r.id)};
  metric.incidents=(data.incidents||[]).filter(i=>i.date>=period.from&&i.date<=period.to&&resolve({driverId:i.driverId,driver:i.driverName}).key===driver.id).length;byDriver.set(driver.id,metric);
 }
 return {period,byDriver,summary:ledger.summary,performance};
}

