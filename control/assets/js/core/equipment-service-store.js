import * as db from './db.js';
import {workspaceProfile,supabaseMode} from './supabase-session.js';
import {makeServiceRecord} from './equipment-management.js';
import {todayStr,uid} from './utils.js';
const PREFIX='equipmentService:';
export function canManageEquipment(){return !supabaseMode()||workspaceProfile()?.role==='admin';}
export async function equipmentServiceRecords(equipmentId){
 if(!canManageEquipment())return null;
 return (await db.getAll('meta')).filter(r=>r.key.startsWith(PREFIX)&&r.value?.equipmentId===equipmentId).map(r=>r.value).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
}
export async function addEquipmentService(equipmentId,input){
 if(!canManageEquipment())throw Error('정비 이력 등록은 관리자 권한이 필요합니다.');
 const equipment=await db.get('equipment',equipmentId),actor=workspaceProfile()||{id:'local',name:'로컬 관리자'};
 const record=makeServiceRecord(input,{equipment,today:todayStr(),actor,id:uid('service'),createdAt:new Date().toISOString()});
 const database=await db.openDb();await new Promise((resolve,reject)=>{const tx=database.transaction('meta','readwrite');tx.objectStore('meta').add({key:PREFIX+record.id,value:record});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('정비 이력 저장 실패'));tx.onerror=()=>reject(tx.error);});
 return record;
}
