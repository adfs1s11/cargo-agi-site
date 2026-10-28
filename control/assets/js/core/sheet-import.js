import * as db from './db.js';
import { uid, norm, normalizePlate } from './utils.js';
import { reloadAll, invalidateDispatch } from './data.js';
import { validDate } from './schedule.js';

export function spreadsheetId(value) {
  const text=String(value || '').trim();
  const match=text.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (!match) throw Error('비공개 원본의 Google 스프레드시트 URL을 입력하세요.');
  return match[1];
}
export function validatePeriod(from,to) {
  if(!validDate(from)||!validDate(to)||from>to)throw Error('불러올 시작일과 종료일을 확인하세요.');
  if(from.slice(0,4)!==to.slice(0,4)||(Date.parse(to)-Date.parse(from))/86400000>30)throw Error('같은 연도 안에서 최대 31일을 선택하세요.');
}
export function tabDate(name,year) {
  const m=String(name).match(/^(\d{2})(\d{2})$/), full=String(name).match(/^(20\d{2})[-.]?(\d{2})[-.]?(\d{2})$/);
  const date=full?`${full[1]}-${full[2]}-${full[3]}`:m?`${year}-${m[1]}-${m[2]}`:'';
  return validDate(date)?date:'';
}
export async function sourceCall(config, action, payload={}) {
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.url || ''))throw Error('읽기 전용 Apps Script 웹앱 /exec URL을 입력하세요.');
  if(String(config.token || '').length<32)throw Error('연결 토큰은 32자 이상이어야 합니다.');
  const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),45000);
  try {
    const response=await fetch(config.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({token:config.token,action,payload}),signal:ctrl.signal,redirect:'follow',cache:'no-store'});
    if(!response.ok)throw Error('연결 응답 오류 ('+response.status+')');
    let data;try{data=await response.json();}catch{throw Error('연결 주소·배포 권한·읽기 전용 코드 버전을 확인하세요.');}
    if(!data.ok)throw Error(data.error || '원본 조회 실패');
    return data.data;
  }catch(e){if(e.name==='AbortError')throw Error('조회 시간이 초과되었습니다. 기간을 줄여 다시 시도하세요.');throw e;}finally{clearTimeout(timer);}
}
const COLS={customer:'거래처',date:'출발시간',origin:'출발지',destination:'도착지',vin:'차대번호',color:'색상',position:'위치',model:'차종',driver:'운전자',count:'댓수',turn:'회전',code:'코드',note:'비고',sourceClaim:'청구',sourceHabul:'하불',unloadName:'하차담당자',customerName:'고객',vehicleNo:'차량번호',driverPhone:'기사연락처'};
const text=v=>String(v ?? '').trim();
const canonical=row=>JSON.stringify(['date','customer','origin','destination','vin','model','driver','vehicleNo','count','turn','color','position','code','note','sourceClaim','sourceHabul','unloadName','unloadPhone','customerName','customerPhone','driverPhone'].map(k=>row[k] ?? ''));
const identity=row=>[row.date,norm(row.customer),norm(row.origin),norm(row.destination),norm(row.vin),norm(row.model)].join('|');
export const sheetRecordIdentity=identity;
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}

