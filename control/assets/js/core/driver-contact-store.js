import * as db from './db.js';
import {reloadAll} from './data.js';
import {workspaceProfile,supabaseMode} from './supabase-session.js';
import {matchDriverContacts} from './driver-contact-import.js';
export const canImportContacts=()=>!supabaseMode()||workspaceProfile()?.role==='admin';
export async function saveDriverContacts(sourceRows,selected){
 if(!canImportContacts())throw Error('연락처 일괄 등록은 관리자 계정에서 가능합니다.');
 if(!selected.length||selected.length>3000)throw Error('반영할 연락처를 선택하세요.');
 const database=await db.openDb();let saved=[];
 await new Promise((resolve,reject)=>{
  const tx=database.transaction(['drivers','equipment'],'readwrite'),ds=tx.objectStore('drivers');let drivers,equipment,error;
  tx.oncomplete=resolve;tx.onabort=()=>reject(error||tx.error||Error('연락처 저장 취소'));tx.onerror=()=>reject(error||tx.error);
  const apply=()=>{if(!drivers||!equipment)return;try{
   const latest=matchDriverContacts(sourceRows,drivers,equipment),seen=new Set();
   for(const chosen of selected){const r=latest[chosen.index];if(!r||r.status!=='ready'||r.driverId!==chosen.driverId||r.phone!==chosen.phone||seen.has(r.driverId))throw Error('미리보기 이후 기사·연락처 정보가 변경됐습니다. 다시 대조해 주세요.');seen.add(r.driverId);}
   saved=selected.map(chosen=>{const old=drivers.find(d=>d.id===chosen.driverId);const row={...old,phone:chosen.phone,updatedAt:new Date().toISOString()};ds.put(row);return row;});
  }catch(e){error=e;tx.abort();}};
  ds.getAll().onsuccess=e=>{drivers=e.target.result;apply();};tx.objectStore('equipment').getAll().onsuccess=e=>{equipment=e.target.result;apply();};
 });
 await reloadAll();for(const row of saved)if((await db.get('drivers',row.id))?.phone!==row.phone)throw Error('연락처 저장 내용 대조에 실패했습니다.');return saved;
}
