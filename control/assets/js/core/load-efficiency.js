import {summarizePerformance} from './transport-performance.js';
import {assignedDriver,dispatchStatus} from './dispatch-metrics.js';
import {normalizePlate,norm} from './utils.js';
import {equipmentStructure} from './equipment-policy.js';
import {productFamily} from './product-family.js';
import {monthRange} from './monthly-history-model.js';

export function reportingMonths(endMonth) {
  monthRange(endMonth);
  const [year, month] = endMonth.split('-').map(Number);
  return [-2,-1,0].map(offset => new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7));
}

const usable = row => !row.archivedAt && !row.duplicateOf &&
  !['cancelled','support','notshipped'].includes(dispatchStatus(row)) &&
  !/^\[배차 연기\]/.test(String(row.note || '').trim());
const plateKey = value => norm(normalizePlate(value));
const validCapacity = value => Number.isInteger(value) && value>0 && value<=50;
const reliableTurn=r=>Number.isInteger(Number(r.turn)) && Number(r.turn)>0 &&
  r.turnBasis!=='invalid' && r.turnBasis!=='missing' &&
  (Number(r.turn)!==1 || r.turnBasis==='explicit' || r.sourceRecordType==='googleSheet' || r.performancePlanId);
const modelName=row=>{
  const family=productFamily(row);
  return family.held?(family.sourceModel||'차종 미확인'):[family.brand,family.model].join(' ');
};
const knownPlace=v=>Boolean(v)&&!['-','미상','미정','미확인','미입력','없음'].includes(norm(v));
const placeLabel=value=>String(value).split(/담당자|연락처|(?:휴대폰|전화)번호|0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/)[0].replace(/[\s/(·-]+$/,'').trim()||'도착지 표기 확인';
const routeLabel=row=>JSON.stringify([placeLabel(row.origin),placeLabel(row.destination)]);
function increment(map, name, values) {
  const record = map.get(name) || {};
  for(const [key,value] of Object.entries(values)) record[key]=(record[key]||0)+value;
  map.set(name,record);
}

// Retain only aggregate statistics after the month is read.
export function efficiencyMonth(data,month) {
  const range=monthRange(month);
  const perf=summarizePerformance({...data,dispatch:data.dispatch.filter(usable),
    transportHistory:(data.transportHistory||[]).filter(usable)}, {...range,includeHistory:true});
  const equipment=new Map(), plans=new Map((data.assignments||[]).map(p=>[p.id,p]));
  for(const eq of data.equipment||[]){
    const key=plateKey(eq.plateNo);
    equipment.set(key,equipment.has(key)?null:eq);
  }
  const buckets=new Map(), models=new Map(), routes=new Map();
  // This measures a driver's recorded workload even when equipment capacity is unknown.
  const patterns=new Map(), incompleteDriverDays=new Set(), patternModels=new Map(),patternRoutes=new Map();
  const driverDay=r=>JSON.stringify([r.date,perf.resolve(r).key]);
  for(const item of perf.held)for(const r of item.alternatives||[item.row])if(r)incompleteDriverDays.add(driverDay(r));
  for(const r of perf.rows){
    const owner=perf.resolve(r);
    if(!owner.key || (!assignedDriver(r)&&!r.driverId))continue;
    if(Number.isInteger(Number(r.count)) && Number(r.count)>0)increment(patternModels,modelName(r),{assignedUnits:Number(r.count)});
    const day=driverDay(r);
    if(!reliableTurn(r)||!Number.isInteger(Number(r.count))||Number(r.count)<1){incompleteDriverDays.add(day);continue;}
    const key=JSON.stringify([day,Number(r.turn)]);
    if(!patterns.has(key))patterns.set(key,{day,rows:[],units:0,plates:new Set()});
    const g=patterns.get(key);g.rows.push(r);g.units+=Number(r.count);
    if(r.vehicleNo)g.plates.add(plateKey(r.vehicleNo));
  }
  let patternCount=0, single=0,pair=0;
  for(const g of patterns.values()){
    if(incompleteDriverDays.has(g.day)||g.plates.size>1)continue;
    patternCount++;
    const r=g.rows[0];
    if(g.units>2||!knownPlace(r.origin)||!knownPlace(r.destination)||
       !g.rows.every(x=>norm(x.origin)===norm(r.origin)&&norm(x.destination)===norm(r.destination)))continue;
    if(g.units===2)pair++;else single++;
    for(const x of g.rows)increment(patternModels,modelName(x),{units:Number(x.count),pairedUnits:g.units===2?Number(x.count):0});
    increment(patternRoutes,routeLabel(r),{single:Number(g.units===1),pair:Number(g.units===2)});
  }
  const ambiguous=new Set(), owners=new Map(), uncertainDays=new Set();
  const vehicleDay=r=>JSON.stringify([r.date,plateKey(r.vehicleNo)]);
  for(const item of perf.held)for(const row of item.alternatives||[item.row])if(row?.vehicleNo)uncertainDays.add(vehicleDay(row));
  for(const r of perf.rows)if(r.vehicleNo && (!Number.isInteger(Number(r.turn))||Number(r.turn)<1||!assignedDriver(r)&&!r.driverId||!Number.isInteger(Number(r.count))||Number(r.count)<1))uncertainDays.add(vehicleDay(r));
  for(const g of perf.groups){
    const slot=JSON.stringify([vehicleDay(g),g.turn]);
    if(owners.has(slot))ambiguous.add(slot);
    owners.set(slot,g.key);
  }
  let analyzed=0, questionable=0, unknown=0, over=0;
  for(const g of perf.groups){
    const slot=JSON.stringify([vehicleDay(g),g.turn]);
    if(ambiguous.has(slot)||uncertainDays.has(vehicleDay(g))||g.orders.some(r=>!r.driverId&&!assignedDriver(r)||!reliableTurn(r)||incompleteDriverDays.has(driverDay(r)))){
      questionable++;continue;
    }
    const master=equipment.get(plateKey(g.vehicleNo));
    const snapshot=validCapacity(g.capacity);
    const capacity=snapshot?g.capacity:Number(master?.capacity);
    if(!validCapacity(capacity)){unknown++;continue;}
    if(g.units>capacity){over++;continue;}
    const basis=snapshot?'confirmed':'roster';
    const structure=(snapshot?plans.get(g.planId)?.vehicleStructureSnapshot:equipmentStructure(master))||'형식 미등록';
    const candidate=capacity>2 && g.units<=2 && g.origins.size===1 && g.destinations.size===1 && knownPlace(g.orders[0].origin) && knownPlace(g.orders[0].destination);
    analyzed++;
    increment(buckets,JSON.stringify([basis,capacity,structure]),{trips:1,units:g.units,slots:capacity,full:Number(g.units===capacity),candidate:Number(candidate),candidateUnits:candidate?g.units:0});
    const onboard=new Map();
    for(const r of g.orders){
      const label=modelName(r);
      onboard.set(label,(onboard.get(label)||0)+Number(r.count));
    }
    for(const [name,units] of onboard){
      increment(models,JSON.stringify([basis,name]),{units,trips:1,twoTrips:Number(capacity===2),twoUnits:capacity===2?units:0,twoFull:Number(capacity===2&&g.units===2),candidateUnits:candidate?units:0});
    }
    if(candidate)increment(routes,JSON.stringify([basis,...JSON.parse(routeLabel(g.orders[0]))]),{trips:1,units:g.units,pairs:Number(g.units===2)});
  }
  return {month,raw:data.dispatch.length+(data.transportHistory||[]).length,analyzed,questionable,unknown,over,
    ungrouped:perf.total.unclassifiedRecords,held:perf.held.length,
    patternCount,single,pair,patternModels:[...patternModels],patternRoutes:[...patternRoutes],
    buckets:[...buckets],models:[...models],routes:[...routes]};
}

export function combineEfficiency(months,confirmedOnly=false) {
  const result={buckets:new Map(),models:new Map(),routes:new Map()};
  for(const month of months)for(const field of Object.keys(result))for(const [key,counts] of month[field]){
    const [basis,...dimensions]=JSON.parse(key);
    if(confirmedOnly && basis!=='confirmed')continue;
    increment(result[field],JSON.stringify(dimensions),counts);
  }
  return result;
}
