import * as db from './db.js';
import {uid} from './utils.js';
import {reloadAll} from './data.js';
import {analyzeProductHistory,productHistoryUpdates} from './product-history.js';
export async function saveProductsFromHistory(expected){
 const ids=new Map(await Promise.all(expected.models.map(async p=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.key));return [p.key,'prd_hist_'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24)];})));
 const database=await db.openDb(),names=['products','dispatch','transportHistory','drivers','assignments','meta'];let result;
 await new Promise((resolve,reject)=>{const tx=database.transaction(names,'readwrite'),data={};let remaining=names.length,error;tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(error||tx.error);
  for(const name of names)tx.objectStore(name).getAll().onsuccess=e=>{data[name]=e.target.result;if(--remaining)return;try{const analysis=analyzeProductHistory(data,{from:expected.from,to:expected.to});if(JSON.stringify(analysis.models)!==JSON.stringify(expected.models))throw Error('배차 이력이 변경됐습니다. 추출·검토를 다시 실행하세요.');const now=new Date().toISOString();result=productHistoryUpdates(analysis,data.products,key=>ids.get(key),now);for(const row of result.rows)tx.objectStore('products').put(row);const key=uid('productHistory');tx.objectStore('meta').put({key,value:{at:now,policyVersion:analysis.policyVersion,inserted:result.inserted,updated:result.updated,held:result.held.length,reason:'업로드 이력에서 브랜드·차종 및 적재 세그먼트 검토 자료 반영'}});}catch(e){error=e;tx.abort();}};
 });await reloadAll();return result;
}
