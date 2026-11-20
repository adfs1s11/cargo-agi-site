import {normalizeVin,normalizePlate,norm} from './utils.js';
import {validDate} from './schedule.js';
import {transportRouteKey} from './dispatch-identity.js';
import {performanceResolver} from './transport-performance.js';
import {planDriverName} from './safety-plan-catalog.js';

export function monthRange(month){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('조회할 연월을 선택하세요.');
 const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate();
 return {from:month+'-01',to:month+'-'+String(last).padStart(2,'0')};
}
export function historyDriverResolver(drivers=[]){
 const resolve=performanceResolver(drivers),cleanNames=new Map();
 for(const d of drivers)for(const n of [d.name,...d.aliases||[]]){const key=norm(planDriverName(n));if(!key)continue;if(!cleanNames.has(key))cleanNames.set(key,new Map());cleanNames.get(key).set(d.id,d);}
 return row=>{const exact=resolve(row);if(exact.master||exact.ambiguous)return {...exact,basis:'명부 이름·별칭'};const candidates=[...(cleanNames.get(norm(planDriverName(row.driver)))?.values()||[])];if(candidates.length>1)return {ambiguous:true,key:'',name:row.driver,basis:'동명이인 확인'};const d=candidates[0];return d?{key:d.id,name:d.name,master:d,basis:'소속 표기 제외 후 유일한 이름'}:{...exact,basis:'명부 미등록 이름'};};
}
const cleanText=v=>String(v??'').trim();
const excluded=r=>['cancelled','notshipped','support'].includes(r.status);
function signature(r,resolve){const d=resolve(r);return JSON.stringify([d.key||norm(r.driver),Number(r.count),norm(r.customer),norm(r.model),normalizePlate(r.vehicleNo),r.turnBasis==='explicit'?Number(r.turn):'',r.status||'normal']);}
const sourceRef=r=>({sheet:r.sheet||r.sourceSheet||'',row:r.rowNumber||r.sourceRow||0,date:r.date||'',vin:r.vin||'',driver:r.driver||'',origin:r.origin||'',destination:r.destination||''});
export function reviewMonthlyRows(rows,{month,dispatch=[],history=[],drivers=[],equipment=[]}={}){
 const range=monthRange(month),resolve=historyDriverResolver(drivers),known=new Map(),groups=new Map(),accepted=[],existing=[],held=[],fileDuplicates=[],links=[];
 for(const [source,list]of [['operational',dispatch],['history',history]])for(const r of list){if(r.date<range.from||r.date>range.to)continue;const key=transportRouteKey(r);if(!key)continue;if(!known.has(key))known.set(key,[]);known.get(key).push({row:r,source});}
 const hold=(row,reason)=>held.push({row:sourceRef(row),reason});
 for(const raw of rows){const row={...raw,vin:normalizeVin(raw.vin),vehicleNo:normalizePlate(raw.vehicleNo)};if(!validDate(row.date)){hold(row,'운송일 확인 필요');continue;}if(row.date<range.from||row.date>range.to){hold(row,'선택한 월과 다른 운송일');continue;}const key=transportRouteKey(row);if(!key){hold(row,'운송일·차대번호·출발지·도착지 확인 필요');continue;}if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 for(const [key,items]of groups){const row=items[0],previous=known.get(key);
  if(previous){const op=previous.find(p=>p.source==='operational')||previous[0],differences=[],missingInFile=[],missingInExisting=[];for(const k of ['driver','count','model','customer','vehicleNo','turn','status']){let a=row[k]??'',b=op.row[k]??'';const absent=v=>v===''||v==null||['count','turn'].includes(k)&&!(Number(v)>0);if(absent(a)||absent(b)){if(!absent(b))missingInFile.push(k);if(!absent(a))missingInExisting.push(k);continue;}if(k==='driver'){a=resolve(row).key||norm(a);b=resolve(op.row).key||norm(b);}else if(['count','turn'].includes(k)){a=Number(a);b=Number(b);}else a=norm(a),b=norm(b);if(a!==b)differences.push(k);}for(const item of items)existing.push({row:sourceRef(item),source:op.source,existingId:op.row.id||'',differences,missingInFile,missingInExisting,existingCopies:previous.length});continue;}
  const sig=signature(row,resolve);if(items.some(r=>signature(r,resolve)!==sig)){items.forEach(r=>hold(r,'파일 안에서 같은 운송의 기사·대수·차종 등이 서로 다름'));continue;}
  if(excluded(row)){items.forEach(r=>hold(r,'취소·미출고·지원은 운송 실적 신규 등록에서 제외'));continue;}
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(row.vin)){items.forEach(r=>hold(r,'차대번호 17자리 확인 필요'));continue;}
  if(!Number.isInteger(Number(row.count))||Number(row.count)<1){items.forEach(r=>hold(r,'명시된 양의 정수 운송 대수 확인 필요'));continue;}
  if(!cleanText(row.driver)){items.forEach(r=>hold(r,'운전자 확인 필요'));continue;}
  const owner=resolve(row);if(owner.ambiguous){items.forEach(r=>hold(r,'동명이인: 기사 확인 후 등록 필요'));continue;}
  const clean={...row,driverId:owner.master?.id||'',driverLinkBasis:owner.basis};accepted.push(clean);fileDuplicates.push(...items.slice(1).map(sourceRef));
  if(!owner.master)links.push({row:sourceRef(row),reason:'기사 명부에 없음 · 원본 이름 유지, 기사 자동 생성 안 함'});
  else if(row.vehicleNo&&owner.master.vehicleNo&&normalizePlate(owner.master.vehicleNo)!==row.vehicleNo)links.push({row:sourceRef(row),reason:'당시 차량이 현재 기사 차량과 다름 · 승무 변경 가능, 당시 번호 유지'});
  else if(!row.vehicleNo)links.push({row:sourceRef(row),reason:'당시 운송차량 미입력 · 현재 차량을 과거 기록에 소급하지 않음'});
 }
 const perSheet=new Map();for(const r of rows){const key=r.sheet||r.sourceSheet||'기타';if(!perSheet.has(key))perSheet.set(key,{sheet:key,input:0,existing:0,accepted:0,held:0,duplicates:0});perSheet.get(key).input++;}for(const [key,list]of [['existing',existing],['accepted',accepted.map(row=>({row:sourceRef(row)}))],['held',held],['duplicates',fileDuplicates.map(row=>({row}))]])for(const r of list){const sheet=r.row.sheet||'기타';if(perSheet.has(sheet))perSheet.get(sheet)[key]++;}
 return {month,range,total:rows.length,accepted,existing,held,fileDuplicates,links,perSheet:[...perSheet.values()],newUnits:accepted.reduce((n,r)=>n+Number(r.count),0),differentExisting:existing.filter(r=>r.differences.length).length};
}
export function cleanReferenceRow(row){
 const fields=['date','customer','origin','destination','vin','driver','driverId','driverLinkBasis','count','turn','turnRaw','turnBasis','model','brand','region','vehicleNo','transportType','cargoClass','minSkill','dateBasis'];
 return Object.fromEntries(fields.map(k=>[k,row[k]??'']));
}
