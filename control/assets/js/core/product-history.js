import {norm} from './utils.js';
import {canonicalProductBrand,productHistoryBrand} from './brand-policy.js';
import {summarizePerformance} from './transport-performance.js';

export const productIdentity=(brand,model)=>JSON.stringify([norm(canonicalProductBrand(brand)),norm(model)]);
export function segmentCandidate(months){
 const candidates=[];
 for(const m of months){if(m.trips<10)continue;let grade='',load=0;
  for(const [units,g] of [[1,'E'],[2,'D'],[3,'C'],[4,'B']])if((m.loads[units]||0)>=10){grade=g;load=units;break;}
  if(!grade&&m.totalUnits===m.trips*5){grade='A';load=5;}
  if(grade)candidates.push({grade,load,month:m.month,structure:m.structure,trips:m.trips,frequency:m.loads[load]||0,average:Math.round(m.totalUnits/m.trips*100)/100});
 }
 candidates.sort((a,b)=>a.load-b.load||b.month.localeCompare(a.month));
 return {status:candidates.length?'review':'insufficient',basisCapacity:5,minimumMonthlyTrips:10,candidate:candidates[0]||null,byMonth:candidates,engineStatus:'reviewOnly'};
}
export function analyzeProductHistory(data,{from='',to='9999-12-31'}={}){
 const performance=summarizePerformance(data,{from,to,includeHistory:true}),map=new Map();
 const entry=r=>{const model=String(r.model||'').trim();if(!model||/^(미입력|미정|없음|-|N\/A|UNKNOWN)$/i.test(model))return null;const brand=productHistoryBrand(r),key=productIdentity(brand,model);if(!map.has(key))map.set(key,{key,brand,model,records:0,units:0,firstDate:r.date,lastDate:r.date,months:new Map(),knownTrips:0,eligibleTrips:0,mixedTrips:0,unverifiedCapacityTrips:0});return map.get(key);};
 for(const r of performance.rows){if(['cancelled','notshipped','support'].includes(r.status)||!Number.isInteger(Number(r.count))||Number(r.count)<1)continue;const p=entry(r);if(!p)continue;p.records++;p.units+=Number(r.count);if(r.date<p.firstDate)p.firstDate=r.date;if(r.date>p.lastDate)p.lastDate=r.date;}
 const plans=new Map((data.assignments||[]).map(p=>[p.id,p]));
 for(const g of performance.groups){const keys=new Set(g.orders.map(r=>productIdentity(productHistoryBrand(r),r.model))),products=[...keys].map(k=>map.get(k)).filter(Boolean);for(const p of products)p.knownTrips++;
  // Mixed loads and historical capacity/structure gaps cannot prove a model's loading segment.
  if(keys.size!==1||g.origins.size!==1||new Set(g.orders.map(r=>String(r.vin||'').replace(/\s/g,'').toUpperCase())).size!==g.orders.length){for(const p of products)p.mixedTrips++;continue;}
  const p=products[0],plan=plans.get(g.planId),structure=plan?.vehicleStructureSnapshot;
  if(!p)continue;if(g.capacity!==5||!['풀트레일러','세미트레일러','대형트럭','중형트럭','세이프티로더'].includes(structure)){p.unverifiedCapacityTrips++;continue;}
  if(!Number.isInteger(g.units)||g.units<1||g.units>5)continue;p.eligibleTrips++;const month=g.date.slice(0,7),key=month+'|'+structure,m=p.months.get(key)||{month,structure,trips:0,totalUnits:0,loads:{}};m.trips++;m.totalUnits+=g.units;m.loads[g.units]=(m.loads[g.units]||0)+1;p.months.set(key,m);
 }
 const models=[...map.values()].map(p=>{const months=[...p.months.values()].sort((a,b)=>b.month.localeCompare(a.month));return {...p,months,segment:segmentCandidate(months)};}).sort((a,b)=>a.brand.localeCompare(b.brand,'ko')||a.model.localeCompare(b.model,'ko'));
 return {models,quality:performance.quality,held:performance.held.length,policyVersion:'loading-segment-review-1',from,to};
}
export function productHistoryUpdates(analysis,existing,makeId,now){
 const index=new Map();for(const p of existing){const key=productIdentity(p.brand,p.model),items=index.get(key)||[];items.push(p);index.set(key,items);}const rows=[],held=[],byId=new Map(existing.map(p=>[p.id,p]));let inserted=0,updated=0;
 for(const p of analysis.models){const matches=index.get(p.key)||[];if(matches.length>1){held.push(p.key);continue;}const before=matches[0],newId=before?.id||makeId(p.key);if(!before&&byId.has(newId)){held.push(p.key);continue;}const historyEvidence={policyVersion:analysis.policyVersion,reviewedAt:now,records:p.records,units:p.units,firstDate:p.firstDate,lastDate:p.lastDate,knownTrips:p.knownTrips,eligibleTrips:p.eligibleTrips,mixedTrips:p.mixedTrips,unverifiedCapacityTrips:p.unverifiedCapacityTrips,months:p.months,segment:p.segment};rows.push({...before,id:newId,brand:before?.brand||p.brand,model:before?.model||p.model,createdAt:before?.createdAt||now,historyEvidence});before?updated++:inserted++;}
 return {rows,held,inserted,updated};
}
