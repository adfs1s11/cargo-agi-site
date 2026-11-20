import * as db from './db.js';
import {reloadStores} from './data.js';
import {supabaseMode,workspaceProfile} from './supabase-session.js';
import {ensureWorkspaceStores} from './supabase-cloud.js';
import {reviewMonthlyRows,cleanReferenceRow,monthRange} from './monthly-history-model.js';
import {uid,normalizeVin} from './utils.js';
import {transportRouteKey} from './dispatch-identity.js';
export async function commitMonthlyHistory(rows,{month,fileName,sha256,approvedRows=null},progress=()=>{}){
 monthRange(month);if(!/^[a-f0-9]{64}$/.test(sha256)||!fileName||fileName.length>250||rows.length>100000)throw Error('파일과 대상 월을 다시 확인하세요.');
 if(supabaseMode()){if(workspaceProfile()?.role!=='admin')throw Error('관리자만 참고 운송이력을 등록할 수 있습니다.');await ensureWorkspaceStores(['dispatch','transportHistory','historyImports','drivers'],progress);}
 // Stable IDs also prevent duplicate creation by separate PCs reviewing one source.
 const proposed=approvedRows||reviewMonthlyRows(rows,{month,dispatch:await db.getAll('dispatch'),history:await db.getAll('transportHistory'),drivers:await db.getAll('drivers')}).accepted;
 const identifiers=new Map(await Promise.all(proposed.map(async row=>{const key=transportRouteKey(row);if(!key)throw Error('신규 후보 식별정보를 확인하세요.');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([row.date,normalizeVin(row.vin)]))))].map(b=>b.toString(16).padStart(2,'0')).join('');return[key,'hist_month_'+hash];})));
 const database=await db.openDb();let output;
 await new Promise((resolve,reject)=>{const tx=database.transaction(['dispatch','transportHistory','historyImports','drivers'],'readwrite'),values={};let left=3,failure;for(const s of ['dispatch','transportHistory','drivers'])tx.objectStore(s).getAll().onsuccess=e=>{values[s]=e.target.result;if(--left)return;try{const review=reviewMonthlyRows(rows,{month,dispatch:values.dispatch,history:values.transportHistory,drivers:values.drivers});if(review.accepted.some(r=>!identifiers.has(transportRouteKey(r))))throw Error('검토 후 원장이 변경되었습니다. 월 자료를 다시 조회하고 대조하세요.');const batchId=uid('history'),importedAt=new Date().toISOString();for(const r of review.accepted)tx.objectStore('transportHistory').put({...cleanReferenceRow(r),id:identifiers.get(transportRouteKey(r)),batchId,status:r.status||'normal',sourceFile:fileName,sourceSheet:r.sheet||r.sourceSheet||'',sourceRow:r.rowNumber||r.sourceRow||0,sourceSha256:sha256,importedAt});if(review.accepted.length)tx.objectStore('historyImports').put({id:batchId,fileName,sha256,month,importedAt,count:review.accepted.length,dateFrom:review.range.from,dateTo:review.range.to,sourceRows:review.total,existingVerified:review.existing.length,differentExisting:review.differentExisting,heldCount:review.held.length,fileDuplicateCount:review.fileDuplicates.length,linkReviewCount:review.links.length,importPolicy:'missing-reference-only-v1'});output={review,batchId:review.accepted.length?batchId:''};}catch(e){failure=e;tx.abort();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure||tx.error||Error('저장이 취소되었습니다.'));});
 await reloadStores(['transportHistory','historyImports']);return output;
}
