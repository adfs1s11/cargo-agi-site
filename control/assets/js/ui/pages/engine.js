import { parseWorkbook, FIELD_DEFS, buildTemplateRows } from '../../core/importer.js';
import { previewHistory, commitHistory } from '../../core/transport-history.js';
import { referenceHistory } from '../../core/transport-history.js';
import { state, saveSettings, reloadAll } from '../../core/data.js';
import { buildContext } from '../../core/assign.js';
import { classifyOrder, routeKey } from '../../core/dispatch-profile.js';
import { esc, nf, todayStr, addDays, toast, readFile, openModal, exportXlsx } from '../../core/utils.js';
import { pageHead, kpi } from '../components.js';

export default function renderEngine(view) {
  const date = state.workdate || todayStr();
  const days = Number(state.settings.assign.historyDays) || 730;
  const context = buildContext(date);
  const history = referenceHistory(state.dispatch,state.transportHistory,date,addDays(date,-days));
  const group = (key) => { const map = new Map(); for (const r of history) { const name = key(classifyOrder(r, state.products)) || '분류 미입력'; map.set(name, (map.get(name) || 0) + Number(r.count || 1)); } return [...map].sort((a, b) => b[1] - a[1]); };
  const routes = group((r) => `${r.origin || '출발지 미입력'} → ${r.destination || '도착지 미입력'}`);
  const classes = group((r) => r.cargoClass || r.model);
  const newDrivers = context.drivers.filter((d) => (d.history?.rows || 0) < 60);
  const table = (rows) => `<table class="data"><thead><tr><th>구분</th><th class="num">운송 대수</th></tr></thead><tbody>${rows.slice(0, 15).map(([name, count]) => `<tr><td>${esc(name)}</td><td class="num">${nf(count)}대</td></tr>`).join('') || '<tr><td colspan="2">이력이 없습니다.</td></tr>'}</tbody></table>`;
  view.innerHTML = `${pageHead('배차엔진 · 이력 분석', '구간·차종·장비·숙련도를 함께 비교하는 이력 기반 추천입니다. 실제 거리와 이동시간은 입력된 경우에만 참고할 수 있습니다.','<button class="btn btn-primary" id="en-upload">운송 이력 배차판 업로드</button>')}
    <div class="card card-pad row" style="gap:12px;margin-bottom:16px;flex-wrap:wrap"><label>참고 이력 <select class="select" id="en-days" style="width:160px;display:inline-block">${[180, 365, 730, 1095].map((n) => `<option value="${n}" ${n === days ? 'selected' : ''}>${n === 180 ? '6개월' : `${n / 365}년`}</option>`).join('')}</select></label><span class="muted">${addDays(date, -days)} ~ ${addDays(date, -1)} · 취소·미출고·지원 제외</span><a class="btn btn-primary" href="#/assign" data-link>추천 배차 실행</a></div>
    <div class="card card-pad section"><h3>참고용 운송 이력 등록</h3><p>지난 1~2년 배차판을 업로드해 구간·차종·기사별 운송 경험을 추천에 반영하세요. 실제 배차와 정산 원장에 추가하지 않습니다.</p><button class="btn btn-primary" id="en-upload-empty">배차판 파일 선택·미리보기</button><p class="small muted">현재 기준일 ${esc(date)} · 별도 저장 이력 ${nf((state.transportHistory || []).length)}건 · 현재 참고 기간 내 이력만 추천에 사용</p><details><summary>참고 이력 업로드 내역 ${(state.historyImports || []).length}개</summary><div class="scroll-x"><table class="data"><thead><tr><th>파일</th><th>운송 기간</th><th>저장 건수</th><th>등록일</th></tr></thead><tbody>${(state.historyImports || []).map(i=>`<tr><td>${esc(i.fileName)}</td><td>${esc(i.dateFrom)} ~ ${esc(i.dateTo)}</td><td>${nf(i.count)}</td><td>${esc(i.importedAt.slice(0,10))}</td></tr>`).join('') || '<tr><td colspan="4">등록한 참고 이력이 없습니다.</td></tr>'}</tbody></table></div></details></div>
    <div class="grid grid-4">${kpi({ label: '참고 운송 이력', value: nf(history.length), unit: '건', foot: '기준일 이전 이력만 사용' })}${kpi({ label: '기존 운송구간', value: nf(routes.length), unit: '개', foot: '출발지 + 도착지 조합' })}${kpi({ label: '상품 분류·차종', value: nf(classes.length), unit: '개', foot: '상품 마스터 분류 우선' })}${kpi({ label: '이력 부족 기사', value: nf(newDrivers.length), unit: '명', foot: '참고 운송 60대 미만' })}</div>
    <div class="section card card-pad"><h3>신규 기사·장비의 유사 이력</h3><p class="muted">같은 장비 유형·유사 적재대수·숙련도·출발지 거점을 비교합니다. 자신의 이력이 60대 미만이면 최대 3명의 유사 이력을 낮은 비중으로 참고하며, 이력이 쌓이면 자신의 이력을 우선합니다. 장비·숙련도 조건이 맞지 않는 운송건은 추천하지 않습니다.</p><select class="select" id="en-driver" style="max-width:360px">${context.drivers.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · 이력 ${nf(d.history?.rows || 0)}대</option>`).join('')}</select><div id="en-peers" style="margin-top:14px"></div></div>
    <div class="grid grid-2 section"><div class="card"><div class="card-pad"><h3>자주 운송한 구간 (상위 15개)</h3></div><div class="scroll-x">${table(routes)}</div></div><div class="card"><div class="card-pad"><h3>상품 분류·차종 이력 (상위 15개)</h3></div><div class="scroll-x">${table(classes)}</div></div></div>
    <div class="card card-pad section"><h3>추가 고려 조건 입력</h3><p class="muted">기사: 숙련도 1~5, 출발지 거점, 가능 상품분류, 운행 시간 · 장비: 가동 상태, 적재대수, 허용중량, 가능 상품분류 · 상품차량: 분류, 필요 장비, 최소 숙련도, 차량 중량. 기존 평가·선호/기피 권역·일일 부하·사고 이력도 함께 적용합니다.</p><div class="row" style="gap:10px;flex-wrap:wrap"><a class="btn btn-ghost" href="#/drivers" data-link>기사 조건 설정</a><a class="btn btn-ghost" href="#/equipment" data-link>장비 조건 설정</a><a class="btn btn-ghost" href="#/products" data-link>상품차량 분류 설정</a></div><p class="small muted">가능 상품분류는 쉼표로 구분합니다. 필요 장비·분류·거점 명칭은 정확히 일치시켜 주세요. 시간 정보가 없는 운송건에는 운행 시간 제한을 판정할 수 없습니다. 적재중량은 원장 1행의 차량중량×대수 기준입니다. 여러 운송건의 동시 적재 배치, 실제 지도 기반 공차거리·차종 치수별 배치는 현재 계산하지 않습니다.</p></div>`;
  view.querySelector('#en-upload').onclick=()=>openHistoryUpload(date,()=>renderEngine(view));
  view.querySelector('#en-upload-empty').onclick=()=>openHistoryUpload(date,()=>renderEngine(view));
  const showPeers = () => {
    const d = context.drivers.find((d) => d.id === view.querySelector('#en-driver').value);
    view.querySelector('#en-peers').innerHTML = d ? `<p>장비 ${esc(d.equipment?.type || '미등록')} · 적재 ${nf(d.equipment?.capacity || 0)}대 · 숙련도 ${d.skillLevel}/5 · 거점 ${esc(d.baseOrigin || '미입력')}</p>${d.peers.length ? d.peers.map((p) => `<div class="dispatch-list-row"><span>${esc(p.name)} · 운송 ${nf(p.history.rows)}대</span><strong>유사도 ${Math.round(p.similarity * 100)}%</strong></div>`).join('') : '<p class="muted">비교할 유사 이력이 없습니다. 같은 유형의 장비와 기존 운송 이력을 등록하세요.</p>'}` : '<p class="muted">활동 기사가 없습니다.</p>';
  };
  view.querySelector('#en-driver').onchange = showPeers; showPeers();
  view.querySelector('#en-days').onchange = async (e) => { try { await saveSettings({ assign: { historyDays: Number(e.target.value) } }); renderEngine(view); } catch (e) { toast(e.message, 'warn'); } };
}

export function openHistoryUpload(date,onImported) {
  let buffer, parsed, fileName='', version=0, busy=false;
  openModal({title:'운송 이력 참고용 배차판 업로드',size:'xwide',
    sub:`${date} 이전 이력만 저장합니다. 실제 배차·정산·기사 등록과 분리됩니다.`,
    body:`<div class="insight">과거 배차판 XLSX·XLS·CSV·ODS를 선택하세요. 날짜는 연도를 포함해야 하며 대수는 명시된 값만 사용합니다. 원본 파일과 실제 원장은 변경하지 않습니다.</div><div class="row" style="gap:12px;margin:16px 0;flex-wrap:wrap"><input type="file" id="hi-file" accept=".xlsx,.xls,.xlsm,.csv,.ods"><button class="btn btn-ghost" id="hi-template">배차판 양식 받기</button></div><div id="hi-mapping"></div><div id="hi-preview" aria-live="polite"></div>`,
    foot:'<button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" id="hi-save" disabled>확인한 이력 저장</button>',
    onMount(el,close) {
      const button=el.querySelector('#hi-save'), file=el.querySelector('#hi-file'), box=el.querySelector('#hi-preview');
      const options=()=>{const out={};el.querySelectorAll('[data-hi-sheet]').forEach(s=>{out[s.dataset.hiSheet] ||= {};out[s.dataset.hiSheet][s.dataset.hiKey]=s.value===''?undefined:Number(s.value);});return out;};
      const parse=()=>parseWorkbook(buffer,fileName,{strictHistory:true,mappingOverrides:options()});
      const draw=()=>{
        try {
          parsed=parse();const rows=parsed.sheets.flatMap(s=>s.rows), p=previewHistory(rows,date,state.transportHistory,state.dispatch);
          box.innerHTML=`<p><b>${esc(fileName)}</b> · 인식 ${nf(rows.length)}건 · 신규 ${nf(p.accepted.length)}건 · 중복 ${nf(p.duplicates.length)}건 · 보류 ${nf(p.held.length)}건</p>${parsed.warnings.map(w=>`<p class="small">${esc(w)}</p>`).join('')}<div class="scroll-x" style="max-height:260px;overflow:auto"><table class="data"><thead><tr><th>운송일</th><th>기사</th><th>구간</th><th>차종 / 장비</th><th>대수</th></tr></thead><tbody>${p.accepted.slice(0,20).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.driver)}</td><td>${esc(r.origin)} → ${esc(r.destination)}</td><td>${esc(r.model)} / ${esc(r.transportType || '미입력')}</td><td>${nf(r.count)}</td></tr>`).join('') || '<tr><td colspan="5">저장할 신규 이력이 없습니다.</td></tr>'}</tbody></table></div><p class="small muted">신규 상위 20건 표시 · 매출·매입 금액과 연락처는 참고 이력에 저장하지 않습니다. 기사도 자동 등록하지 않습니다.</p><details><summary>보류 사유 ${nf(p.held.length)}건</summary>${p.held.slice(0,50).map(x=>`<p>${esc(x.row.sheet || '')} ${nf(x.row.rowNumber)}행 · ${esc(x.reason)}</p>`).join('')}</details><label class="check" style="margin-top:12px"><input type="checkbox" id="hi-confirm">운송일·열 매핑·보류 사유와 참고용 저장 범위를 확인했습니다.</label>`;
          button.disabled=true;el.querySelector('#hi-confirm').onchange=e=>button.disabled=!e.target.checked || !p.accepted.length;
        }catch(e){parsed=null;button.disabled=true;box.innerHTML=`<p class="insight warn">${esc(e.message)}</p>`;}
      };
      el.querySelector('#hi-template').onclick=()=>exportXlsx({'배차판 양식':buildTemplateRows()},'운송이력_배차판_양식.xlsx');
      file.onchange=async()=>{
        if(busy)return;const f=file.files?.[0], current=++version;parsed=null;buffer=null;button.disabled=true;
        el.querySelector('#hi-mapping').innerHTML='';box.textContent='';if(!f)return;
        if(f.size>40*1024*1024){box.textContent='40MB 이하 파일을 선택하세요.';return;}
        box.textContent='파일을 읽고 있습니다…';
        try {
          const next=await readFile(f);if(current!==version)return;buffer=next;fileName=f.name;
          const initial= parseWorkbook(buffer,fileName,{strictHistory:true});
          el.querySelector('#hi-mapping').innerHTML=`<h4>시트별 열 매핑 확인</h4><p class="small muted">자동 인식이 다르면 바꾸세요. 누락된 필수 열은 저장되지 않습니다.</p><div class="scroll-x"><table class="data"><thead><tr><th>시트</th>${['date','origin','destination','vin','driver','count','model','transportType'].map(k=>`<th>${esc(FIELD_DEFS.find(f=>f.key===k).label)}</th>`).join('')}</tr></thead><tbody>${initial.sheets.map(s=>`<tr><td>${esc(s.name)}</td>${['date','origin','destination','vin','driver','count','model','transportType'].map(k=>`<td><select class="select" data-hi-sheet="${esc(s.name)}" data-hi-key="${k}"><option value="">미지정</option>${s.headers.map((h,i)=>`<option value="${i}" ${s.mapping[k]===i?'selected':''}>${esc(h || '열 '+(i+1))}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
          el.querySelectorAll('[data-hi-sheet]').forEach(s=>s.onchange=draw);draw();
        }catch(e){if(current===version)box.textContent=e.message;}
      };
      button.onclick=async()=>{
        if(busy||!parsed||!el.querySelector('#hi-confirm')?.checked)return;
        busy=true;button.disabled=true;file.disabled=true;el.querySelectorAll('[data-hi-sheet]').forEach(s=>s.disabled=true);
        try {
          const result=await commitHistory(parsed.sheets.flatMap(s=>s.rows),date,fileName);await reloadAll();
          close();onImported?.();toast(`참고 이력 ${nf(result.accepted.length)}건 저장 · 중복 ${nf(result.duplicates.length)}건 · 보류 ${nf(result.held.length)}건`,'success',6000);
        }catch(e){busy=false;file.disabled=false;el.querySelectorAll('[data-hi-sheet]').forEach(s=>s.disabled=false);draw();toast(e.message,'warn');}
      };
    }
  });
}
