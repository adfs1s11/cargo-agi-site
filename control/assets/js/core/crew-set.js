import {assignedDriver,providerOnly,dispatchMemo,dispatchStatus} from './dispatch-metrics.js';
import {normalizePlate,norm} from './utils.js';

export const crewLabels={conflict:'세트 충돌',partial:'기사·장비·회전 보완',carrier:'업체 의뢰·실기사 확인',pending:'기사 미배정',ready:'세트 식별'};
export const reliableTurn=r=>Number.isInteger(Number(r.turn))&&Number(r.turn)>0&&
  !['invalid','missing'].includes(r.turnBasis)&&(Number(r.turn)!==1||r.turnBasis==='explicit'||
  ['googleSheet','historicalExcel'].includes(r.sourceRecordType)||/^dsp_(xl|gs)_[0-9a-f]{64}$/.test(r.id||'')||!!r.performancePlanId);
export const activeTransport=r=>!r.archivedAt&&!r.duplicateOf&&
  !['cancelled','canceled','notshipped','support','postponed','취소','미출고','지원'].includes(dispatchStatus(r))&&
  dispatchMemo(r.driver)!=='배차 연기'&&!/^\[배차 연기\]/.test(String(r.note||'').trim());

export function crewAudit(rows,resolve){
  const byDriver=new Map(),byEquipment=new Map(),conflicts=new Set(),trips=new Set(),items=[];
  const gaps={driver:0,equipment:0,turn:0};
  const counts=Object.fromEntries(Object.keys(crewLabels).map(k=>[k,0]));
  function add(map,key,value){
    const values=map.get(key)||new Set();values.add(value);map.set(key,values);
  }
  for(const row of rows){
    if(!activeTransport(row))continue;
    const owner=resolve(row),plate=normalizePlate(row.vehicleNo),turn=Number(row.turn);
    const driver=!!owner.key&&(assignedDriver(row)||row.driverId);
    const equipment=plate&&!/^(-+|\?+|미정|미상|미등록|미입력|없음|0+)$/i.test(plate);
    const missing=[];
    if(!driver)missing.push('기사');
    if(!equipment)missing.push('장비번호');
    if(!reliableTurn(row))missing.push('회전');
    let kind=missing.length?'partial':'ready';
    if(!driver&&providerOnly(row))kind='carrier';
    else if(!driver&&!equipment&&!owner.ambiguous&&!row.driverId&&!assignedDriver(row))kind='pending';
    if(kind==='partial'){if(!driver)gaps.driver++;if(!equipment)gaps.equipment++;if(!reliableTurn(row))gaps.turn++;}
    const item={row,kind,detail:missing.join(' · ')};
    if(driver&&equipment&&reliableTurn(row)){
      item.driverSlot=JSON.stringify([row.date,owner.key,turn]);
      item.equipmentSlot=JSON.stringify([row.date,plate,turn]);
      item.trip=JSON.stringify([row.date,owner.key,norm(plate),turn]);
      add(byDriver,item.driverSlot,plate);add(byEquipment,item.equipmentSlot,owner.key);
    }
    items.push(item);
  }
  for(const item of items){
    if(item.trip){
      const reasons=[];
      if(byDriver.get(item.driverSlot).size>1)reasons.push('한 기사에 장비 여러 대');
      if(byEquipment.get(item.equipmentSlot).size>1)reasons.push('한 장비에 기사 여러 명');
      if(reasons.length){item.kind='conflict';item.detail=reasons.join(' · ');conflicts.add(item.trip);}
      else trips.add(item.trip);
    }
    counts[item.kind]++;
  }
  return {items,counts,gaps,conflicts,trips:trips.size};
}

// Some older plans store their rotation only against the individual orders.
export function overlapsCrewSlot(a,b){
  if(a.date!==b.date)return false;
  const sameDriver=a.driverId&&a.driverId===b.driverId;
  const plate=normalizePlate(a.vehicleNo);
  if(!sameDriver&&(!plate||plate!==normalizePlate(b.vehicleNo)))return false;
  const turns=p=>[p.turn,...Object.values(p.orderTurns||{})].map(Number).filter(n=>Number.isInteger(n)&&n>0);
  const occupied=new Set(turns(a));
  return turns(b).some(t=>occupied.has(t));
}
