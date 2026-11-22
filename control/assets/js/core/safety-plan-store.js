import {restoreEssentialChecks} from './essential-checks.js';
import {linkedTrainingCells} from './training-store.js';
import {planDriverName} from './safety-plan-catalog.js';
import {driverQualificationPlan} from './driver-qualification.js';
import {resolvePlanDriver} from './safety-plan-fill.js';
import {PLAN_COMMON_KEY,validatePlanCommon,applyPlanCommon} from './safety-plan-common.js';
import {zipSync,strFromU8,strToU8} from '../../../vendor/fflate.js';
import {completePlanProduct} from './safety-plan-catalog.js';
import {equipmentSafetyValues} from './equipment-safety.js';
import * as db from './db.js';
import {state,reloadAll} from './data.js';
import {uid,todayStr} from './utils.js';
import {workspaceProfile,supabaseMode} from './supabase-session.js';
import {safetyTemplate,SOURCE_KEY} from './vehicle-safety.js';
import {unpack,cleanPlanCells,normalizePlanPlate,planIssues,readPlan,exportPlanWorkbook} from './safety-plan-workbook.js';
import {readPlanReference,fillPlanFromRecords,planVehicleChanges,planRecordChanges,planLinkedValues} from './safety-plan-fill.js';
import {registrationValues} from './vehicle-registration.js';
export async function planCommon(){return (await db.get('meta',PLAN_COMMON_KEY))?.value||null;}
export async function savePlanCommon(cells){if(!canEditPlans())throw Error('공통 담당자 설정은 관리자 권한이 필요합니다.');const value={version:1,cells:validatePlanCommon(cells),updatedAt:new Date().toISOString(),updatedBy:workspaceProfile()?.name||'관리자'};await db.put('meta',{key:PLAN_COMMON_KEY,value});return value;}
export const REFERENCE_KEY='vehicleSafetyPlanReference:v1';
export const canEditPlans=()=>!supabaseMode()||workspaceProfile()?.role==='admin';
export function latestVehiclePlan(documents,vehicleId){return documents.filter(d=>d.kind==='plan'&&d.vehicleId===vehicleId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0]||null;}
export async function planSource(){const source=await db.get('meta',SOURCE_KEY);for(const f of source?.value?.files||[]){if(!/작업계획서/.test(f.name))continue;return Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));}throw Error('표준양식·원본 관리에서 SDS 안전작업계획서 원본을 먼저 등록하세요.');}
export async function planDownload(record,{history=false}={}){if(!record?.plan?.workbookFields)throw Error('기존 작성 기록은 계획서 화면에서 내용을 확인하고 저장한 뒤 다운로드하세요.');const output=history?record:{...record,plan:{...record.plan,workbookFields:completePlanProduct(applyPlanCommon(restoreEssentialChecks(record.plan.workbookFields,record.plan),await planCommon()),state.products)}};if(!history){const eq=state.equipment.find(e=>e.id===record.vehicleId),linked=eq?resolvePlanDriver(eq,state.drivers,record.plan.selectedDriverId).driver:null,driver=linked&&planDriverName(output.plan.workbookFields.C20)===planDriverName(linked.name)?linked:null;Object.assign(output.plan.workbookFields,driverQualificationPlan(driver,{today:todayStr(),period:output.plan.workbookFields.H10}).cells);output.plan.workbookFields=await linkedTrainingCells(output.plan.workbookFields,driver?.id||'');}return exportPlanWorkbook(await planSource(),output);}
export async function planReference(){return (await db.get('meta',REFERENCE_KEY))?.value?.cells||readPlanReference(await planSource());}
export async function installPlanReference(file){
 if(!canEditPlans())throw Error('참고 양식 등록은 관리자 권한이 필요합니다.');if(!file||file.size>2000000)throw Error('작성예시가 포함된 2MB 이하 엑셀 양식을 선택하세요.');
 const bytes=await compactPlanSource(new Uint8Array(await file.arrayBuffer())),cells=readPlanReference(bytes),old=await db.get('meta',SOURCE_KEY);if(!old?.value?.files?.length)throw Error('기존 표준양식을 먼저 등록하세요.');
 let binary='';for(const v of bytes)binary+=String.fromCharCode(v);const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const archivedSource=await compactStoredPlanSource(old.value);
 const repairedArchives=[];for(const row of await db.getAll('meta'))if(row.key.startsWith('vehicleSafetySourceArchive:')&&JSON.stringify(row.value).length>650000){const value=await compactStoredPlanSource(row.value);if(new TextEncoder().encode(JSON.stringify(value)).length>650000)throw Error('이전 양식의 그림 용량을 확인하세요.');repairedArchives.push({...row,value});}
 const files=[...archivedSource.files.filter(f=>!/작업계획서/.test(f.name)),{name:file.name,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',sha256:hash,base64:btoa(binary)}];
 if(JSON.stringify({files}).length>650000)throw Error('양식 이미지 용량이 큽니다. 그림 용량을 줄인 뒤 다시 등록하세요.');
 const database=await db.openDb();await new Promise((resolve,reject)=>{const tx=database.transaction('meta','readwrite'),s=tx.objectStore('meta');for(const row of repairedArchives)s.put(row);s.add({key:'vehicleSafetySourceArchive:'+uid('archive'),value:archivedSource});s.put({key:SOURCE_KEY,value:{files}});s.put({key:REFERENCE_KEY,value:{cells,name:file.name,sha256:hash,updatedAt:new Date().toISOString()}});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('참고 양식 저장 실패'));tx.onerror=()=>reject(tx.error);});return cells;
}
export async function preparePlanFill(record,equipment,options={}){return fillPlanFromRecords(await planEditorCells(record,equipment),equipment,state.drivers,await planReference(),{selectedDriverId:record?.plan?.selectedDriverId||'',...options});}
const editKey=id=>'_safetyPlanEditing:'+id;
export async function recoverPlanEdit(id){return (await db.get('settings',editKey(id)))?.value||null;}
export async function rememberPlanEdit(id,value){const database=await db.openDb();await new Promise((resolve,reject)=>{const tx=db.quietTransaction(database,'settings','readwrite');if(value)tx.objectStore('settings').put({key:editKey(id),value});else tx.objectStore('settings').delete(editKey(id));tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('임시 입력 보관 실패'));});}
export async function planEditorCells(record,equipment){
 if(record?.plan?.workbookFields)return cleanPlanCells(completePlanProduct(applyPlanCommon(restoreEssentialChecks(record.plan.workbookFields,record.plan),await planCommon()),state.products));
 const original=readPlan(await planSource(),'표준양식'),cells=original.cells,p=record?.plan||{};
 // Never treat examples or preset scores as actual checks.
 for(let r=45;r<=64;r++){cells['E'+r]='';cells['F'+r]='';}for(let r=68;r<=75;r++)cells['J'+r]='';
 Object.assign(cells,{H36:equipment.plateNo,F5:todayStr(),I5:'초안',C9:p.workName||'테슬라 차량 상·하차 및 운송',H9:record?.company||'M&M통운',C10:p.workplace||'',H10:p.period||'최초 양식 보고 · 별도 기간 없음',C11:p.method||'',C12:p.signal||'',C20:equipment.driverName||'',C31:p.cargoModel||'',C33:p.unitWeightKg||'',F33:p.units||'',C36:equipment.structure||'',C38:p.maxLoadKg||equipment.maxLoadKg||'',H38:p.maxUnits||equipment.capacity||'',B26:p.workSequence||cells.B26,B78:p.stopCriteria||cells.B78,B103:'제출처: 테슬라·삼성SDS / 최초 양식 보고 / 현장 확인 필요'});
 if(record){cells.C17=p.supervisor||'';cells.C23=p.training||'';cells.D85=p.safetyLead||'';cells.B89=p.emergency||cells.B89;const t=p.templateSnapshot||await safetyTemplate();for(const [i,h] of (t.hazards||[]).entries()){const a=p.risks?.[h.id]||{},r=45+i;Object.assign(cells,{['E'+r]:a.likelihood||'',['F'+r]:a.severity||'',['H'+r]:a.control||cells['H'+r],['K'+r]:a.responsible||cells['K'+r]});}for(const [i,e] of (t.essentials||[]).entries())cells['J'+(68+i)]=p.essentials?.[e.id]||'';}
 return cleanPlanCells(completePlanProduct(applyPlanCommon(cells,await planCommon()),state.products));
}
export async function savePlanDrafts(inputs,actorName){
 if(!canEditPlans())throw Error('계획서 수정·일괄 등록은 관리자 계정에서 가능합니다.');
 if(!String(actorName||'').trim())throw Error('등록·수정자 이름을 입력하세요.');
 if(!inputs.length||inputs.length>200)throw Error('저장할 계획서를 1~200개 선택하세요.');
 const template=await safetyTemplate();if(!template)throw Error('안전 표준양식을 먼저 등록하세요.');
 const common=await planCommon();if(!common?.cells)throw Error('공통 담당자 설정에서 관리자·작업 담당자 정보를 먼저 저장하세요.');
 const seen=new Set(),stamp=new Date().toISOString(),rows=await Promise.all(inputs.map(async input=>{
  if(seen.has(input.vehicleId))throw Error('한 차량은 한 번에 한 계획서만 저장하세요.');seen.add(input.vehicleId);
  const eq=state.equipment.find(e=>e.id===input.vehicleId);if(!eq)throw Error('등록 차량을 확인하세요.');const prepared=completePlanProduct(applyPlanCommon(input.cells,common),state.products),resolved=resolvePlanDriver(eq,state.drivers,input.selectedDriverId||''),driver=resolved.driver&&planDriverName(prepared.C20)===planDriverName(resolved.driver.name)?resolved.driver:null,qualification=driverQualificationPlan(driver,{today:todayStr(),period:prepared.H10});const cells=cleanPlanCells(await linkedTrainingCells({...prepared,...qualification.cells},driver?.id||''));
  if(normalizePlanPlate(cells.H36)!==normalizePlanPlate(eq.plateNo))throw Error('계획서와 등록 차량번호가 다릅니다.');const issues=planIssues(cells);if(issues.length)throw Error(issues.join(' '));
  const id=uid('vsp'),snapshot={hazards:template.hazards,essentials:template.essentials,workSequence:template.workSequence,stopCriteria:template.stopCriteria};
  return {id,rootId:id,recordType:'vehicleSafety',kind:'plan',status:'draft',vehicleId:eq.id,plateNo:eq.plateNo,date:todayStr(),createdAt:stamp,inspector:String(actorName).trim(),company:String(cells.H9),templateId:template.id,templateVersion:template.version,vehicleSnapshot:{equipmentSafety:equipmentSafetyValues(eq),...registrationValues(eq),structure:eq.structure||'',capacity:eq.capacity||0,driverId:eq.driverId||'',driverName:eq.driverName||'',insuranceExpiry:eq.insuranceExpiry||'',updatedAt:eq.updatedAt||''},photos:[],previousId:input.expectedId||'',note:'웹 계획서 초안 · 서명·현장 확인 전',plan:{driverQualificationSnapshot:{driverId:qualification.driverId,...qualification.qualifications,sourceUpdatedAt:resolved.driver?.updatedAt||''},commonUpdatedAt:common.updatedAt,selectedDriverId:String(input.selectedDriverId||''),fillWarnings:input.fillWarnings||[],workbookFields:cells,sourceNotes:String(input.sourceNotes||'').slice(0,20000),sourceFile:String(input.name||'웹 작성').slice(0,400),workName:cells.C9,workplace:cells.C10,period:cells.H10,method:[cells.C11,cells.H11].filter(Boolean).join('\n'),supervisor:cells.C17,safetyLead:cells.D85,emergency:cells.B89,workSequence:cells.B26,stopCriteria:cells.B78,cargoModel:cells.C31,unitWeightKg:cells.C33,units:cells.F33,maxLoadKg:cells.C38,maxUnits:cells.H38,signal:cells.C12,templateSnapshot:snapshot,risks:Object.fromEntries(template.hazards.map((h,i)=>[h.id,{likelihood:cells['E'+(45+i)],severity:cells['F'+(45+i)],control:cells['H'+(45+i)],responsible:cells['K'+(45+i)]}])),essentials:Object.fromEntries(template.essentials.map((e,i)=>[e.id,String(cells['J'+(68+i)]).replace('○','O')]))}};
 }));
 const database=await db.openDb();await new Promise((resolve,reject)=>{
  const tx=database.transaction(['safety','equipment'],'readwrite'),s=tx.objectStore('safety'),request=s.getAll(),eqRequest=tx.objectStore('equipment').getAll();let all=null,equipment=null,error;
  tx.oncomplete=resolve;tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('저장 실패'));
  function apply(){if(!all||!equipment)return;try{for(let i=0;i<rows.length;i++){const row=rows[i],input=inputs[i],eq=equipment.find(e=>e.id===row.vehicleId),previous=latestVehiclePlan(all,row.vehicleId);if(!eq||normalizePlanPlate(eq.plateNo)!==normalizePlanPlate(row.plateNo))throw Error('차량 정보가 변경되었습니다. 다시 불러오세요.');if((previous?.id||'')!==(input.expectedId||''))throw Error(row.plateNo+' 계획서가 변경되었습니다. 미리보기를 다시 확인하세요.');if((eq.updatedAt||'')!==(row.vehicleSnapshot.updatedAt||''))throw Error('저장 중 차량정보가 변경되었습니다. 입력 내용은 임시 보관되어 있습니다. 차량정보를 다시 확인하세요.');const changed=new Set(previous?planRecordChanges(previous,eq,state.drivers).map(c=>c.cell):[]);row.plan.pendingVehicleReview=planVehicleChanges(row.plan.workbookFields,eq,state.drivers,row.plan.selectedDriverId).filter(c=>changed.has(c.cell)).map(c=>c.cell);row.plan.linkedSource=planLinkedValues(eq,state.drivers,row.plan.selectedDriverId);if(previous){row.rootId=previous.rootId||previous.id;row.photos=[...(previous.photos||[])];row.supersedes=previous.id;}s.add(row);}}catch(e){error=e;tx.abort();}}
  request.onsuccess=()=>{all=request.result;apply();};eqRequest.onsuccess=()=>{equipment=eqRequest.result;apply();};
 });await reloadAll();for(const row of rows){const actual=await db.get('safety',row.id);if(!actual||JSON.stringify(cleanPlanCells(actual.plan?.workbookFields))!==JSON.stringify(row.plan.workbookFields))throw Error('저장한 계획서의 내용 대조에 실패했습니다. 창을 닫지 말고 저장 상태를 확인하세요.');}return rows;
}

