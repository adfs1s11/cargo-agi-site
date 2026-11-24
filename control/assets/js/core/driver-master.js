import {normalizePlate} from './utils.js';

const nonDrivers=new Set(['h1','gcc','기타','개별','텍산','텍싼','협력','직영','용차','기타용차','지원','취소','미출고','회송','변경','사고','미배차','미배정','미지정','미정','미입력','미상','기사미정','기사없음','대기','없음','unknown','n/a']);

export function validDriverName(value){
  const name=String(value??'').normalize('NFKC').trim();
  return /\p{L}/u.test(name)&&!/[?\uFFFD]/u.test(name)&&!nonDrivers.has(name.replace(/\s/g,'').toLowerCase());
}

export const CLASS_LABELS={A:'용차A',B:'용차B',C:'용차C',CF:'용차C · 고정용차'};

export function classForPlate(plate,fleet={}){
  if(!plate)return {code:'',label:'차량번호 확인 필요',plate};
  const matches=(fleet.roster||[]).filter(r=>normalizePlate(r.plate)===plate);
  if(new Set(matches.map(r=>r.grade)).size>1)return {code:'',label:'명단 구분 충돌',plate};
  if(matches.length)return {code:matches[0].grade,label:CLASS_LABELS[matches[0].grade],plate,source:matches[0]};
  const fixed=fleet.fixed?.[plate];
  const code=fixed?.enabled?'CF':'C';
  return {code,label:CLASS_LABELS[code],plate,reason:fixed?.reason||''};
}

// Roster classification belongs to the equipment; crew changes do not transfer it to another plate.
export function reviseFleetClass(fleet,drivers,equipment,change){
  const {driverId,from,to,actor,at}=change,plate=normalizePlate(change.plate);
  if(!plate||!Object.hasOwn(CLASS_LABELS,to)||!from)throw Error('차량번호와 용차 구분을 확인하세요.');
  const driver=drivers.find(d=>d.id===driverId),matched=equipment.filter(e=>normalizePlate(e.plateNo)===plate),eq=matched[0];
  if(!driver||matched.length!==1||(!driver.vehicleNo&&eq.driverId!==driverId)||
    (driver.vehicleNo&&normalizePlate(driver.vehicleNo)!==plate)||(eq.driverId&&eq.driverId!==driverId)||
    equipment.some(e=>e.driverId===driverId&&normalizePlate(e.plateNo)!==plate)||
    drivers.some(d=>d.id!==driverId&&d.status==='active'&&normalizePlate(d.vehicleNo)===plate))
    throw Error('현재 기사·차량 연결을 장비 관리에서 확인하세요.');
  const current=classForPlate(plate,fleet);
  if(current.code!==from)throw Error('용차 구분이 변경되었습니다. 최신 자료를 다시 열어주세요.');
  const reason=String(change.reason||'').trim();
  if(!reason||reason.length>300)throw Error('용차 구분 변경 사유를 300자 이내로 입력하세요.');
  const roster=(fleet.roster||[]).filter(r=>normalizePlate(r.plate)!==plate);
  const previous=fleet.manualClassHistory?.[plate]||[];
  const source=current.source||previous.slice().reverse().find(event=>event.rosterEntry)?.rosterEntry||{};
  if(to==='A'||to==='B')roster.push({...source,plate,grade:to,name:driver.name});
  const entry={from,to,actor,at,reason,driverId,...(current.source?{rosterEntry:current.source}:{})};
  return {...fleet,roster,fixed:{...(fleet.fixed||{}),[plate]:{enabled:to==='CF',reason,updatedAt:at}},
    manualClassHistory:{...fleet.manualClassHistory,[plate]:[...previous,entry]}};
}
