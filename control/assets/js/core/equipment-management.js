// Shared equipment rules; unknown dates and capacity must remain unknown.
export const EQUIPMENT_STATUS={pending:'확인 필요',active:'가동',maintenance:'정비',idle:'휴차'};
const plate=value=>String(value||'').replace(/[\s·.]/g,'').toUpperCase();
export function calendarDay(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;
 const timestamp=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value?timestamp:null;
}
export function equipmentAlerts(item,today){
 const now=calendarDay(today);if(now===null)throw Error('조회 기준일을 확인하세요.');
 const alerts=[];
 for(const [key,label] of [['insuranceExpiry','보험'],['inspectionExpiry','검사']]){
  const date=calendarDay(item[key]);
  if(date===null){alerts.push({key,level:'unknown',label:label+' 만료일 확인 필요',days:null});continue;}
  const days=Math.round((date-now)/86400000);
  if(days<=30)alerts.push({key,level:days<0?'overdue':'due',label:label+(days<0?' 만료 '+Math.abs(days)+'일 경과':days===0?' 오늘 만료':' '+days+'일 후 만료'),days});
 }
 if(!Number.isInteger(Number(item.capacity))||Number(item.capacity)<=0)alerts.push({key:'capacity',level:'unknown',label:'적재량 확인 필요',days:null});
 if(item.status==='pending'||!Object.hasOwn(EQUIPMENT_STATUS,item.status))alerts.push({key:'status',level:'unknown',label:'운행 상태 확인 필요',days:null});
 return alerts;
}
export function validateEquipmentDetails(item,otherEquipment=[]){
 const normalized=plate(item.plateNo);if(!normalized)throw Error('차량번호를 입력하세요.');
 if(otherEquipment.some(e=>e.id!==item.id&&plate(e.plateNo)===normalized))throw Error('이미 등록된 차량번호입니다. 기존 차량을 수정하세요.');
 if(!Object.hasOwn(EQUIPMENT_STATUS,item.status))throw Error('차량 상태를 확인하세요.');
 for(const [key,label] of [['insuranceExpiry','보험'],['inspectionExpiry','검사']])if(item[key]&&calendarDay(item[key])===null)throw Error(label+' 만료일을 확인하세요.');
 if(!Number.isFinite(Number(item.maxLoadKg))||Number(item.maxLoadKg)<0)throw Error('허용 적재중량은 0 이상의 숫자로 입력하세요.');
}
export const SERVICE_TYPES={inspection:'점검',repair:'수리',consumable:'소모품 교환',other:'기타'};
export function makeServiceRecord(input,{equipment,today,actor,id,createdAt}){
 if(!equipment?.id||!id||!actor?.id)throw Error('차량과 작성자 정보를 확인하세요.');
 if(!Object.hasOwn(SERVICE_TYPES,input.kind))throw Error('정비 구분을 선택하세요.');
 if(calendarDay(input.date)===null||input.date>today)throw Error('실제 정비일을 오늘 이전 날짜로 입력하세요.');
 const description=String(input.description||'').trim(),vendor=String(input.vendor||'').trim();
 if(!description||description.length>2000)throw Error('정비 내용을 1~2,000자로 입력하세요.');
 if(vendor.length>200)throw Error('정비업체명은 200자 이내로 입력하세요.');
 const optionalNumber=(value,label)=>{if(value===''||value===undefined||value===null)return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error(label+'은 0 이상의 정수로 입력하세요.');return n;};
 const odometer=optionalNumber(input.odometer,'누적 주행거리'),supplyCost=optionalNumber(input.supplyCost,'정비 공급가');
 if(input.nextDue&&(calendarDay(input.nextDue)===null||input.nextDue<input.date))throw Error('다음 점검일은 정비일 이후로 입력하세요.');
 return {id,equipmentId:equipment.id,plateNo:equipment.plateNo,kind:input.kind,date:input.date,description,vendor,odometer,supplyCost,nextDue:input.nextDue||'',createdAt,actorId:actor.id,actorName:actor.name||''};
}
