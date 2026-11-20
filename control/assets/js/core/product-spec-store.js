import * as db from './db.js';
import {reloadStores} from './data.js';
import {workspaceProfile,supabaseMode} from './supabase-session.js';
import {planProductSpecs} from './product-spec-model.js';
export async function applyProductSpecs(official,checkedAt){
 if(supabaseMode()&&workspaceProfile()?.role!=='admin')throw Error('대표 모델·공식 제원 반영은 관리자만 가능합니다.');
 const database=await db.openDb();let result;
 await new Promise((resolve,reject)=>{const tx=database.transaction('products','readwrite');let failure;tx.objectStore('products').getAll().onsuccess=event=>{try{result=planProductSpecs(event.target.result,official,checkedAt);for(const row of result.rows)tx.objectStore('products').put(row);}catch(error){failure=error;tx.abort();}};tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||Error('제원 반영 취소'));tx.onerror=()=>reject(failure||tx.error);});await reloadStores(['products']);return result;
}
