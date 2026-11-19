import {planDriverName} from './safety-plan-catalog.js';
const text=v=>String(v??'').trim(),key=v=>text(v).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const plate=v=>key(v).replace(/[-·]/g,'');
export const blankPhone=v=>!text(v);
export function contactPhone(value){
 let n=text(value).replace(/[\s().-]/g,'');if(/^\+82\d+$/.test(n))n='0'+n.slice(3);
 if(/^1[016789]\d{7,8}$/.test(n))n='0'+n;
 if(!/^(?:01[016789]\d{7,8}|02\d{7,8}|0[3-6][1-5]\d{7,8}|070\d{8})$/.test(n))return '';
 return n.startsWith('02')?n.replace(/^(02)(\d{3,4})(\d{4})$/,'$1-$2-$3'):n.replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3');
}
const headers={name:['이름','성명','기사','기사명','운전자','운전자명'],phone:['연락처','전화번호','휴대폰','휴대폰번호','휴대전화','기사연락처','운전자연락처'],plate:['차량번호','차번','차량']};
export function parseContactSheets(sheets){
 const rows=[],warnings=[];
 for(const {name,rows:matrix} of sheets){
  let at=-1,columns={};for(let i=0;i<Math.min(matrix.length,30);i++){const line=matrix[i].map(key),found=Object.fromEntries(Object.entries(headers).map(([k,labels])=>[k,line.findIndex(x=>labels.includes(x))]));if(found.name>=0&&found.phone>=0){at=i;columns=found;break;}}
  if(at<0){warnings.push(name+': 이름·연락처 제목을 찾지 못해 제외');continue;}
  for(let i=at+1;i<matrix.length;i++){const r=matrix[i],n=text(r[columns.name]),p=text(r[columns.phone]),v=columns.plate>=0?text(r[columns.plate]):'';if(!n&&!p&&!v)continue;if(headers.name.includes(key(n))&&headers.phone.includes(key(p)))continue;rows.push({sheet:name,row:i+1,name:n,plate:v,rawPhone:p,phone:contactPhone(p)});}
 }
 if(!rows.length)throw Error('이름·연락처가 있는 표를 찾지 못했습니다. 첫 행에 이름, 차량번호, 연락처 제목을 넣으세요.');
 if(rows.length>3000)throw Error('연락처는 한 번에 3,000행까지 등록할 수 있습니다.');
 return {rows,warnings};
}
export function matchDriverContacts(rows,drivers,equipment=[]){
 const names=d=>[d.name,...(d.aliases||[])].map(key).filter(Boolean);
 const plates=d=>[d.vehicleNo,...equipment.filter(e=>e.driverId===d.id).map(e=>e.plateNo)].map(plate).filter(Boolean);
 const sourceGroups=new Map();for(const r of rows){const k=key(r.name)+'|'+plate(r.plate);if(!sourceGroups.has(k))sourceGroups.set(k,new Set());if(r.phone)sourceGroups.get(k).add(r.phone);}
 const out=rows.map((r,index)=>{
  const result={...r,index,status:'hold',reason:'',driverId:'',driverName:'',existingPhone:''};
  if(!r.name)return {...result,reason:'이름 없음'};if(!r.phone)return {...result,reason:r.rawPhone?'연락처 형식 확인 필요':'원본 연락처 없음'};
  if(sourceGroups.get(key(r.name)+'|'+plate(r.plate)).size>1)return {...result,reason:'파일 안 동일 기사·차량의 연락처가 서로 다름'};
  const p=plate(r.plate),exact=drivers.filter(d=>names(d).includes(key(r.name)));let candidates=exact,basis='이름·별칭 일치';
  if(exact.length>1&&p)candidates=exact.filter(d=>plates(d).includes(p));
  if(!exact.length&&p){candidates=drivers.filter(d=>plates(d).includes(p)&&[d.name,...(d.aliases||[])].some(n=>key(planDriverName(n))===key(planDriverName(r.name))));basis='소속 표기 제외 이름 + 차량번호 일치';}
  if(candidates.length!==1)return {...result,reason:candidates.length>1?'동명이인·중복 기사 확인 필요':exact.length?'동명이인 차량 대조 필요':'기존 기사와 일치하지 않음'};
  const d=candidates[0],known=plates(d),matched={...result,driverId:d.id,driverName:d.name,existingPhone:text(d.phone),basis};
  if(p&&known.length&&!known.includes(p))return {...matched,reason:'이름은 같지만 등록 차량번호가 다름'};
  if(p&&drivers.some(other=>other.id!==d.id&&plates(other).includes(p)))return {...matched,reason:'해당 차량이 다른 기사에게도 연결되어 있음'};
  if(!blankPhone(d.phone))return {...matched,status:'keep',reason:contactPhone(d.phone)===r.phone?'기존 연락처 동일 · 유지':'기존 연락처 있음 · 덮어쓰지 않음'};
  if(drivers.some(other=>other.id!==d.id&&contactPhone(other.phone)===r.phone))return {...matched,reason:'다른 기사에게 이미 등록된 연락처'};
  return {...matched,status:'ready',reason:basis+' · 빈 연락처 보완'};
 });
 const byDriver=new Map(),byPhone=new Map();for(const r of out.filter(x=>x.status==='ready')){if(!byDriver.has(r.driverId))byDriver.set(r.driverId,[]);byDriver.get(r.driverId).push(r);if(!byPhone.has(r.phone))byPhone.set(r.phone,new Set());byPhone.get(r.phone).add(r.driverId);}
 for(const r of out.filter(x=>x.status==='ready')){if(new Set(byDriver.get(r.driverId).map(x=>x.phone)).size>1){r.status='hold';r.reason='동일 기사에 서로 다른 연락처가 연결됨';}else if(byPhone.get(r.phone).size>1){r.status='hold';r.reason='같은 연락처가 여러 기사에게 연결됨';}else if(byDriver.get(r.driverId)[0]!==r){r.status='duplicate';r.reason='동일 기사·연락처 중복 행';}}
 return out;
}
