/* global XLSX */
import { state } from '../../core/data.js';
import * as db from '../../core/db.js';
import { esc, nf, todayStr, uid, toast, openModal, confirmBox, exportXlsx } from '../../core/utils.js';
import { pageHead, kpi, field } from '../components.js';
import { calculateSettlement, totals, loadSettlementData, validateRate, RATE_FIELDS, saveDrafts, closeMonth, reopenMonth, money } from '../../core/settlement.js';
import { IMPORT_FIELDS, RATE_IMPORT_KEYS, RESULT_IMPORT_KEYS, guessMapping, parseSettlementImport } from '../../core/settlement-import.js';

const labels = Object.fromEntries(IMPORT_FIELDS.map(([k, v]) => [k, v]));
const SIDE = { sale: '매출', purchase: '매입' }, BASIS = { vehicle: '대당', trip: '건당', km: 'km당' };
const input = (key, value = '', type = 'text') => `<input class="input" id="st-${key}" type="${type}" value="${esc(value ?? '')}" ${type === 'number' ? 'step="any"' : ''}>`;
const select = (key, value, options) => `<select class="select" id="st-${key}">${Object.entries(options).map(([k, v]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;

export default function renderSettlement(view) {
  let month = (state.workdate || todayStr()).slice(0, 7), tab = 'ledger', data, entries = [], page = 0, q = '';
  let workbook = null, filename = '', fileHash = '', importPreview = null, sheet = '', headerRow = 0, importKind = 'rates', mapping = {}, defaultSide = 'sale';
  view.innerHTML = `${pageHead('정산 · 마감', '매출 청구금액과 기사 매입 지급금액을 구분해 계산하고 월별로 확정합니다.', '<button class="btn btn-primary" id="st-export">정산 엑셀 내보내기</button>')}
    <div class="card card-pad row" style="gap:16px;margin-bottom:16px;flex-wrap:wrap"><label>정산 월 <input class="input" style="width:170px;display:inline-block" id="st-month" type="month" value="${month}"></label><span id="st-status"></span><span class="small muted">원 단위 반올림 · 공급가 / 부가세 별도 · 과금 기준은 운송 원장 1행</span></div>
    <div class="tabs" id="st-tabs">${[['ledger', '정산 현황'], ['rates', '단가 사전'], ['import', '마감 엑셀 가져오기'], ['history', '마감 이력']].map(([k, v]) => `<button data-st-tab="${k}">${v}</button>`).join('')}</div><div id="st-body"></div>`;
  const body = view.querySelector('#st-body');
  const run = (fn) => async (...args) => { try { await fn(...args); } catch (e) { toast(e.message, 'warn', 6000); } };
  const activeClosing = () => data.closings.find((c) => c.month === month && c.status === 'closed');
  const draftEntries = () => calculateSettlement(state.dispatch.filter((r) => r.date?.startsWith(month)), data.rates, data.settlements, state.assignments, state.products);
  async function draw() {
    data = await loadSettlementData();
    entries = activeClosing()?.entries || draftEntries();
    view.querySelector('#st-status').innerHTML = `<span class="badge ${activeClosing() ? 'green' : 'amber'}">${activeClosing() ? '마감 완료 · 금액 고정' : '검토 중'}</span>`;
    view.querySelectorAll('[data-st-tab]').forEach((b) => b.classList.toggle('active', b.dataset.stTab === tab));
    if (tab === 'ledger') drawLedger();
    if (tab === 'rates') drawRates();
    if (tab === 'import') drawImport();
    if (tab === 'history') drawHistory();
  }
  function drawLedger() {
    const t = totals(entries), closed = activeClosing();
    const filtered = entries.filter((e) => !q || [e.customer, e.driver, e.vin, e.destination, ...e.issues].join(' ').toLowerCase().includes(q.toLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / 100)); page = Math.min(page, pages - 1);
    body.innerHTML = `<div class="grid grid-4">${kpi({ label: '매출 공급가', value: nf(t.sale), unit: '원', foot: `부가세 ${nf(t.saleVat)}원` })}${kpi({ label: '매입 공급가', value: nf(t.purchase), unit: '원', foot: `부가세 ${nf(t.purchaseVat)}원` })}${kpi({ label: '매출 - 매입', value: nf(t.margin), unit: '원', foot: '공급가 기준 차액' })}${kpi({ label: '확인 필요', value: nf(t.unresolved), unit: '건', tone: t.unresolved ? 'warn' : 'good', foot: `${nf(entries.length)}건 · ${nf(t.count)}대` })}</div>
      <div class="insight" style="margin:16px 0">단가 조건은 빈칸이면 전체 적용, 입력 시 정확히 일치해야 적용됩니다. 기본요금은 우선순위·조건 구체성 순으로 1개를 선택하고, 일치하는 추가요금은 모두 합산합니다. ${closed ? '마감된 금액은 원장·단가를 바꿔도 변하지 않습니다.' : '미등록·충돌 건의 표시금액은 잠정값이며 마감할 수 없습니다.'}</div>
      <div class="row-between" style="margin:16px 0;gap:12px;flex-wrap:wrap"><input class="input" id="st-search" style="max-width:340px" placeholder="거래처·기사·VIN·확인 사유 검색" value="${esc(q)}"><div class="row" style="gap:8px"><button class="btn btn-ghost" id="st-refresh">단가 재계산</button>${closed ? '<button class="btn btn-ghost" id="st-reopen">마감 해제</button>' : '<button class="btn btn-primary" id="st-close">월 마감 확정</button>'}</div></div>
      <div class="card scroll-x"><table class="data settlement-table"><thead><tr><th>운송일 / VIN</th><th>거래처 / 기사</th><th>구간 / 차종</th><th>매출 공급가</th><th>매입 공급가</th><th>차액</th><th>확인</th><th></th></tr></thead><tbody>${filtered.slice(page * 100, page * 100 + 100).map((e) => `<tr><td>${esc(e.date)}<div class="tiny muted">${esc(e.vin || '-')}</div></td><td>${esc(e.customer)}<div class="small muted">${esc(e.driver || '미배정')}</div></td><td>${esc(e.origin)} → ${esc(e.destination)}<div class="tiny muted">${esc(e.brand)} ${esc(e.model)} · ${e.count}대 ${e.distanceKm !== '' ? `· ${esc(e.distanceKm)}km` : ''}</div></td><td class="num">${nf(e.sale.amount)}<div class="tiny muted">VAT ${nf(e.sale.vat)}</div></td><td class="num">${nf(e.purchase.amount)}<div class="tiny muted">VAT ${nf(e.purchase.vat)}</div></td><td class="num">${nf(e.margin)}</td><td><span class="badge ${e.issues.length ? 'amber' : 'green'}">${e.issues.length ? '확인 필요' : e.source === 'import' ? '엑셀 금액' : '적용 완료'}</span><div class="tiny muted">${esc(e.issues.join(' · '))}</div></td><td><button class="btn btn-sm btn-ghost" data-st-edit="${esc(e.orderId)}">근거·수정</button></td></tr>`).join('') || '<tr><td colspan="8" class="table-empty">해당 월의 배차 운송건이 없습니다.</td></tr>'}</tbody></table></div>
      <div class="table-foot"><span>${nf(filtered.length)}건 · ${page + 1}/${pages}페이지</span><div class="row"><button class="btn btn-sm btn-ghost" id="st-prev" ${page === 0 ? 'disabled' : ''}>이전</button><button class="btn btn-sm btn-ghost" id="st-next" ${page >= pages - 1 ? 'disabled' : ''}>다음</button></div></div>`;
    body.querySelector('#st-search').onchange = (e) => { q = e.target.value; page = 0; drawLedger(); };
    body.querySelector('#st-prev').onclick = () => { page--; drawLedger(); }; body.querySelector('#st-next').onclick = () => { page++; drawLedger(); };
    body.querySelector('#st-refresh').onclick = run(draw);
    body.querySelectorAll('[data-st-edit]').forEach((b) => b.onclick = () => editEntry(entries.find((e) => e.orderId === b.dataset.stEdit)));
    body.querySelector('#st-close')?.addEventListener('click', run(async () => {
      if (!await confirmBox(`${month} 정산 ${entries.length}건을 마감할까요? 확인 대상은 모두 해소되어야 합니다.`, { title: '월 마감', ok: '마감 확정' })) return;
      await closeMonth(month); toast('월 마감을 확정했습니다.', 'success'); await draw();
    }));
    body.querySelector('#st-reopen')?.addEventListener('click', () => reopen(activeClosing()));
  }
  function editEntry(entry) {
    const edit = data.settlements.find((r) => r.orderId === entry.orderId) || {};
    const locked = !!activeClosing();
    openModal({ title: '운송건 정산 근거·특수요금', sub: `${entry.date} · ${entry.vin} · ${entry.customer}`, size: 'wide',
      body: `<div class="grid grid-2">${['sale', 'purchase'].map((side) => `<section><h3>${SIDE[side]} 적용 근거</h3>${entry[side].lines.map((line) => `<p class="small">${esc(line.name)} ${line.quantity != null ? `· ${nf(line.price)} × ${nf(line.quantity)}` : ''}<br><b>${nf(line.amount)}원</b> · 부가세 ${nf(line.vat)}원</p>`).join('') || '<p class="muted">일치하는 단가가 없습니다.</p>'}</section>`).join('')}</div><div class="divider"></div><fieldset ${locked ? 'disabled' : ''} style="border:0;padding:0"><div class="form-grid">${field('거리 (km)', input('distanceKm', edit.distanceKm ?? entry.distanceKm, 'number'))}${field('운송방식 / 장비유형', input('transportType', edit.transportType ?? entry.transportType))}${field('상품차량 분류', input('cargoClass', edit.cargoClass ?? entry.cargoClass))}${['sale', 'purchase'].map((side) => field(`${SIDE[side]} 공급가 조정 (+/- 원)`, input(side + 'Adjustment', edit[side + 'Adjustment'] || 0, 'number')) + field(`${SIDE[side]} 부가세 조정 (+/- 원)`, input(side + 'AdjustmentVat', edit[side + 'AdjustmentVat'] || 0, 'number'))).join('')}${field('조정 사유 / 메모', input('note', edit.note || ''))}</div>${edit.source === 'import' ? '<label class="check"><input id="st-use-rates" type="checkbox">가져온 확정금액 대신 단가 사전으로 다시 계산</label>' : ''}</fieldset>${locked ? '<p class="muted">마감 완료된 운송건입니다. 수정하려면 월 마감을 해제하세요.</p>' : ''}`,
      foot: `<button class="btn btn-ghost" data-close>닫기</button>${locked ? '' : '<button class="btn btn-primary" id="st-save-entry">저장·적용</button>'}`,
      onMount(el, close) { el.querySelector('#st-save-entry')?.addEventListener('click', run(async () => {
        const patch = { ...edit, orderId: entry.orderId, date: entry.date, note: el.querySelector('#st-note').value.trim() };
        for (const key of ['distanceKm', 'transportType', 'cargoClass', 'saleAdjustment', 'saleAdjustmentVat', 'purchaseAdjustment', 'purchaseAdjustmentVat']) {
          const value = el.querySelector(`#st-${key}`).value.trim();
          patch[key] = ['transportType', 'cargoClass'].includes(key) ? value : value === '' && key === 'distanceKm' ? '' : money(value || 0);
          if (key === 'distanceKm' && patch[key] !== '' && patch[key] < 0) throw Error('거리는 0 이상이어야 합니다.');
          if (key.includes('Adjustment') && !Number.isInteger(patch[key])) throw Error('조정금액은 정수 원 단위로 입력하세요.');
        }
        if (['saleAdjustment', 'purchaseAdjustment', 'saleAdjustmentVat', 'purchaseAdjustmentVat'].some((k) => patch[k]) && !patch.note) throw Error('조정 사유를 입력하세요.');
        if (el.querySelector('#st-use-rates')?.checked) patch.source = 'rates';
        await saveDrafts(month, [patch]); close(); toast('운송건 요금 조건을 적용했습니다.', 'success'); await draw();
      })); },
    });
  }
  function drawRates() {
    body.innerHTML = `<div class="row-between" style="margin:16px 0"><p class="muted">부가세율을 별도로 입력하세요. 거리 구간의 양 끝은 포함됩니다. 추가요금은 조건이 맞으면 누적 적용됩니다.</p><button class="btn btn-primary" id="st-add-rate">단가 등록</button></div><div class="card scroll-x"><table class="data"><thead><tr><th>구분</th><th>단가명</th><th>적용 조건</th><th>단가 / 부가세율</th><th>적용 기간</th><th>우선순위</th><th></th></tr></thead><tbody>${data.rates.map((r) => `<tr><td>${SIDE[r.side]}<div class="badge ${r.kind === 'base' ? 'blue' : 'amber'}">${r.kind === 'base' ? '기본' : '추가'}</div></td><td>${esc(r.name)}${r.active === false ? ' (비활성)' : ''}</td><td>${esc(RATE_FIELDS.filter((k) => r[k]).map((k) => `${labels[k]}: ${r[k]}`).join(' · ') || '전체')}<div class="tiny muted">${r.minKm !== '' && r.minKm != null ? `최소 ${esc(r.minKm)}km` : ''} ${r.maxKm !== '' && r.maxKm != null ? `최대 ${esc(r.maxKm)}km` : ''}</div></td><td>${nf(r.price)}원 / ${BASIS[r.basis]}<div class="tiny muted">부가세율 ${nf(r.vatPercent)}%</div></td><td>${esc(r.from || '제한 없음')} ~ ${esc(r.to || '')}</td><td>${nf(r.priority)}</td><td><button class="btn btn-sm btn-ghost" data-rate="${esc(r.id)}">수정</button></td></tr>`).join('') || '<tr><td colspan="7" class="table-empty">단가를 직접 등록하거나 마감 엑셀을 가져오세요.</td></tr>'}</tbody></table></div>`;
    body.querySelector('#st-add-rate').onclick = () => editRate();
    body.querySelectorAll('[data-rate]').forEach((b) => b.onclick = () => editRate(data.rates.find((r) => r.id === b.dataset.rate)));
  }
  function editRate(existing) {
    const r = existing || { side: 'sale', kind: 'base', basis: 'vehicle', price: '', vatPercent: 0, priority: 0, active: true };
    openModal({ title: existing ? '단가 수정' : '단가 등록', sub: '조건은 정확히 일치할 때 적용됩니다. 빈 조건은 전체 대상입니다.', size: 'wide',
      body: `<div class="form-grid">${field('매출 / 매입', select('side', r.side, SIDE))}${field('요금 구분', select('kind', r.kind, { base: '기본요금', extra: '추가요금 (누적)' }))}${field('단가명', input('name', r.name))}${field('과금 기준', select('basis', r.basis, BASIS))}${field('단가 (원)', input('price', r.price, 'number'))}${field('부가세율 (%)', input('vatPercent', r.vatPercent, 'number'))}${RATE_FIELDS.map((k) => field(labels[k], input(k, r[k]))).join('')}${field('최소거리 km', input('minKm', r.minKm, 'number'))}${field('최대거리 km', input('maxKm', r.maxKm, 'number'))}${field('적용 시작일', input('from', r.from, 'date'))}${field('적용 종료일', input('to', r.to, 'date'))}${field('우선순위 (큰 값 우선)', input('priority', r.priority, 'number'))}${field('상태', select('active', String(r.active !== false), { true: '사용', false: '중지' }))}</div>`,
      foot: '<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="st-save-rate">단가 저장</button>',
      onMount(el, close) { el.querySelector('#st-save-rate').onclick = run(async () => {
        const fields = ['side', 'kind', 'name', 'basis', 'price', 'vatPercent', ...RATE_FIELDS, 'minKm', 'maxKm', 'from', 'to', 'priority'];
        const rate = validateRate(Object.fromEntries(fields.map((key) => [key, el.querySelector(`#st-${key}`).value.trim()])));
        if (!rate.name.trim()) throw Error('단가명을 입력하세요.');
        await db.put('rates', { ...r, ...rate, id: r.id || uid('rate'), active: el.querySelector('#st-active').value === 'true', updatedAt: new Date().toISOString() });
        close(); toast('단가를 저장했습니다. 미마감 운송건에 반영됩니다.', 'success'); await draw();
      }); },
    });
  }
  function reopen(closing) {
    openModal({ title: `${month} 마감 해제`, sub: '기존 마감본은 이력으로 보관됩니다. 재마감 시 새 버전으로 저장됩니다.', body: field('해제 사유', input('reopen-reason')), foot: '<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="st-do-reopen">마감 해제</button>', onMount(el, close) { el.querySelector('#st-do-reopen').onclick = run(async () => { await reopenMonth(closing.id, el.querySelector('#st-reopen-reason').value); close(); toast('마감을 해제했습니다.', 'success'); await draw(); }); } });
  }
  function drawHistory() {
    body.innerHTML = `<div class="card scroll-x"><table class="data"><thead><tr><th>정산 월 / 버전</th><th>상태</th><th>마감 시각</th><th>매출 / 매입 공급가</th><th>해제 사유</th><th></th></tr></thead><tbody>${data.closings.slice().sort((a, b) => b.closedAt.localeCompare(a.closedAt)).map((c) => `<tr><td>${esc(c.month)} · v${c.version}</td><td>${c.status === 'closed' ? '마감 완료' : '해제됨'}</td><td>${esc(new Date(c.closedAt).toLocaleString('ko-KR'))}</td><td>${nf(c.totals.sale)} / ${nf(c.totals.purchase)}원</td><td>${esc(c.reopenReason || '-')}</td><td><button class="btn btn-sm btn-ghost" data-closing-export="${esc(c.id)}">마감본 내려받기</button></td></tr>`).join('') || '<tr><td colspan="6" class="table-empty">마감 이력이 없습니다.</td></tr>'}</tbody></table></div>`;
    body.querySelectorAll('[data-closing-export]').forEach((b) => b.onclick = () => { const c = data.closings.find((r) => r.id === b.dataset.closingExport); exportEntries(c.entries, `${c.month}_v${c.version}`); });
  }
  function exportEntries(list, label = month) {
    const header = ['운송일', '거래처', '기사', '브랜드', '차종', '출발지', '도착지', '차대번호', '대수', '거리km', '운송방식', '매출공급가', '매출부가세', '매출합계', '매입공급가', '매입부가세', '매입합계', '공급가차액', '확인사유', '매출근거', '매입근거', '메모'];
    const rows = list.map((e) => [e.date, e.customer, e.driver, e.brand, e.model, e.origin, e.destination, e.vin, e.count, e.distanceKm, e.transportType, e.sale.amount, e.sale.vat, e.sale.amount + e.sale.vat, e.purchase.amount, e.purchase.vat, e.purchase.amount + e.purchase.vat, e.margin, e.issues.join(' / '), e.sale.lines.map((l) => `${l.name}: ${l.amount}`).join(' / '), e.purchase.lines.map((l) => `${l.name}: ${l.amount}`).join(' / '), e.note]);
    const by = (key) => { const map = new Map(); for (const e of list) { const name = e[key] || '미입력'; if (!map.has(name)) map.set(name, []); map.get(name).push(e); } return [[key === 'customer' ? '거래처' : '기사', '대수', '매출공급가', '매출부가세', '매입공급가', '매입부가세', '차액'], ...[...map].map(([name, es]) => { const t = totals(es); return [name, t.count, t.sale, t.saleVat, t.purchase, t.purchaseVat, t.margin]; })]; };
    exportXlsx({ 정산내역: [header, ...rows], 거래처별: by('customer'), 기사별: by('driver') }, `M&M_정산_${label}.xlsx`);
  }
  function drawImport() {
    const matrix = workbook && sheet ? XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '', raw: true }) : null;
    const headers = matrix?.[headerRow] || [];
    const keys = importKind === 'rates' ? RATE_IMPORT_KEYS : RESULT_IMPORT_KEYS;
    body.innerHTML = `<div class="card card-pad"><h3>기존 마감 엑셀 가져오기</h3><p class="muted">단가 사전은 매출단가·매입단가를 분리합니다. 정산금액은 운송일+차대번호로 배차 원장에 연결하며, 같은 운송이 여러 개면 기사·구간을 함께 매핑해야 합니다. 공급가와 부가세를 나눠 입력하세요.</p><div class="row" style="gap:12px;flex-wrap:wrap;margin:16px 0"><input type="file" id="st-file" accept=".xlsx,.xls,.csv,.ods"><button class="btn btn-ghost" id="st-template">입력 양식 받기</button></div>${matrix ? `<div class="form-grid">${field('가져올 자료', select('import-kind', importKind, { rates: '단가 사전', results: '배차별 정산 확정금액' }))}${field('단가 구분 기본값', select('default-side', defaultSide, SIDE))}${field('시트', `<select class="select" id="st-sheet">${workbook.SheetNames.map((name) => `<option ${name === sheet ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>`)}${field('헤더 행 번호', input('header-row', headerRow + 1, 'number'))}</div><p class="small muted">${esc(filename)} · 최대 40MB · 동일 파일 반복 반영 시 기존 자료를 중복 추가하지 않습니다.</p><div class="form-grid">${keys.map((key) => field(labels[key], `<select class="select" data-map="${key}"><option value="-1">사용 안 함</option>${headers.map((name, i) => `<option value="${i}" ${mapping[key] === i ? 'selected' : ''}>${i + 1}. ${esc(name || '(빈 열)')}</option>`).join('')}</select>`)).join('')}</div><button class="btn btn-primary" id="st-preview" style="margin-top:16px">매핑 확인·미리보기</button>` : ''}<div id="st-preview-result"></div></div>
      <div class="section card card-pad"><h3>가져오기 이력</h3>${data.settlementImports.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map((r) => `<p class="small">${esc(r.filename)} · ${r.kind === 'rates' ? '단가' : '정산'} ${r.count}건 · ${esc(new Date(r.at).toLocaleString('ko-KR'))}</p>`).join('') || '<p class="muted">가져오기 이력이 없습니다.</p>'}</div>`;
    body.querySelector('#st-template').onclick = () => exportXlsx({ 단가: [['매출/매입', '기본/추가', '단가명', '거래처', '기사', '브랜드', '차종', '상품분류', '출발지', '도착지', '운송방식', '단가기준', '단가', '부가세율', '최소거리', '최대거리', '우선순위', '적용시작', '적용종료'], ['매출', '기본', '예시 기본요금', '', '', '', '', '', '', '', '', '대당', 100000, 0, '', '', 0, '', ''], ['매입', '기본', '예시 지급요금', '', '', '', '', '', '', '', '', '대당', 70000, 0, '', '', 0, '', ''], ['매출', '추가', '예시 세이프티로더 추가', '', '', '', '', '', '', '', '세이프티로더', '건당', 30000, 0, '', '', 0, '', '']], 정산금액: [['운송일', '차대번호', '거래처', '기사', '출발지', '도착지', '매출금액', '매입금액', '매출부가세', '매입부가세', '거리km', '운송방식']] }, '정산_단가_입력양식.xlsx');
    body.querySelector('#st-file').onchange = run(async (e) => {
      const f = e.target.files?.[0]; if (!f) return; if (f.size > 40 * 1024 * 1024) throw Error('40MB 이하 파일을 사용하세요.');
      const buffer = await f.arrayBuffer(); fileHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((n) => n.toString(16).padStart(2, '0')).join('');
      workbook = XLSX.read(buffer, { type: 'array' }); filename = f.name; sheet = workbook.SheetNames[0]; headerRow = 0; importPreview = null;
      const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '', raw: true });
      const detected = grid.slice(0, 25).findIndex((row) => Object.values(guessMapping(row)).filter((i) => i >= 0).length >= 3); if (detected >= 0) headerRow = detected;
      mapping = guessMapping(grid[headerRow] || []); drawImport();
    });
    if (!matrix) return;
    body.querySelector('#st-import-kind').onchange = (e) => { importKind = e.target.value; importPreview = null; drawImport(); };
    body.querySelector('#st-default-side').onchange = (e) => { defaultSide = e.target.value; importPreview = null; };
    const remap = () => { const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '', raw: true }); mapping = guessMapping(rows[headerRow] || []); importPreview = null; drawImport(); };
    body.querySelector('#st-sheet').onchange = (e) => { sheet = e.target.value; headerRow = 0; remap(); };
    body.querySelector('#st-header-row').onchange = (e) => { headerRow = Math.max(0, Math.floor(Number(e.target.value) || 1) - 1); remap(); };
    body.querySelectorAll('[data-map]').forEach((el) => el.onchange = () => { mapping[el.dataset.map] = Number(el.value); importPreview = null; body.querySelector('#st-preview-result').innerHTML = ''; });
    body.querySelector('#st-preview').onclick = run(async () => {
      if (importKind === 'results' && activeClosing()) throw Error('마감된 월에는 가져올 수 없습니다.');
      const effective = draftEntries().map((e) => ({ ...e, id: e.orderId }));
      importPreview = parseSettlementImport(matrix, mapping, importKind, { month, dispatch: effective, defaultSide, headerRow });
      const target = body.querySelector('#st-preview-result');
      target.innerHTML = `<div class="divider"></div><h3>미리보기 · 반영 ${importPreview.valid.length}건 / 제외 ${importPreview.invalid.length}행</h3><div class="scroll-x"><table class="data"><thead><tr><th>엑셀 행</th><th>자료</th><th>금액</th></tr></thead><tbody>${importPreview.valid.slice(0, 10).map((r) => `<tr><td>${r.rowNumber}</td><td>${esc(r.name || r.orderId)} ${esc(SIDE[r.side] || '')}</td><td>${importKind === 'rates' ? `${nf(r.price)}원 / ${BASIS[r.basis]}` : `매출 ${nf(r.saleAmount)} · 매입 ${nf(r.purchaseAmount)}`}</td></tr>`).join('')}</tbody></table></div>${importPreview.invalid.slice(0, 15).map((e) => `<p class="small" style="color:#a92d32">${e.row}행: ${esc(e.reason)}</p>`).join('')}${importPreview.invalid.length ? '<label class="check"><input type="checkbox" id="st-accept-invalid">오류 행을 제외하고 정상 자료만 반영합니다.</label>' : ''}<p class="small muted">단가 사전의 동일 조건은 갱신하며, 정산금액 가져오기는 연결된 운송건의 기존 정산 초안·조정값을 대체합니다. 원본 배차는 변경하지 않습니다.</p><button class="btn btn-primary" id="st-commit-import" ${importPreview.valid.length ? '' : 'disabled'}>검토한 자료 반영</button>`;
      target.querySelector('#st-commit-import').onclick = run(async () => {
        if (!importPreview || (importPreview.invalid.length && !target.querySelector('#st-accept-invalid').checked)) throw Error('오류 행 제외 여부를 확인하세요.');
        const record = { id: `import_${fileHash}_${sheet}_${importKind}_${month}`, filename, sheet, kind: importKind, count: importPreview.valid.length, month, at: new Date().toISOString() };
        if (importKind === 'rates') {
          const unique = new Map(); for (const rate of importPreview.valid) { if (unique.has(rate.id) && (unique.get(rate.id).price !== rate.price || unique.get(rate.id).vatPercent !== rate.vatPercent)) throw Error('동일 조건에 서로 다른 단가가 있습니다. 엑셀을 수정하세요.'); unique.set(rate.id, rate); }
          const database = await db.openDb(); await new Promise((resolve, reject) => { const tx = database.transaction(['rates', 'settlementImports'], 'readwrite'); for (const rate of unique.values()) tx.objectStore('rates').put({ ...rate, sourceFile: filename, updatedAt: record.at }); tx.objectStore('settlementImports').put(record); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('가져오기 취소')); });
        } else await saveDrafts(month, importPreview.valid, record);
        toast('검토한 자료를 반영했습니다.', 'success'); importPreview = null; tab = 'ledger'; await draw();
      });
    });
  }
  view.querySelector('#st-month').onchange = run(async (e) => { if (!e.target.value) return; month = e.target.value; page = 0; importPreview = null; await draw(); });
  view.querySelectorAll('[data-st-tab]').forEach((b) => b.onclick = run(async () => { tab = b.dataset.stTab; await draw(); }));
  view.querySelector('#st-export').onclick = () => exportEntries(entries);
  run(draw)();
}
