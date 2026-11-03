import * as db from '../../core/db.js';
import {state} from '../../core/data.js';
import {esc,openModal,toast} from '../../core/utils.js';
import {accountName} from '../../core/auth.js';
import {sharedOnlineMode,sharedAuthenticated} from '../../core/shared-auth.js';
import {flushShared} from '../../core/cloud.js';
import {OCR_PREFIX,OCR_FIELDS,normalizeOcr,ocrKey,mergeOcr} from '../../core/ocr-vehicle.js';

export async function openOcrVehicles(kind='출고 봉투'){
 const rows=(await db.getAll('meta')).filter(r=>String(r.key).startsWith(OCR_PREFIX)&&r.documentType===kind);
 openModal({title:'OCR 확정 차량정보',sub:kind==='출고 봉투'?'상품차량 개별 VIN · 출고 및 탁송 정보':'운송차량 VIN · 등록증 제원',size:'wide',
 body:`<p>OCR 화면에서 <b>확인한 항목 내려받기</b> 후 아래에서 파일을 가져오세요. 사진은 저장하지 않습니다. 저장 후 상단의 <b>공용 원장 저장 완료</b>를 확인하세요.</p><p><input type="file" data-file accept=".json,application/json" aria-label="OCR 확정 JSON 가져오기"></p><input class="input" data-search placeholder="VIN · 임판번호 · 차량번호 · 차종 · 탁송지 검색" aria-label="OCR 차량정보 검색"><p data-count></p><div class="table-scroll"><table class="data"><thead><tr><th>VIN / 차량번호</th><th>차종 / 탁송지</th><th>관련 배차</th><th>등록·수정</th><th></th></tr></thead><tbody data-rows></tbody></table></div><p class="small muted">같은 VIN·문서 종류는 하나의 차량정보로 관리합니다. 기존 모델 시세, 배차 건수, 적재 대수, 기사 배정은 변경하지 않습니다. 등록증 제원은 운송차량 관리 시 참고할 수 있습니다.</p>`,
 onMount(el,close){
  function render(){const q=el.querySelector('[data-search]').value.toLowerCase();const filtered=rows.filter(r=>Object.values(r.fields).join(' ').toLowerCase().includes(q));el.querySelector('[data-count]').textContent=`${filtered.length}대 / 전체 ${rows.length}대`;
   el.querySelector('[data-rows]').innerHTML=filtered.map(r=>{const f=r.fields;const count=(state.dispatch||[]).filter(d=>String(d.vin||'').replace(/\s/g,'').toUpperCase()===f.VIN).length;return `<tr><td>${esc(f.VIN)}<br>${esc(f['임판번호']||f['차량번호']||'')}</td><td>${esc(f['차종']||f['차명']||'')}<br>${esc(f['탁송지명']||'')}</td><td>${count}건</td><td>${esc(r.updatedAt?.slice(0,10)||'')}<br>${esc(r.updatedBy||'')} · ${r.revision||1}차</td><td><button class="btn btn-sm" data-detail="${esc(r.key)}">조회·수정</button></td></tr>`;}).join('')||'<tr><td colspan="5">등록된 OCR 차량정보가 없습니다.</td></tr>';
   el.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{const row=rows.find(r=>r.key===b.dataset.detail);close();review(row,row);});
  }
  el.querySelector('[data-search]').oninput=render;render();
  el.querySelector('[data-file]').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>100000)throw Error('100KB 이하 OCR 확정 텍스트 파일을 선택하세요.');const doc=normalizeOcr(JSON.parse(await file.text()));if(doc.documentType!==kind)throw Error(kind+' 파일을 선택하세요. 다른 문서 종류는 해당 차량 메뉴에서 가져오세요.');const old=await db.get('meta',ocrKey(doc));close();review(doc,old);}catch(error){toast(error.message,'error');e.target.value='';}};
 }
 });
}
function review(doc,previous){
 const fields={...(previous?.fields||{})};for(const [k,v] of Object.entries(doc.fields))if(v)fields[k]=v;
 openModal({title:previous?'기존 VIN 정보 검토·수정':'OCR 차량정보 신규 등록',size:'wide',
 body:`<p>${previous?'같은 VIN의 기존 정보가 있습니다. 빈 항목은 기존 값을 유지합니다. 변경된 값은 아래에서 확인하세요.':'확정 텍스트를 공용 차량정보에 등록합니다.'}</p><div class="form-grid">${OCR_FIELDS[doc.documentType].map(k=>`<label>${esc(k)}<input class="input" data-field="${esc(k)}" value="${esc(fields[k]||'')}" maxlength="1000" ${k==='VIN'?'readonly':''}>${previous?.fields?.[k]&&previous.fields[k]!==fields[k]?`<small>기존: ${esc(previous.fields[k])}</small>`:''}</label>`).join('')}</div><label class="check"><input type="checkbox" data-confirm> 원본과 비교했으며 공용 계정 사용 직원에게 제공할 내용임을 확인했습니다.</label><p data-status role="status"></p>`,
 foot:'<button class="btn btn-ghost" data-cancel>닫기</button><button class="btn btn-primary" data-save>공용 차량정보에 저장</button>',
 onMount(el,close){el.querySelector('[data-cancel]').onclick=close;el.querySelector('[data-save]').onclick=async e=>{
  const status=el.querySelector('[data-status]');try{
   if(!el.querySelector('[data-confirm]').checked)throw Error('원본 확인 항목을 체크하세요.');
   if(!sharedOnlineMode()||!sharedAuthenticated())throw Error('공용 계정 로그인 및 온라인 연결 후 저장하세요.');
   e.target.disabled=true;
   const checked=normalizeOcr({documentType:doc.documentType,confirmedAt:new Date().toISOString(),fields:Object.fromEntries([...el.querySelectorAll('[data-field]')].map(i=>[i.dataset.field,i.value]))});
   const current=await db.get('meta',ocrKey(checked));
   if(JSON.stringify(current||null)!==JSON.stringify(previous||null))throw Error('다른 작업에서 수정된 정보입니다. 목록을 다시 열어 비교하세요.');
   const next=mergeOcr(previous,checked,accountName());
   if(next===previous){status.textContent='기존 정보와 동일합니다. 중복 등록하지 않았습니다.';e.target.disabled=false;return;}
   await db.put('meta',next);close();await flushShared();toast('차량정보 저장 요청 완료. 상단 공용 원장 저장 상태를 확인하세요.','success');await openOcrVehicles(doc.documentType);
  }catch(error){status.textContent=error.message;e.target.disabled=false;}
 };}
 });
}
