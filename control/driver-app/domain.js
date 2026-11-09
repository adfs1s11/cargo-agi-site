export const normalizeVin=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'');
export const validVin=value=>/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(value));
export function vinCandidates(text){return [...new Set((String(text||'').toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g)||[]).filter(validVin))];}
export function compareVin(value,orders){
 const vin=normalizeVin(value);if(!validVin(vin))return {status:'invalid',message:'VIN 17자리를 사진과 비교해 확인해 주세요. I·O·Q는 VIN에 사용하지 않습니다.'};
 const matches=orders.filter(row=>normalizeVin(row.vin)===vin);
 if(!matches.length)return {status:'mismatch',message:'선택 날짜의 내 배차와 일치하지 않습니다. 상차 전 담당자에게 확인하세요.',matches:[]};
 return {status:matches.length===1?'match':'multiple',message:matches.length===1?'내 배차 VIN과 일치합니다. 구간과 차량 위치도 확인하세요.':'같은 VIN의 배차가 여러 건입니다. 출발·도착지와 회전을 선택해 확인하세요.',matches};
}
export function phoneE164(value){const phone=String(value||'').replace(/\D/g,'').replace(/^82/,'0');if(!/^010\d{8}$/.test(phone))throw Error('010으로 시작하는 휴대폰 번호를 확인하세요.');return '+82'+phone.slice(1);}
export function watermarkLines({vin='',location='',at=new Date(),source='camera'}){
 if(vin&&!validVin(vin))throw Error('워터마크 VIN은 17자리로 확인해 주세요.');
 return ['M&M 운송 기록',vin?'VIN '+normalizeVin(vin):'VIN 미입력',String(location).trim().slice(0,80)||'위치 미입력',new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(at)+' KST · '+(source==='camera'?'앱 처리시각':'워터마크 처리시각')];
}
