export const REG_FIELDS=[['plateNo','차량번호'],['vin','차대번호'],['model','차명'],['vehicleType','등록 차종'],['manufactured','제작연월'],['firstRegistered','최초등록일'],['grossWeightKg','총중량(kg)'],['maxLoadKg','최대적재량(kg)'],['lengthMm','길이(mm)'],['widthMm','너비(mm)'],['heightMm','높이(mm)'],['inspectionUntil','검사 유효기간 종료일']];
export const BASE_TEMPLATE={id:'tesla-pool',version:1,customer:'TESLA',label:'고정 Pool 장비 현황·안전 확인',items:[
 {id:'structure',label:'장비 구조·적재 대수',hint:'풀트레일러/세미트레일러/대형트럭/중형트럭/세이프티로더 및 7대 이상/6대/5대/4대/2대/1대 중 확인한 내용',requireNote:true},
 {id:'specialEquipment',label:'특장장비 제작업체·승인연도',hint:'제작업체·특장 승인연도를 확인하세요. 차량 연식과 구분합니다.',requireNote:true},
 {id:'replacement',label:'차량 교체 계획·운행 여부',hint:'교체 예정월 또는 계획 없음·운행 중/제외 여부를 기재하세요.',requireNote:true},
 {id:'lifting',label:'2층 데크 인양장치',hint:'장치명과 점검 상태를 기재하세요.'},
 {id:'falling',label:'2층 데크 낙하방지 시설',hint:'시설 종류·작동 확인 내용'},
 {id:'fallProtection',label:'작업자 추락방지 시설',hint:'안전난간 등 설치·상태 확인'},
 {id:'workPlan',label:'화물자동차 작업계획서',hint:'작성 여부와 적용 연도·작업장소'},
 {id:'specialInspection',label:'특장장비 외부 전문업체 점검',hint:'최근 점검일·업체·조치 내용'},
 {id:'regularInspection',label:'화물자동차 정기검사·가변축 점검',hint:'최근 검사일·유효기간·가변축 해당 여부'}]};
export const STATUSES={'good':'확인·양호','issue':'이상·조치 필요','unknown':'확인 중','na':'해당 없음'};
export function phoneKey(v){return String(v||'').replace(/^\+82\s?0?/,'0').replace(/[^0-9]/g,'');}
export function registrationCandidate(text){
 const t=String(text||'');const result={};
 const plates=[...new Set(t.match(/(?:서울|부산|대구|인천|광주|대전|울산|경기|강원|충북|충남|전북|전남|경북|경남|제주|세종)?\s?\d{2,3}\s?[가-힣]\s?\d{4}/g)||[])];
 if(plates.length===1)result.plateNo=plates[0].replace(/\s/g,'');
 const vins=[...new Set(t.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g)||[])];if(vins.length===1)result.vin=vins[0];
 for(const[k,label]of [['grossWeightKg','총중량'],['maxLoadKg','최대적재량'],['lengthMm','길이'],['widthMm','너비'],['heightMm','높이']]){const m=t.match(new RegExp(label+'[^0-9\\n]{0,12}([0-9,]+)\\s*(?:kg|mm)','i'));if(m)result[k]=m[1].replace(/,/g,'');}
 return result;
}
export function cleanRegistration(input){const out={};for(const[k]of REG_FIELDS){const s=String(input[k]||'').trim();if(s.length>100)throw Error('등록증 입력값이 너무 깁니다.');out[k]=s;}return out;}
export function validateInspection(input,template){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(input.date)||isNaN(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date)throw Error('점검일을 확인하세요.');
 const answers={};for(const item of template.items){const a=input.answers?.[item.id]||{};if(!Object.prototype.hasOwnProperty.call(STATUSES,a.status))throw Error(item.label+': 상태를 선택하세요.');const note=String(a.note||'').trim();if(note.length>500)throw Error('점검 메모는 500자 이하입니다.');if((a.status!=='good'||item.requireNote)&&!note)throw Error(item.label+': 사유 또는 확인 계획을 입력하세요.');answers[item.id]={status:a.status,note};}
 if(input.confirmed!==true)throw Error('직접 확인한 내용인지 확인해주세요.');
 return {date:input.date,answers,registration:cleanRegistration(input.registration||{}),confirmed:true};
}
