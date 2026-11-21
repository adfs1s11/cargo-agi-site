// Recorded credentials and a human review only; this module never infers a legal licence class.
export const QUALIFICATION_OPTIONS={
 cargoStatus:{'':'미등록',held:'보유 확인',pending:'확인 중',missing:'미보유',suspended:'정지·취소 확인'},
 reviewStatus:{'':'미확인',confirmed:'담당자 적합 확인',review:'추가 확인 필요'},
 trainingStatus:{'':'미등록',completed:'이수 확인',pending:'미이수·확인 필요'},
 ppeStatus:{'':'미등록',provided:'지급 확인',pending:'미지급·확인 필요'},
};
const text=v=>typeof v==='string'?v.trim():'';
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function qualificationValues(driver={}){
 driver=driver||{};
 const q=driver.qualifications||{};
 return {licenseType:text(q.licenseType??driver.licenseType??driver.licenseClass),licenseExpiry:text(q.licenseExpiry??driver.licenseExpiry),cargoStatus:text(q.cargoStatus),reviewStatus:text(q.reviewStatus),verifiedAt:text(q.verifiedAt),trainingStatus:text(q.trainingStatus),ppeStatus:text(q.ppeStatus),notes:text(q.notes)};
}
export function cleanDriverQualifications(input,{today=new Date().toISOString().slice(0,10)}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('운전자 자격 입력 형식을 확인하세요.');
 const q=qualificationValues({qualifications:input});
 for(const [key,options]of Object.entries(QUALIFICATION_OPTIONS))if(!Object.hasOwn(options,q[key]))throw Error('운전자 자격의 선택값을 확인하세요.');
 for(const key of ['licenseExpiry','verifiedAt'])if(q[key]&&!validDate(q[key]))throw Error('운전자 자격 날짜를 확인하세요.');
 if(q.verifiedAt>today)throw Error('자격 확인일은 오늘 이후로 입력할 수 없습니다.');
 if(q.licenseType.length>120||q.notes.length>1000)throw Error('면허 종류는 120자, 자격 메모는 1,000자 이내로 입력하세요.');
 if(q.reviewStatus==='confirmed'&&(!q.licenseType||q.cargoStatus!=='held'||!q.verifiedAt))throw Error('적합 확인에는 면허 종류·화물운송종사자격 보유 확인·확인일이 필요합니다.');
 if(q.reviewStatus==='confirmed'&&q.licenseExpiry&&q.licenseExpiry<today)throw Error('면허 유효기간이 지났습니다. 자격 확인 상태를 다시 확인하세요.');
 return q;
}
export function driverQualificationPlan(driver,{today=new Date().toISOString().slice(0,10),period=''}={}){
 const q=qualificationValues(driver),warnings=[];
 const expiryValid=!q.licenseExpiry||validDate(q.licenseExpiry),reviewDateValid=validDate(q.verifiedAt)&&q.verifiedAt<=today;
 const expired=!!q.licenseExpiry&&expiryValid&&q.licenseExpiry<today;
 const confirmed=!!driver&&q.reviewStatus==='confirmed'&&q.licenseType&&q.cargoStatus==='held'&&reviewDateValid&&expiryValid&&!expired;
 const description=[
  '면허: '+(q.licenseType||'미등록'),
  '화물운송종사자격: '+(QUALIFICATION_OPTIONS.cargoStatus[q.cargoStatus]||'확인 필요'),
  ...(q.licenseExpiry?['면허 유효기간: '+q.licenseExpiry+(expired?' (기간 경과 · 재확인)':'')]:[]),
  '담당자 확인: '+(confirmed?'적합 확인 / '+q.verifiedAt:'확인 필요'+(q.verifiedAt?' / '+q.verifiedAt:'')),
  ...(q.notes?['자격 메모: '+q.notes]:[]),
 ];
 if(!driver)warnings.push('계획서 운전자의 기사 명부 연결을 확인하세요.');
 if(!confirmed)warnings.push('운전자 면허·운송자격의 담당자 확인이 필요합니다. 기사 관리에서 등록하세요.');
 const dates=[...String(period).matchAll(/(\d{4})[.-](\d{2})[.-](\d{2})/g)].map(m=>m[1]+'-'+m[2]+'-'+m[3]);
 if(q.licenseExpiry&&dates.length>1&&q.licenseExpiry>=today&&q.licenseExpiry<dates[1]){description.push('작업기간 중 면허 유효기간 재확인 필요');warnings.push('작업기간 종료 전에 면허 유효기간이 도래합니다.');}
 const cells={H39:description.join('\n'),K20:confirmed?'적합':'확인 필요'};
 if(q.trainingStatus)cells.I20=q.trainingStatus==='completed'?'이수':'확인 필요';
 if(q.ppeStatus)cells.J20=q.ppeStatus==='provided'?'지급':'확인 필요';
 return {cells,warnings,driverId:driver?.id||'',qualifications:q};
}
