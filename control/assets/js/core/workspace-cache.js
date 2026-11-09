import * as db from './db.js';
import {cleanRecords,delta} from './cloud-model.js';

// Compare and replace under ONE IndexedDB transaction. A preceding user write
// must be observed before replacing the cache; a following write remains queued
// after this transaction. No asynchronous network work belongs inside this lock.
export async function installWorkspaceCache(records,{expected=null,stores=Object.keys(db.STORES)}={}){
 const database=await db.openDb();
 return new Promise((resolve,reject)=>{
  const names=Object.keys(db.STORES),current={};let remaining=names.length,conflict=false;
  const tx=db.quietTransaction(database,names,'readwrite');
  tx.oncomplete=()=>resolve(true);
  tx.onabort=()=>conflict?resolve(false):reject(tx.error||Error('조회 자료 저장 취소'));
  tx.onerror=()=>reject(tx.error||Error('조회 자료 저장 실패'));
  for(const name of names){
   const req=tx.objectStore(name).getAll();
   req.onsuccess=()=>{
    current[name]=req.result;if(--remaining)return;
    if(expected&&delta(cleanRecords(expected),cleanRecords(current),stores).length){conflict=true;tx.abort();return;}
    const local=current.settings.filter(r=>r.key!=='settings'&&r.key!=='_supabaseOutgoing');
    const google=current.settings.find(r=>r.key==='settings')?.value?.google;
    const next=structuredClone(records);next.settings=[...(next.settings||[]),...local];
    if(google){let row=next.settings.find(r=>r.key==='settings');if(!row){row={key:'settings',value:{}};next.settings.push(row);}row.value={...row.value,google};}
    for(const store of names){const target=tx.objectStore(store);target.clear();for(const row of next[store]||[])target.put(row);}
   };
  }
 });
}
