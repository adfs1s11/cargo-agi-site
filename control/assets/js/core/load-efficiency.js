import {activeTransport,crewAudit,reliableTurn} from './crew-set.js';
import {transportKey} from './dispatch-identity.js';
import {summarizePerformance} from './transport-performance.js';
import {assignedDriver} from './dispatch-metrics.js';
import {normalizePlate,norm} from './utils.js';
import {equipmentStructure} from './equipment-policy.js';
import {cargoName,demandLots} from './two-car-demand.js';
import {monthRange} from './monthly-history-model.js';

export function reportingMonths(endMonth) {
  monthRange(endMonth);
  const [year, month] = endMonth.split('-').map(Number);
  return [-2,-1,0].map(offset => new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7));
}

const plateKey = value => norm(normalizePlate(value));
const validCapacity = value => Number.isInteger(value) && value>0 && value<=50;
function increment(map, name, values) {
  const record = map.get(name) || {};
  for(const [key,value] of Object.entries(values)) record[key]=(record[key]||0)+value;
  map.set(name,record);
}

// Retain only aggregate statistics after the month is read.
export function efficiencyMonth(data,month) {
  const range=monthRange(month);
  const ledgerIds=new Set(data.dispatch.map(transportKey).filter(Boolean));
  const perf=summarizePerformance({...data,dispatch:data.dispatch.filter(activeTransport),
    transportHistory:(data.transportHistory||[]).filter(r=>activeTransport(r)&&!ledgerIds.has(transportKey(r)))}, {...range,includeHistory:true});
  const crews=crewAudit(perf.rows,perf.resolve);
  const equipment=new Map(), plans=new Map((data.assignments||[]).map(p=>[p.id,p]));
  for(const eq of data.equipment||[]){
    const key=plateKey(eq.plateNo);
    equipment.set(key,equipment.has(key)?null:eq);
  }
  const buckets=new Map(), models=new Map();
  const incompleteDriverDays=new Set();
  const driverDay=r=>JSON.stringify([r.date,perf.resolve(r).key]);
  for(const item of perf.held)for(const r of item.alternatives||[item.row])if(r)incompleteDriverDays.add(driverDay(r));
  for(const r of perf.rows)if(!reliableTurn(r)||!Number.isInteger(Number(r.count))||Number(r.count)<1)incompleteDriverDays.add(driverDay(r));
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
    if(crews.conflicts.has(g.key)||ambiguous.has(slot)||uncertainDays.has(vehicleDay(g))||g.orders.some(r=>!r.driverId&&!assignedDriver(r)||!reliableTurn(r)||incompleteDriverDays.has(driverDay(r)))){
      questionable++;continue;
    }
    const master=equipment.get(plateKey(g.vehicleNo));
    const snapshot=validCapacity(g.capacity);
    const capacity=snapshot?g.capacity:Number(master?.capacity);
    if(!validCapacity(capacity)){unknown++;continue;}
    if(g.units>capacity){over++;continue;}
    const basis=snapshot?'confirmed':'roster';
    const structure=(snapshot?plans.get(g.planId)?.vehicleStructureSnapshot:equipmentStructure(master))||'형식 미등록';
    analyzed++;
    increment(buckets,JSON.stringify([basis,capacity,structure]),{trips:1,units:g.units,slots:capacity,full:Number(g.units===capacity)});
    const onboard=new Map();
    for(const r of g.orders){
      const label=cargoName(r);
      onboard.set(label,(onboard.get(label)||0)+Number(r.count));
    }
    for(const [name,units] of onboard){
      increment(models,JSON.stringify([basis,name]),{units,trips:1,twoTrips:Number(capacity===2),twoUnits:capacity===2?units:0,twoFull:Number(capacity===2&&g.units===2)});
    }
  }
  return {month,raw:data.dispatch.length+(data.transportHistory||[]).length,analyzed,questionable,unknown,over,
    ungrouped:perf.total.unclassifiedRecords,held:perf.held.length,
    crew:{counts:crews.counts,gaps:crews.gaps,trips:crews.trips},demand:demandLots(data,month),buckets:[...buckets],models:[...models]};
}

export function combineEfficiency(months,confirmedOnly=false) {
  const result={buckets:new Map(),models:new Map()};
  for(const month of months)for(const field of Object.keys(result))for(const [key,counts] of month[field]){
    const [basis,...dimensions]=JSON.parse(key);
    if(confirmedOnly && basis!=='confirmed')continue;
    increment(result[field],JSON.stringify(dimensions),counts);
  }
  return result;
}
