import {transportRouteKey,transportKey} from './dispatch-identity.js';
import {norm} from './utils.js';

export const coreFields={customer:'거래처',model:'차종',vin:'차대번호',origin:'출발지',destination:'도착지',date:'운송일',arrivalDate:'도착일자'};
export const vinKey=r=>String(r.vin||'').replace(/\s/g,'').toUpperCase();
// A missing optional model/arrival date is unknown, not evidence of another transport.
export function sameSheetTransport(a,b){
 if(!transportRouteKey(a)||transportRouteKey(a)!==transportRouteKey(b))return false;
 return ['customer','model','arrivalDate'].every(k=>!norm(a[k])||!norm(b[k])||norm(a[k])===norm(b[k]));
}
export function coreDifferences(a,b){return Object.entries(coreFields).filter(([k])=>norm(a[k])&&norm(b[k])&&norm(a[k])!==norm(b[k])).map(([field,label])=>({field,label,before:String(a[field]),after:String(b[field])}));}
export function sheetMatchIndex(rows=[]){
 const byVin=new Map();
 const add=row=>{const key=vinKey(row),list=byVin.get(key)||[],i=list.findIndex(x=>x.id&&x.id===row.id);if(i<0)list.push(row);else list[i]=row;byVin.set(key,list);};
 rows.forEach(add);return {byVin,add,matches:row=>(byVin.get(vinKey(row))||[]).filter(old=>sameSheetTransport(old,row))};
}
export function classifySheetTransport(row,index,refresh=()=>null){
 const matches=index.matches(row);
 if(!matches.length)return {kind:'new',matches};
 // Quantity and actual transport status affect totals, so don't silently ignore contradictions.
 if(matches.some(old=>Number(old.count??1)!==Number(row.count??1)||(old.status||'normal')!==(row.status||'normal')))return {kind:'conflict',matches,reason:'등록된 운송과 대수 또는 취소·미출고·지원 상태가 다릅니다. 실제 운송 여부 확인 필요'};
 if(['customer','model','arrivalDate'].some(k=>new Set(matches.map(r=>norm(r[k])).filter(Boolean)).size>1))return {kind:'conflict',matches,reason:'핵심 정보가 비어 있어 기존 운송 여러 건과 일치합니다. 차종·도착일자를 확인하세요.'};
 if(matches.length===1&&refresh(matches[0],row))return {kind:'update',matches};
 return {kind:'duplicate',matches};
}
