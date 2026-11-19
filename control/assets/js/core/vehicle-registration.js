export const REGISTRATION_FIELDS=[['plateNo','차량번호','text'],['vin','차대번호 (VIN)','text'],['manufacturer','제작사명','text'],['model','차명','text'],['registeredType','등록 차종','text'],['manufacturedAt','제작연월 (YYYY-MM)','text'],['firstRegisteredAt','최초등록일','date'],['grossWeightKg','총중량 (kg)','number'],['maxLoadKg','최대적재량 (kg)','number'],['lengthMm','길이 (mm)','number'],['widthMm','너비 (mm)','number'],['heightMm','높이 (mm)','number'],['inspectionExpiry','검사 유효기간 종료일','date']];
export const registrationPlate=v=>String(v||'').normalize('NFC').replace(/\s/g,'');
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function cleanRegistrationFields(input,{requirePlate=false}={}){
 const fields={};for(const [key,label,type] of REGISTRATION_FIELDS){let v=String(input?.[key]??'').trim();if(v.length>120)throw Error(label+'은 120자 이내로 입력하세요.');if(!v)continue;
 if(key==='plateNo'){v=registrationPlate(v);if(!/^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/.test(v))throw Error('차량번호를 확인하세요.');}
 if(key==='vin'){v=v.replace(/\s/g,'').toUpperCase();if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(v))throw Error('차대번호는 I·O·Q를 제외한 영문·숫자 17자리입니다.');}
 if(type==='number'){v=v.replace(/,/g,'');if(!/^\d+(?:\.\d+)?$/.test(v)||Number(v)<=0||Number(v)>200000)throw Error(label+'은 단위를 확인한 양수로 입력하세요.');v=Number(v);}
 if(type==='date'&&!validDate(v))throw Error(label+'의 날짜를 확인하세요.');
 if(key==='manufacturedAt'&&!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(v))throw Error('제작연월은 YYYY-MM 형식으로 입력하세요.');fields[key]=v;
 }if(requirePlate&&!fields.plateNo)throw Error('차량번호를 입력하세요.');return fields;
}
export function registrationValues(equipment){const values={...(equipment?.registration?.fields||{}),...Object.fromEntries(REGISTRATION_FIELDS.map(([k])=>[k,equipment?.[k]??equipment?.registration?.fields?.[k]??(k==='manufacturer'?equipment?.sourceRoster?.manufacturer:'')??'']))};for(const [k,,type] of REGISTRATION_FIELDS)if(type==='number'&&Number(values[k])===0)values[k]='';return values;}
export function matchRegistration(fields,equipment){
 const plate=registrationPlate(fields.plateNo),vin=String(fields.vin||'').toUpperCase();
 const byPlate=plate?equipment.filter(e=>registrationPlate(e.plateNo)===plate):[],byVin=vin?equipment.filter(e=>String(registrationValues(e).vin||'').toUpperCase()===vin):[];
 if(byPlate.length>1||byVin.length>1)throw Error('같은 차량번호 또는 차대번호가 중복 등록되어 있습니다. 원장을 먼저 확인하세요.');
 if(byPlate[0]&&byVin[0]&&byPlate[0].id!==byVin[0].id)throw Error('차량번호와 차대번호가 서로 다른 차량을 가리킵니다. 원본과 원장을 확인하세요.');
 const row=byPlate[0]||byVin[0]||null;if(row&&plate&&registrationPlate(row.plateNo)!==plate)throw Error('차대번호는 같지만 차량번호가 다릅니다. 번호 변경 여부를 차량정보 수정에서 먼저 확인하세요.');return row;
}
export function prepareRegistrationUpdate(input,equipment,selectedKeys,{id,actor,now,provider}){
 const fields=cleanRegistrationFields(input,{requirePlate:true});const keys=new Set(selectedKeys);
 if(equipment&&registrationPlate(equipment.plateNo)!==fields.plateNo)throw Error('등록증 차량번호와 선택 차량이 다릅니다.');
 const current=registrationValues(equipment);if(current.vin&&fields.vin&&current.vin!==fields.vin)throw Error('기존 차대번호와 다릅니다. 차량정보를 먼저 확인하세요.');
 const applied={};for(const [k] of REGISTRATION_FIELDS)if(k!=='plateNo'&&keys.has(k)&&fields[k]!==undefined&&String(current[k]??'')!==String(fields[k]))applied[k]=fields[k];
 if(!equipment&&!fields.vin)throw Error('신규 차량은 정확한 차대번호를 입력하세요.');
 if(!equipment&&!keys.has('vin'))throw Error('신규 차량의 차대번호를 반영 항목으로 선택하세요.');
 if(equipment&&!Object.keys(applied).length)throw Error('반영할 변경 항목을 선택하세요.');
 const row={...(equipment||{id,plateNo:fields.plateNo,type:'카캐리어',structure:'',capacity:0,driverId:'',driverName:'',status:'pending',insuranceExpiry:'',createdAt:now}),...applied,updatedAt:now};
 row.registration={...(equipment?.registration||{}),fields:{...(equipment?.registration?.fields||{}),plateNo:fields.plateNo,...applied},confirmedAt:now,confirmedBy:actor,provider};
 return {row,applied};
}
const spaced=s=>s.split('').map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
export function parseRegistrationText(text){
 const t=String(text||'').normalize('NFKC').slice(0,80000),fields={},review=[];
 const regions='서울 부산 대구 인천 광주 대전 울산 경기 강원 충북 충남 전북 전남 경북 경남 제주 세종'.split(' ').map(spaced).join('|');
 const plates=[...new Set((t.match(new RegExp('(?:'+regions+')?\\s*\\d{2,3}\\s*[가-힣]\\s*\\d{4}','g'))||[]).map(registrationPlate))];if(plates.length===1)fields.plateNo=plates[0];else review.push('차량번호');
 const vins=[...new Set(t.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g)||[])];if(vins.length===1)fields.vin=vins[0];else review.push('차대번호');
 const numeric=[['grossWeightKg','총중량','kg'],['maxLoadKg','최대적재량','kg'],['lengthMm','길이','mm'],['widthMm','너비','mm'],['heightMm','높이','mm']];
 for(const [key,label,unit] of numeric){const re=new RegExp(spaced(label)+'\\s*(?:\\('+unit+'\\))?\\s*[:：]?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*('+unit+'|㎏|㎜|톤|t)?(?=\\s|$|[),])','ig');const values=[...t.matchAll(re)].map(m=>{const n=Number(m[1].replace(/,/g,''));return /^(톤|t)$/i.test(m[2]||'')&&unit==='kg'?n*1000:n;});if(values.length===1&&values[0]>0&&values[0]<=200000)fields[key]=values[0];else review.push(label);}
 for(const [key,label] of [['model','차명'],['registeredType','차종']]){const m=t.match(new RegExp('(?:^|\\n)\\s*(?:[①-⑳0-9.()]+\\s*)?'+spaced(label)+'\\s*[:：]?\\s*([^\\n:：]{1,50})','m'));if(m){const v=m[1].trim();if(v&&!/소유자|주소|주민|차대|연료|형식|용도/.test(v))fields[key]=v;}}
 const date=s=>{const m=String(s).match(/(19\d{2}|20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);if(!m)return '';const v=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');return validDate(v)?v:'';};
 const first=t.match(new RegExp(spaced('최초등록일')+'[^\\n]{0,60}'));if(first){const v=date(first[0]);if(v)fields.firstRegisteredAt=v;}
 const made=t.match(new RegExp(spaced('제작연월')+'\\s*[:：]?\\s*(19\\d{2}|20\\d{2})[.\\-/년\\s]+(\\d{1,2})'));if(made){const v=made[1]+'-'+made[2].padStart(2,'0');if(/^\d{4}-(0[1-9]|1[0-2])$/.test(v))fields.manufacturedAt=v;}
 const expiry=t.match(new RegExp(spaced('검사유효기간')+'[^\\n]{0,100}'));if(expiry){const dates=[...expiry[0].matchAll(/(?:19|20)\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}/g)].map(m=>date(m[0])).filter(Boolean);if(dates.length===2&&dates[1]>=dates[0])fields.inspectionExpiry=dates[1];else review.push('검사 유효기간 종료일');}
 return {fields,review:[...new Set(review)],warning:'인식값을 등록증과 대조하세요. 비어 있는 항목은 직접 입력할 수 있습니다.'};
}
