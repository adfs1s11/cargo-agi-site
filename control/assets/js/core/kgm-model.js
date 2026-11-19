// KGM dispatch is a separate ledger. Short chassis identifiers are not import-car VINs.
export const KGM_STATUS={pending:'미배차',assigned:'배차 확정',transit:'운송 중',completed:'배송 완료',hold:'보류',cancelled:'취소'};
export const KGM_AVAILABILITY={unknown:'미확인',available:'가용',off:'휴무',maintenance:'정비'};
export const text=v=>String(v??'').trim();
export const canonical=v=>text(v).replace(/\s+/g,'').toUpperCase();
export const kgmKey=r=>canonical(r.model)+'|'+canonical(r.chassis)+'|'+(Number(r.leg)||1);
export function validDay(s){return /^20\d\d-\d\d-\d\d$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function looksLikeKgm(row){const h=row.map(c=>canonical(c));return h.includes('TP번호')&&h.includes('차대번호')&&h.includes('차량세부도착지');}
function sourceDate(v){const s=text(v);if(!s)return '';let n=Number(s);if(Number.isFinite(n)&&n>=20000101&&n<=20991231){const d=String(Math.trunc(n));return d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8);}if(Number.isFinite(n)&&n>=36526&&n<73051)return new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10);const m=s.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:s;}
function id(v){if(typeof v==='number'&&Number.isSafeInteger(v))return String(v);return text(v);}
export function parseKgmRows(matrix,{sheet='',day=''}={}){
 if(!validDay(day))throw Error('배차 기준일을 연도까지 확인하세요.');
 const header=matrix.slice(0,30).findIndex(looksLikeKgm);if(header<0)throw Error('KGM 배차표의 TP번호·차대번호·차량세부도착지 열을 찾지 못했습니다.');
 const names=matrix[header].map(text),col=k=>names.indexOf(k),at=(r,k)=>r[col(k)],rows=[],issues=[],groups=[];let ignored=0,group='',roster=false;
 for(let i=header+1;i<matrix.length;i++){
  const r=matrix[i]||[],model=id(at(r,'차종')),chassis=id(at(r,'차대번호'));if(looksLikeKgm(r))continue;
  if(chassis==='차량번호'&&['번호','연락처'].includes(model)){roster=true;ignored++;continue;}
  if(roster){if(!r.some(v=>text(v)))roster=false;else if(validDay(sourceDate(at(r,'출고일자')))&&model&&!/^01[0-9][\s-]/.test(model))roster=false;else{ignored++;continue;}}
  if(/^01[0-9][\s-]/.test(model)){ignored++;continue;}
  if(!model&&!chassis){ignored++;const label=text(at(r,'차량세부도착지'));if(label&&!r.some((v,j)=>j!==col('차량세부도착지')&&text(v))&&i<400){group=label;if(!groups.includes(group))groups.push(group);}continue;}
  const item={day,model,chassis,customer:text(at(r,'매출처')),customerName:text(at(r,'고객명')),spec:text(at(r,'스팩')),color:text(at(r,'컬러')),sourceStage:id(at(r,'ST')),salesOffice:text(at(r,'영업소')),destination:text(at(r,'차량세부도착지')),region:text(at(r,'코드')),note:text(at(r,'비고')),releaseDate:sourceDate(at(r,'출고일자')),releaseTime:id(at(r,'출고시간')),contractDate:sourceDate(at(r,'계약일')),serviceNote:text(at(r,'용역비')),sourceTp:id(at(r,'TP번호')),sourceDriver:text(at(r,'이름')),sourcePhone:text(r[col('이름')+1]),section:group,sourceSheet:sheet,sourceRow:i+1};
  const errors=[];if(!model||!chassis)errors.push('차종·차대번호 누락');if(!item.destination)errors.push('도착지 누락');if([model,chassis,item.destination].some(v=>/^#(N\/A|REF!|VALUE!|DIV\/0!)/.test(v)))errors.push('필수값 엑셀 오류');if(item.releaseDate&&!validDay(item.releaseDate))errors.push('출고일자 형식 확인');
  if(item.sourceTp&&!/^[\p{L}\p{N} -]{1,30}$/u.test(item.sourceTp))errors.push('TP번호 확인');
  item.issues=errors;rows.push(item);if(errors.length)issues.push({row:i+1,errors});
 }
 const byVehicle=new Map();for(const r of rows){const k=canonical(r.model)+'|'+canonical(r.chassis);const list=byVehicle.get(k)||[];r.leg=list.length+1;list.push(r);byVehicle.set(k,list);}for(const list of byVehicle.values()){for(const r of list){r.legCount=list.length;if(list.length>1&&list.filter(x=>canonical(x.destination)===canonical(r.destination)).length>1)r.issues.push('같은 차량·도착지 중복 확인 필요');}}
 return {rows,ignored,header:header+1,groups,issues:rows.filter(r=>r.issues.length)};
}
export function resourceCandidates(rows){const map=new Map();for(const r of rows){if(!r.sourceTp||!r.sourceDriver)continue;const key=canonical(r.sourceTp);let v=map.get(key);if(!v){v={tp:r.sourceTp,driverName:r.sourceDriver,phone:r.sourcePhone,vehicleNo:'',capacity:0,conflict:false,count:0};map.set(key,v);}if(canonical(v.driverName)!==canonical(r.sourceDriver)||v.phone.replace(/\D/g,'')!==r.sourcePhone.replace(/\D/g,''))v.conflict=true;v.count++;}return [...map.values()].sort((a,b)=>a.driverName.localeCompare(b.driverName,'ko'));}
export function reviewKgmImport(rows,existing){const map=new Map(existing.map(r=>[kgmKey(r),r]));return rows.map(r=>{const found=map.get(kgmKey(r));return {...r,review:r.issues?.length?'invalid':!found?'new':JSON.stringify(sourcePayload(r))===JSON.stringify(sourcePayload(found.source||found))?'same':'changed',existingId:found?.id};});}
export function sourcePayload(r){return Object.fromEntries(['model','chassis','leg','customer','customerName','spec','color','sourceStage','salesOffice','destination','region','note','releaseDate','releaseTime','contractDate','serviceNote','sourceTp','sourceDriver','sourcePhone','section'].map(k=>[k,k==='leg'?String(Number(r[k])||1):text(r[k])]));}
export function csv(rows){return '\ufeff'+rows.map(row=>row.map(value=>{const s=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