// Optimize embedded photographs before they enter the shared metadata record.
// Preserve worksheet XML, image dimensions and all drawing anchors.
export async function compactPlanSource(bytes){
 if(bytes.length<400000)return bytes;
 const entries=unpack(bytes);let changed=false;
 for(const path of Object.keys(entries).filter(p=>/^xl\/media\/.*\.(png|jpe?g)$/i.test(p))){
  const raw=entries[path];if(raw.length<150000)continue;
  const bitmap=await createImageBitmap(new Blob([raw],{type:/png$/i.test(path)?'image/png':'image/jpeg'}));
  try{
   if(bitmap.width*bitmap.height>40000000)throw Error('양식 그림 해상도가 너무 큽니다.');
   const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob)throw Error('양식 그림 용량 조정에 실패했습니다.');
   const compressed=new Uint8Array(await blob.arrayBuffer());if(compressed.length>=raw.length)continue;
   const name=path.split('/').pop(),newName=name+'.compact.jpg',newPath='xl/media/'+newName;
   if(entries[newPath])throw Error('그림 파일 이름이 중복됩니다.');
   for(const relPath of Object.keys(entries).filter(p=>p.endsWith('.rels'))){
    const doc=new DOMParser().parseFromString(strFromU8(entries[relPath]),'application/xml');let edited=false;
    for(const rel of [...doc.documentElement.children]){const target=rel.getAttribute('Target')||'';if(target.endsWith('/'+name)){rel.setAttribute('Target',target.slice(0,-name.length)+newName);edited=true;}}
    if(edited)entries[relPath]=strToU8(new XMLSerializer().serializeToString(doc));
   }
   const typeDoc=new DOMParser().parseFromString(strFromU8(entries['[Content_Types].xml']),'application/xml'),ns=typeDoc.documentElement.namespaceURI;
   for(const n of [...typeDoc.documentElement.children])if(n.getAttribute('PartName')==='/'+path)n.remove();
   if(![...typeDoc.documentElement.children].some(n=>n.localName==='Default'&&n.getAttribute('Extension')==='jpg')){const node=typeDoc.createElementNS(ns,'Default');node.setAttribute('Extension','jpg');node.setAttribute('ContentType','image/jpeg');typeDoc.documentElement.appendChild(node);}
   entries['[Content_Types].xml']=strToU8(new XMLSerializer().serializeToString(typeDoc));entries[newPath]=compressed;delete entries[path];changed=true;
  }finally{bitmap.close();}
 }
 return changed?zipSync(entries,{level:6}):bytes;
}
async function compactStoredPlanSource(source){
 const files=[];for(const f of source.files||[]){const original=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)),bytes=await compactPlanSource(original);if(bytes===original){files.push(f);continue;}let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');files.push({...f,base64:btoa(binary),sha256});}return {...source,files};
}
