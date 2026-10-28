import * as db from './db.js';
import { norm, uid } from './utils.js';
import { validDate } from './schedule.js';

export const historyKey = r => JSON.stringify([r.date,...['origin','destination','vin'].map(k=>norm(r[k]))]);
const signature = r => JSON.stringify(['driver','count','model','transportType','cargoClass','vehicleNo'].map(k=>String(r[k] ?? '').trim()));
const counted = r => !['cancelled','notshipped','support'].includes(r.status);
export function referenceHistory(dispatch=[], history=[], date, from='') {
  const seen=new Set(), out=[];
  // Operational records take precedence over reference copies.
  const operational=new Set(dispatch);
  for(const r of [...dispatch,...history]) {
    if(!counted(r)||!r.driver||!validDate(r.date)||r.date>=date||r.date<from)continue;
    const key=historyKey(r);
    if(!operational.has(r) && seen.has(key))continue;seen.add(key);out.push(r);
  }
  return out;
}
export function previewHistory(rows, date, existing=[], dispatch=[]) {
  const known=new Map([...existing,...dispatch].map(r=>[historyKey(r),r]));
  const groups=new Map(), accepted=[], held=[], duplicates=[];
  for(const row of rows) {
    const fail=reason=>held.push({row,reason});
    if(!validDate(row.date)) {fail('연도를 포함한 운송일 확인 필요');continue;}
    if(row.date>=date) {fail('기준일 당일·미래 자료는 참고 이력에서 제외');continue;}
    if(!counted(row)) {fail('취소·미출고·지원 제외');continue;}
    if(!row.driver||!row.origin||!row.destination||!row.vin) {fail('기사·출발지·도착지·차대번호 필수');continue;}
    if(!Number.isInteger(Number(row.count))||Number(row.count)<1) {fail('양의 정수 운송 대수 확인 필요');continue;}
    const key=historyKey(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
  }
  for(const [key,items] of groups) {
    const row=items[0];
    if(items.some(r=>signature(r)!==signature(row))) {items.forEach(row=>held.push({row,reason:'동일 운송의 상이한 자료 확인 필요'}));continue;}
    const previous=known.get(key);
    if(previous) {
      items.forEach(row=>signature(row)===signature(previous)?duplicates.push(row):held.push({row,reason:'기존 운송과 내용이 달라 자동 변경하지 않음'}));continue;
    }
    accepted.push(row);duplicates.push(...items.slice(1));
  }
  return {accepted,held,duplicates};
}
export async function commitHistory(rows,date,fileName) {
  const database=await db.openDb();let result;
  await new Promise((resolve,reject)=>{
    const tx=database.transaction(['transportHistory','historyImports','dispatch'],'readwrite');let left=2,values={},failure;
    for(const name of ['transportHistory','dispatch'])tx.objectStore(name).getAll().onsuccess=e=>{
      values[name]=e.target.result;if(--left)return;
      try {
        result=previewHistory(rows,date,values.transportHistory,values.dispatch);
        const batchId=uid('history'), importedAt=new Date().toISOString();
        for(const r of result.accepted) {
          const clean=Object.fromEntries(['date','customer','origin','destination','vin','driver','count','turn','model','brand','region','vehicleNo','transportType','cargoClass','minSkill'].map(k=>[k,r[k] ?? '']));
          tx.objectStore('transportHistory').put({...clean,id:uid('hist'),batchId,status:'normal',sourceFile:fileName,sourceSheet:r.sheet || r.tab || '',sourceRow:r.rowNumber,importedAt});
        }
        if(result.accepted.length)tx.objectStore('historyImports').put({id:batchId,fileName,importedAt,count:result.accepted.length,dateFrom:result.accepted.map(r=>r.date).sort()[0],dateTo:result.accepted.map(r=>r.date).sort().at(-1)});
      }catch(e){failure=e;tx.abort();}
    };
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure || tx.error);
  });
  return result;
}