export async function reviewSheetRows(batches,{from,to,spreadsheetId:sourceId,existing=[]}) {
  validatePeriod(from,to);
  const candidates=[],held=[],outside=[],warnings=[];
  for(const batch of batches){
    const headers=(batch.headers || []).map(text), map={};
    for(const [key,label] of Object.entries(COLS)){const positions=headers.flatMap((h,i)=>h===label?[i]:[]);if(positions.length===1)map[key]=positions[0];}
    const phones=headers.flatMap((h,i)=>h==='연락처'?[i]:[]);
    if(phones.length===2){map.unloadPhone=phones[0];map.customerPhone=phones[1];}
    const missing=['customer','date','origin','destination','vin','count'].filter(k=>map[k]===undefined);
    if(missing.length){held.push({sheet:batch.title,row:1,reason:'필수 열 누락·중복: '+missing.map(k=>COLS[k]).join(', ')});continue;}
    for(const item of batch.rows || []){
      const values=item.values || [];if(!values.some(v=>text(v)))continue;
      const row=Object.fromEntries(Object.keys(map).map(k=>[k,text(values[map[k]])]));
      if(!row.vin && !(row.customer && row.destination))continue;
      if(/^(합계|소계|총계|계)$/.test(row.customer)||/^(합계|소계|총계)$/.test(row.destination))continue;
      const fail=reason=>held.push({sheet:batch.title,row:item.rowNumber,reason});
      const dateMatch=row.date.match(/^(20\d{2})[-./](\d{1,2})[-./](\d{1,2})(?:\s|T|$)/);
      const date=dateMatch?`${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`:'';
      if(!validDate(date)){fail('운송일 누락·시간만 입력·유효하지 않은 날짜');continue;}
      if(date<from||date>to){outside.push({sheet:batch.title,row:item.rowNumber,date});continue;}
      if(tabDate(batch.title,from.slice(0,4))!==date){fail('행 운송일과 일자 탭이 다릅니다 ('+date+')');continue;}
      if(!row.customer||!row.origin||!row.destination||!row.vin){fail('거래처·출발지·도착지·차대번호 확인 필요');continue;}
      const amount=text(row.count).replaceAll(',','');
      if(!/^\d+$/.test(amount)||Number(amount)<=0){fail('댓수는 1 이상의 정수로 입력되어야 합니다');continue;}
      const turn=text(row.turn).replaceAll(',','');
      if(turn && (!/^\d+$/.test(turn)||Number(turn)<=0)){fail('회전은 양의 정수로 확인해야 합니다');continue;}
      const originalDate=row.date;row.date=date;row.departTime=originalDate.match(/(?:T|\s)([0-2]\d:[0-5]\d)/)?.[1] || '';
      row.count=Number(amount);row.turn=turn?Number(turn):'';row.vehicleNo=normalizePlate(row.vehicleNo);
      row.vin=text(row.vin).toUpperCase(); // Keep short/numeric identifiers exactly; never pad or guess a full VIN.
      if(/[Ee][+-]\d/.test(row.vin)){fail('지수 표기 차대번호는 원문 확인 필요');continue;}
      row.status=({취소:'cancelled',미출고:'notshipped',지원:'support'})[row.driver] || 'normal';
      if(row.status!=='normal')row.driver='';
      const snapshot=canonical(row), fingerprint=await digest(snapshot);
      const candidate={...row,sourceRecordType:'googleSheet',sourceSpreadsheetId:sourceId,sourceSheetId:batch.sheetId,sourceSheetTitle:batch.title,sourceRowNumber:item.rowNumber,sourceFingerprint:fingerprint,sourceSnapshot:snapshot,sourceAmounts:{claim:row.sourceClaim,habul:row.sourceHabul,taxBasis:'exclusive',confirmed:false},taxBasis:'exclusive',sourceFile:`Google Sheets ${sourceId} / ${batch.title}`,tab:batch.title,rowNumber:item.rowNumber,dedupeKey:`gs:${sourceId}:${fingerprint}`};
      if(row.vin.length!==17)warnings.push({sheet:batch.title,row:item.rowNumber,reason:'축약·비표준 차대번호 원문 보존'});
      candidates.push(candidate);
    }
  }
  const counts=new Map();for(const row of candidates)counts.set(identity(row),(counts.get(identity(row))||0)+1);
  const fresh=[],duplicates=[];
  for(const row of candidates){
    if(counts.get(identity(row))>1){held.push({sheet:row.tab,row:row.rowNumber,reason:'선택 자료에 같은 날짜·구간·차대번호의 운송이 반복됩니다'});continue;}
    const decision=classifyIncoming(row,existing);
    if(decision==='duplicate')duplicates.push(row);
    else if(decision==='conflict')held.push({sheet:row.tab,row:row.rowNumber,reason:'기존 운송과 금액·기사·내용 또는 원본 행이 다릅니다. 자동 덮어쓰기 보류'});
    else fresh.push(row);
  }
  return {rows:fresh,duplicates,held,outside,warnings};
}
function classifyIncoming(row,existing){
  if(existing.some(e=>e.dedupeKey===row.dedupeKey || e.sourceSpreadsheetId===row.sourceSpreadsheetId && e.sourceFingerprint===row.sourceFingerprint && e.sourceSnapshot===row.sourceSnapshot))return 'duplicate';
  if(existing.some(e=>identity(e)===identity(row)||e.sourceSpreadsheetId===row.sourceSpreadsheetId&&e.sourceSheetId===row.sourceSheetId&&e.sourceRowNumber===row.sourceRowNumber))return 'conflict';
  return 'new';
}
export async function commitSheetRows(rows,{from,to,title}){
  validatePeriod(from,to);const database=await db.openDb();
  const result=await new Promise((resolve,reject)=>{
    const tx=database.transaction(['dispatch','imports','closings'],'readwrite'), values={};let left=2,failure;
    const out={inserted:0,duplicates:0,conflicts:0}, importId=uid('imp');
    for(const name of ['dispatch','closings'])tx.objectStore(name).getAll().onsuccess=e=>{
      values[name]=e.target.result;if(--left)return;
      for(const row of rows){
        if(!row.sourceFingerprint||row.date<from||row.date>to){failure=Error('미리보기와 저장 대상 날짜가 일치하지 않습니다. 다시 조회하세요.');tx.abort();return;}
        if(values.closings.some(c=>c.status==='closed'&&c.month===row.date.slice(0,7))){failure=Error('마감된 월의 배차는 불러올 수 없습니다. 정산 담당자에게 확인하세요.');tx.abort();return;}
        const decision=classifyIncoming(row,values.dispatch);
        if(decision==='duplicate'){out.duplicates++;continue;}if(decision==='conflict'){out.conflicts++;continue;}
        const saved={...row,id:uid('dsp'),sourceImportId:importId,createdAt:new Date().toISOString(),importedAt:new Date().toISOString()};
        tx.objectStore('dispatch').put(saved);values.dispatch.push(saved);out.inserted++;
      }
      if(out.inserted)tx.objectStore('imports').put({id:importId,fileName:`Google Sheets ${title} ${from}~${to}`,source:'googleSheet',sourceSpreadsheetId:rows[0]?.sourceSpreadsheetId,sourceFiles:[...new Set(rows.map(r=>r.sourceFile))],sheets:[...new Set(rows.map(r=>r.tab))],totalRows:rows.length,inserted:out.inserted,updated:0,dates:[...new Set(rows.map(r=>r.date))],importedAt:new Date().toISOString()});
    };
    tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure || tx.error || Error('불러오기를 취소했습니다.'));
  });
  invalidateDispatch();await reloadAll();return result;
}
