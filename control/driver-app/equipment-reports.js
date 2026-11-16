import * as api from './api.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const REPORT_STATUS={submitted:'접수 완료',acknowledged:'담당자 확인',in_progress:'정비 진행',resolved:'조치 완료'};
export const SEVERITY={normal:'일반 이상',urgent:'빠른 확인 필요',stop:'운행·작업 중지 필요'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
async function draftDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('mmtc-driver-equipment-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
const draftQueues=new Map();
export function draftOperation(key,value,remove=false){
 const snapshot=value===undefined?undefined:structuredClone(value);
 const task=(draftQueues.get(key)||Promise.resolve()).catch(()=>{}).then(()=>runDraftOperation(key,snapshot,remove));draftQueues.set(key,task);
 task.then(()=>{if(draftQueues.get(key)===task)draftQueues.delete(key);},()=>{if(draftQueues.get(key)===task)draftQueues.delete(key);});return task;
}
async function runDraftOperation(key,value,remove=false){const database=await draftDb();try{return await new Promise((resolve,reject)=>{const tx=database.transaction('drafts',value===undefined&&!remove?'readonly':'readwrite'),store=tx.objectStore('drafts');const request=remove?store.delete(key):value===undefined?store.get(key):store.put(value,key);let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error('임시 저장 실패'));tx.onerror=()=>reject(tx.error);});}finally{database.close();}}
export function reportPayload(input){
 const date=String(input.date||''),description=String(input.description||'').trim(),location=String(input.location||'').trim();
 const timestamp=Date.parse(date+'T00:00:00Z'),now=Date.parse(today()+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==date||timestamp>now||now-timestamp>7*86400000)throw Error('발생일은 오늘부터 최근 7일 이내로 입력하세요.');
 if(!Object.hasOwn(SEVERITY,input.severity)||!description||description.length>2000||location.length>200)throw Error('긴급도와 고장 증상(2,000자 이내)을 확인하세요.');
 return {date,severity:input.severity,description,location};
}
export async function compressReportPhoto(file){
 if(!file?.type.startsWith('image/')||file.size>15*1024*1024)throw Error('사진은 15MB 이하로 선택하세요. HEIC가 열리지 않으면 JPEG 사진을 사용하세요.');
 const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas'),ratio=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);for(const quality of [.8,.65,.5,.35]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=262144)return blob;}throw Error('사진 용량을 줄이지 못했습니다. 더 작은 사진을 선택하세요.');}finally{bitmap.close();}
}
export async function renderEquipmentReports(content,{data,demo=false,onDirty=()=>{}}){
 const owner=demo?'demo':api.sessionOwner();if(!owner)throw Error('다시 로그인하세요.');
 let draft=demo?null:await draftOperation(owner),busy=false;
 if(!content.isConnected)return;
 draft||={requestId:crypto.randomUUID(),vehicle:data.vehicles[0]?.id||'',payload:{date:today(),severity:'normal',description:'',location:''},photos:[],locked:false};
 const persist=async()=>{if(!demo)await draftOperation(owner,draft);};
 const message=text=>{const el=content.querySelector('#report-message');if(el)el.textContent=text;};
 function draw(){content.innerHTML=`<section><h1>고장·이상 신고</h1><p class="notice">운행·작업에 위험이 있으면 안전한 곳에서 멈추고 담당자에게 직접 연락하세요. 앱 접수는 긴급 연락을 대신하지 않습니다.</p><p>${demo?'체험 · 입력을 서버에 보내지 않습니다.':draft.locked?'전송 결과 확인 중인 입력입니다. 같은 접수번호로 다시 제출할 수 있습니다.':'입력과 사진은 이 휴대폰에 임시 저장됩니다. 회사 접수 완료 안내를 확인하세요.'}</p><form id="report-form"><fieldset ${draft.locked?'disabled':''}><label>내 차량<select name="vehicle" aria-label="신고 차량">${data.vehicles.map(v=>`<option value="${esc(v.id)}" ${v.id===draft.vehicle?'selected':''}>${esc(v.plateNo)}</option>`).join('')}</select></label><label>발생일<input name="date" type="date" value="${esc(draft.payload.date)}" max="${today()}" required></label><label>긴급도<select name="severity" aria-label="고장 긴급도">${Object.entries(SEVERITY).map(([k,v])=>`<option value="${k}" ${k===draft.payload.severity?'selected':''}>${v}</option>`).join('')}</select></label><label>현재 위치<input name="location" maxlength="200" value="${esc(draft.payload.location)}" placeholder="예: 차고지 / ○○휴게소"></label><label>고장 증상<textarea name="description" required maxlength="2000" placeholder="어디에 어떤 이상이 있는지 적어주세요.">${esc(draft.payload.description)}</textarea></label><label>현장 사진 (최대 2장)<input id="report-photos" type="file" accept="image/*" multiple></label><p id="photo-count">첨부 ${draft.photos.length}장</p><button id="report-remove-photos" type="button" class="secondary">사진 첨부 취소</button></fieldset><button id="report-submit" type="submit" ${!data.vehicles.length?'disabled':''}>${demo?'입력 검토 (전송 없음)':draft.locked?'같은 접수 다시 제출':'고장 신고 제출'}</button></form><p id="report-message" role="alert"></p></section><section><h2>내 신고 처리 현황</h2><button id="report-refresh" class="secondary">처리 현황 새로고침</button><div id="report-history">조회 중…</div><button id="report-more" class="secondary" hidden>이전 접수 더 보기</button></section>`;
  const form=content.querySelector('#report-form');
  form.oninput=()=>{if(draft.locked)return;const values=Object.fromEntries(new FormData(form));draft.vehicle=values.vehicle;draft.payload={date:values.date,severity:values.severity,location:values.location,description:values.description};onDirty(true);persist().catch(()=>message('휴대폰 임시 저장에 실패했습니다. 입력을 복사해 보관하고 창을 닫지 마세요.'));};
  content.querySelector('#report-photos').onchange=async event=>{const files=[...event.target.files];if(files.length>2){event.target.value='';return message('사진은 최대 2장입니다.');}busy=true;content.querySelector('#report-submit').disabled=true;try{const photos=await Promise.all(files.map(compressReportPhoto));draft.photos=photos;await persist();onDirty(true);if(!content.isConnected)return;content.querySelector('#photo-count').textContent='첨부 '+photos.length+'장';message('사진 준비 완료');}catch(error){message(error.message);}finally{busy=false;if(content.isConnected)content.querySelector('#report-submit').disabled=!data.vehicles.length;}};
  content.querySelector('#report-remove-photos').onclick=async()=>{if(busy||draft.locked)return;draft.photos=[];content.querySelector('#report-photos').value='';content.querySelector('#photo-count').textContent='첨부 0장';try{await persist();}catch{message('첨부 취소 저장에 실패했습니다.');}};
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const button=content.querySelector('#report-submit');button.disabled=true;
   try{if(!draft.locked){draft.payload=reportPayload(draft.payload);if(!data.vehicles.some(v=>v.id===draft.vehicle))throw Error('본인 차량을 선택하세요.');if(demo){message('입력 확인 완료 · 체험이므로 접수하지 않았습니다.');return;}draft.locked=true;try{await persist();}catch(error){draft.locked=false;throw error;}form.querySelector('fieldset').disabled=true;}
    const opened=await api.rpc('tms_equipment_report_open',{p_id:draft.requestId,p_vehicle:draft.vehicle});const paths=[];
    for(let i=0;i<draft.photos.length;i++){const path=opened.photoPrefix+(i+1)+'.jpg';if(opened.status==='draft')await api.uploadEquipmentPhoto(path,draft.photos[i]);paths.push(path);}
    const receipt=await api.rpc('tms_equipment_report_submit',{p_id:draft.requestId,p_payload:draft.payload,p_photos:paths});await draftOperation(owner,undefined,true);onDirty(false);message('회사 접수 완료 · '+receipt.id);button.hidden=true;await history();
   }catch(error){message(error.message+' 입력과 사진은 보존되어 있습니다.');button.textContent=draft.locked?'같은 접수 다시 제출':'고장 신고 제출';}finally{busy=false;button.disabled=false;}
  };
  let before=null,beforeId=null,historyBusy=false;async function history(more=false){if(historyBusy)return;historyBusy=true;const target=content.querySelector('#report-history');if(!more){before=null;beforeId=null;target.textContent='조회 중…';}try{const result=demo?{reports:[]}:await api.rpc('tms_equipment_report_list',{p_before:before,p_before_id:beforeId});if(!target.isConnected)return;const html=result.reports.map(r=>`<article><span class="tag">${esc(REPORT_STATUS[r.status]||r.status)}</span><h3>${esc(data.vehicles.find(v=>v.id===r.vehicle_id)?.plateNo||'기존 연결 차량')} · ${esc(r.payload.date)}</h3><p>${esc(SEVERITY[r.payload.severity])}</p><p class="report-text">${esc(r.payload.description)}</p>${r.events.map(e=>`<p class="muted report-text">${esc(REPORT_STATUS[e.status]||e.status)} · ${esc(e.note)}</p>`).join('')}</article>`).join('');if(more)target.insertAdjacentHTML('beforeend',html);else target.innerHTML=html||'<p>접수된 신고가 없습니다.</p>';before=result.reports.at(-1)?.created_at||null;beforeId=result.reports.at(-1)?.id||null;content.querySelector('#report-more').hidden=result.reports.length<30;}catch(error){if(!more)target.textContent='처리 현황 조회 실패: '+error.message;else message(error.message);}finally{historyBusy=false;}}
  content.querySelector('#report-refresh').onclick=()=>history();content.querySelector('#report-more').onclick=()=>history(true);history();
 }
 draw();if(draft.payload.description||draft.photos.length)onDirty(true);
}
