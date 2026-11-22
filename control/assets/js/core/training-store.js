import {trainingDefault}from './training-default.js';
import * as db from './db.js';
import {workspaceProfile,supabaseMode} from './supabase-session.js';
import {todayStr} from './utils.js';
import {normalizeTraining,TRAINING_PREFIX,latestTrainings,applyTrainingToPlan} from './training-model.js';
export const canManageTraining=()=>!supabaseMode()||workspaceProfile()?.role==='admin';
export async function trainingRecords(){if(!canManageTraining())throw Error('교육 자료는 관리자 계정에서 관리합니다.');return (await db.getAll('meta')).filter(x=>x.key.startsWith(TRAINING_PREFIX)).map(x=>x.value);}
export async function saveTraining(input,drivers,{id=crypto.randomUUID(),expectedId=''}={}){
 if(!canManageTraining())throw Error('교육 등록은 관리자 계정에서 가능합니다.');const clean=normalizeTraining(input,{today:todayStr(),driverIds:drivers.map(d=>d.id)}),all=await trainingRecords(),previous=expectedId?all.find(r=>r.id===expectedId):null;
 if(expectedId&&!previous)throw Error('이전 교육 기록을 다시 조회하세요.');
 const row={...clean,id,rootId:previous?.rootId||id,previousId:expectedId,version:(previous?.version||0)+1,createdAt:new Date().toISOString(),createdBy:workspaceProfile()?.name||clean.verifiedBy||'관리자'};
 const database=await db.openDb();await new Promise((resolve,reject)=>{let failure;const tx=database.transaction('meta','readwrite'),s=tx.objectStore('meta');s.getAll().onsuccess=e=>{try{const records=e.target.result.filter(x=>x.key.startsWith(TRAINING_PREFIX)).map(x=>x.value),old=latestTrainings(records).find(r=>r.rootId===row.rootId||r.id===row.rootId);if((old?.id||'')!==expectedId)throw Error('다른 화면에서 교육 기록이 변경됐습니다. 다시 조회하세요.');s.add({key:TRAINING_PREFIX+id,value:row});}catch(err){failure=err;tx.abort();}};tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error);tx.onerror=()=>reject(failure||tx.error);});return row;
}
export async function linkedTrainingCells(cells,driverId){const id=cells.TRAINING_ID||(await trainingDefault()).trainingId;if(!id)return cells;const record=(await trainingRecords()).find(r=>r.id===id);if(!record)throw Error('연결한 교육 기록을 확인하세요.');return applyTrainingToPlan(cells,record,driverId);}
