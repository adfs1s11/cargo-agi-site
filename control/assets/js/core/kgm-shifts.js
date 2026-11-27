import {canonical,reviewKgmImport} from './kgm-model.js';

const vehicleKey=row=>JSON.stringify([canonical(row.model),canonical(row.chassis)]);
const groupByVehicle=rows=>{
 const grouped=new Map();
 for(const row of rows){
  const key=vehicleKey(row);
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(row);
 }
 return grouped;
};
export function reviewShift(rows,orders){
 const previous=groupByVehicle(orders),incoming=groupByVehicle(rows);
 const mapped=rows.map(row=>{
  const before=previous.get(vehicleKey(row))||[];
  if(!before.length)return row;
  const multiple=before.length>1||incoming.get(vehicleKey(row)).length>1;
  if(!multiple)return {...row,leg:before[0].leg||1};
  const byDestination=before.filter(o=>canonical(o.source?.destination||o.destination)===canonical(row.destination));
  if(byDestination.length===1)return {...row,leg:byDestination[0].leg||1};
  return {...row,issues:[...row.issues,'복수 구간의 도착지 변경·추가 여부를 확인하세요']};
 });
 const byId=new Map(orders.map(o=>[o.id,o]));
 return reviewKgmImport(mapped,orders).map(r=>{
  const old=byId.get(r.existingId);
  return {...r,existingRevision:old?.revision,previousDriver:old?.assignment?.driverName||old?.source?.sourceDriver||'',previousDestination:old?.source?.destination||''};
 });
}
export function sheetState(review,analyzed,phase){
 const accepted=review.filter(r=>r.review!=='invalid'&&(phase==='daytime'||r.review!=='changed'));
 const fresh=accepted.filter(r=>r.review==='new').length,changed=accepted.filter(r=>r.review==='changed').length;
 const canSave=analyzed&&accepted.length>0&&accepted.length<=500;
 return {accepted,new:fresh,changed,canSave,unsaved:canSave&&(fresh+changed>0),
 label:!analyzed?'배차표를 선택하고 분석하세요.':accepted.length>500?'한 시트에서 최대 500행을 반영할 수 있습니다.':accepted.length?'신규 '+fresh+'건 · 변경 '+changed+'건 · 반영 대상 '+accepted.length+'행. 동일 행은 중복 등록하지 않고 미배차만 기사명을 대조합니다.':'반영할 행이 없습니다.'};
}
