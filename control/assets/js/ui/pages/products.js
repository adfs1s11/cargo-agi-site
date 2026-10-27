import {
  $, esc, icon, nf, num, openModal, confirmBox, toast, exportXlsx, debounce, todayStr, addDays, readFile, shortDate, timeAgo, str,
} from '../../core/utils.js';
import { state, saveProduct, deleteProduct, markProductsUpdated, staleProducts } from '../../core/data.js';
import { pageHead, searchInput, kpi, banner, field, sectionHead } from '../components.js';

const BRAND_SITES = {
  테슬라: 'https://www.tesla.com/ko_kr',
  '메르세데스-벤츠': 'https://www.mercedes-benz.co.kr/',
  BMW: 'https://www.bmw.co.kr/ko/all-models.html',
  볼보: 'https://www.volvocars.com/kr/',
  BYD: 'https://www.byd.com/kr',
  아우디: 'https://www.audi.co.kr/',
  포르쉐: 'https://www.porsche.com/korea/',
  쉐보레: 'https://www.chevrolet.co.kr/',
  KG모빌리티: 'https://www.kg-mobility.com/',
  혼다: 'https://www.hondakorea.co.kr/',
  폴스타: 'https://www.polestar.com/kr/',
  지커: 'https://www.zeekr.com/kr',
};

export default function renderProducts(view) {
  const ui = { q: '', brand: '', staleOnly: false };
  const stale = staleProducts(31);

  view.innerHTML = `
    ${pageHead('상품차량', '브랜드·모델·시세·판매처를 관리하고 월 1회 최신화 상태를 추적합니다.', `
      <button class="btn btn-ghost" id="btn-import">${icon('upload')} 시세 CSV</button>
      <button class="btn btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
      <button class="btn btn-primary" id="btn-add">${icon('plus')} 모델 추가</button>`)}
    <div class="grid grid-4" style="margin-bottom:14px">
      ${kpi({ label: '등록 모델', value: nf(state.products.length), unit: '개', iconName: 'car', foot: `${nf(new Set(state.products.map((p) => p.brand)).size)}개 브랜드` })}
      ${kpi({ label: '최신화 필요', value: nf(stale.length), unit: '개', iconName: 'refresh', tone: stale.length ? 'warn' : 'good', foot: '31일 경과 기준' })}
      ${kpi({ label: '평균 시세', value: nf(Math.round(state.products.reduce((s, p) => s + (num(p.price) || 0), 0) / Math.max(1, state.products.length))), unit: '만원', iconName: 'chart', foot: '등록 모델 단순 평균' })}
      ${kpi({ label: '최근 최신화', value: state.products.length ? shortDate([...state.products].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0].updatedAt) : '-', iconName: 'calendar', foot: '가장 최근 갱신일' })}
    </div>
    ${stale.length ? banner(`<b>${stale.length}개 모델</b>의 시세가 31일 이상 지났습니다. 브랜드 공식 사이트·딜러 시세를 확인하고 최신화하세요.<br><span class="tiny">정적 웹앱은 브랜드 사이트의 자동 수집이 차단(CORS·이용약관)되어 있어, 확인 후 일괄 반영하는 방식이 안전합니다.</span>`, 'warn', `<button class="btn btn-sm btn-ghost" id="btn-monthly" style="margin-left:auto">${icon('refresh')} 월간 최신화</button>`) : ''}
    <div class="toolbar" style="margin-bottom:12px">
      ${searchInput('f-q', '브랜드·모델·딜러 검색')}
      <select class="select select-sm" id="f-brand"><option value="">전체 브랜드</option>${[...new Set(state.products.map((p) => p.brand))].sort().map((b) => `<option>${esc(b)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="f-stale"> 최신화 필요만</label>
      <div style="flex:1"></div>
      <span class="small muted" id="cnt"></span>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th>브랜드</th><th>모델 / 트림</th><th class="num">시세</th><th>판매처</th><th>지역</th><th>최신화</th><th style="width:44px"></th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
    <div class="section">
      <div class="section-head"><h3>브랜드 공식 사이트</h3><span class="hint">월 1회 확인용</span></div>
      <div class="row" style="gap:6px">
        ${Object.entries(BRAND_SITES).map(([b, url]) => `<a class="btn btn-sm btn-ghost" href="${url}" target="_blank" rel="noopener">${icon('external')} ${esc(b)}</a>`).join('')}
      </div>
    </div>
  `;

  const renderRows = () => {
    const q = ui.q.trim().toLowerCase();
    let rows = state.products.filter((p) => (!ui.brand || p.brand === ui.brand) && (!ui.staleOnly || !p.updatedAt || p.updatedAt < addDays(todayStr(), -31)));
    if (q) rows = rows.filter((p) => `${p.brand} ${p.model} ${p.trim} ${p.dealer} ${p.note}`.toLowerCase().includes(q));
    rows.sort((a, b) => a.brand.localeCompare(b.brand, 'ko') || a.model.localeCompare(b.model, 'ko'));
    $('#cnt').textContent = `${rows.length}개`;
    const tbody = $('#tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="icon">${icon('car')}</div><h4>등록된 상품차량이 없습니다</h4><p>브랜드·모델·시세를 등록하면 가배차에서 차종 적합성과 브랜드 이력을 반영합니다.</p><button class="btn btn-primary" id="empty-add">${icon('plus')} 모델 추가</button></div></td></tr>`;
      $('#empty-add')?.addEventListener('click', () => openEditor());
      return;
    }
    tbody.innerHTML = rows.map((p) => {
      const isStale = !p.updatedAt || p.updatedAt < addDays(todayStr(), -31);
      return `<tr class="clickable" data-id="${p.id}">
        <td><div class="t-title">${esc(p.brand)}</div>${BRAND_SITES[p.brand] ? `<a href="${BRAND_SITES[p.brand]}" target="_blank" rel="noopener" class="tiny link" onclick="event.stopPropagation()">공식 사이트 ↗</a>` : ''}</td>
        <td><div class="small strong">${esc(p.model)}</div><div class="tiny muted">${esc(p.trim || '-')}</div></td>
        <td class="num"><b>${nf(p.price)}</b><span class="tiny muted">만원</span></td>
        <td class="small">${esc(p.dealer || '-')}</td>
        <td><span class="tag">${esc(p.region || '-')}</span></td>
        <td><span class="badge ${isStale ? 'amber' : 'gray'}">${p.updatedAt ? shortDate(p.updatedAt) : '-'}</span>${isStale ? '<div class="tiny" style="color:#a86a10">확인 필요</div>' : ''}</td>
        <td><button class="icon-btn" data-edit="${p.id}">${icon('edit')}</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = (ev) => {
      if (ev.target.closest('[data-edit]') || ev.target.closest('a')) return;
      const p = state.products.find((x) => x.id === tr.dataset.id);
      if (p) openEditor(p);
    });
    tbody.querySelectorAll('[data-edit]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); const p = state.products.find((x) => x.id === b.dataset.edit); if (p) openEditor(p); });
  };

  function openEditor(p = null) {
    const d = p || { brand: '', model: '', trim: '', price: '', dealer: '', region: '전국', sourceUrl: '', updatedAt: todayStr(), note: '' };
    openModal({
      title: p ? '모델 수정' : '모델 추가',
      sub: '시세는 참고값입니다. 실제 견적·판매가와 다를 수 있습니다.',
      size: 'wide',
      body: `<div class="form-grid">
        ${field('브랜드', `<input class="input" id="p-brand" list="brand-list" value="${esc(d.brand)}" placeholder="테슬라"><datalist id="brand-list">${Object.keys(BRAND_SITES).map((b) => `<option value="${esc(b)}">`).join('')}</datalist>`, { req: true })}
        ${field('모델', `<input class="input" id="p-model" value="${esc(d.model)}" placeholder="Model Y">`, { req: true })}
        ${field('트림', `<input class="input" id="p-trim" value="${esc(d.trim)}" placeholder="Long Range AWD">`)}
        ${field('시세 (만원)', `<input class="input" type="number" id="p-price" value="${num(d.price) || ''}" placeholder="5599">`)}
        ${field('판매처', `<input class="input" id="p-dealer" value="${esc(d.dealer)}" placeholder="테슬라 코리아">`)}
        ${field('지역', `<input class="input" id="p-region" value="${esc(d.region)}" placeholder="전국 / 서울 / 경기">`)}
        ${field('출처 URL', `<input class="input" id="p-url" value="${esc(d.sourceUrl)}" placeholder="https://...">`, { full: true })}
        ${field('최신화일', `<input class="input" type="date" id="p-updated" value="${esc(d.updatedAt || todayStr())}">`)}
        ${field('메모', `<input class="input" id="p-note" value="${esc(d.note)}" placeholder="프로모션, 옵션 등">`)}
      </div>`,
      foot: `${p ? '<button class="btn btn-danger" id="p-del" style="margin-right:auto">삭제</button>' : ''}<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="p-save">저장</button>`,
      onMount(el, close) {
        el.querySelector('#p-save').onclick = async () => {
          const brand = el.querySelector('#p-brand').value.trim();
          const model = el.querySelector('#p-model').value.trim();
          if (!brand || !model) return toast('브랜드와 모델명을 입력하세요.', 'warn');
          await saveProduct({
            ...(p || {}), brand, model,
            trim: el.querySelector('#p-trim').value.trim(),
            price: num(el.querySelector('#p-price').value),
            dealer: el.querySelector('#p-dealer').value.trim(),
            region: el.querySelector('#p-region').value.trim(),
            sourceUrl: el.querySelector('#p-url').value.trim(),
            updatedAt: el.querySelector('#p-updated').value,
            note: el.querySelector('#p-note').value.trim(),
          });
          close();
          toast('상품차량 정보를 저장했습니다.', 'success');
          renderProducts(view);
        };
        if (p) el.querySelector('#p-del').onclick = async () => {
          if (!(await confirmBox(`${p.brand} ${p.model}을(를) 삭제할까요?`, { title: '모델 삭제', ok: '삭제', danger: true }))) return;
          await deleteProduct(p.id);
          close();
          toast('삭제했습니다.', 'success');
          renderProducts(view);
        };
      },
    });
  }

  function openMonthly() {
    const list = staleProducts(31);
    const checked = new Set(list.map((p) => p.id));
    openModal({
      title: '월간 시세 최신화',
      sub: `확인 후 최신화한 모델을 체크하세요. (${todayStr()})`,
      size: 'wide',
      body: `
        <div class="insight" style="margin-bottom:12px">${icon('info')}<div>브랜드 공식 사이트에서 가격·프로모션을 확인한 뒤, 실제로 확인한 모델만 체크하면 됩니다. 가격이 바뀐 모델은 <b>수정</b>에서 값을 갱신하세요.</div></div>
        <div class="stack" style="gap:6px;max-height:360px;overflow:auto">
          ${list.map((p) => `<label class="file-card" style="cursor:pointer">
            <input type="checkbox" data-id="${p.id}" checked style="width:15px;height:15px;accent-color:#1487c9">
            <span class="meta"><strong>${esc(p.brand)} ${esc(p.model)} ${esc(p.trim || '')}</strong><small>${nf(p.price)}만원 · ${esc(p.dealer || '-')} · 마지막 ${esc(p.updatedAt || '-')}</small></span>
            ${BRAND_SITES[p.brand] ? `<a class="btn btn-xs btn-ghost" href="${BRAND_SITES[p.brand]}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${icon('external')} 확인</a>` : ''}
          </label>`).join('') || '<div class="muted small">최신화할 모델이 없습니다.</div>'}
        </div>`,
      foot: `<button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" id="mo-ok">${icon('check')} 선택 최신화</button>`,
      onMount(el, close) {
        el.querySelectorAll('[data-id]').forEach((cb) => cb.onchange = () => { cb.checked ? checked.add(cb.dataset.id) : checked.delete(cb.dataset.id); });
        el.querySelector('#mo-ok').onclick = async () => {
          const n = await markProductsUpdated([...checked], todayStr());
          close();
          toast(`${n}개 모델을 최신화 처리했습니다.`, 'success');
          renderProducts(view);
        };
      },
    });
  }

  function openImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const buf = await readFile(f);
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const header = (matrix[0] || []).map((h) => str(h));
        const find = (...names) => header.findIndex((h) => names.some((n) => h.replace(/\s/g, '').includes(n)));
        const bi = find('브랜드'), mi = find('모델'), ti = find('트림'), pi = find('가격', '시세'), di = find('판매처', '딜러'), ri = find('지역'), ui2 = find('URL', '출처');
        if (bi < 0 || mi < 0) throw new Error('브랜드·모델 열을 찾지 못했습니다. 첫 행에 헤더가 있어야 합니다.');
        let added = 0, updated = 0;
        for (const row of matrix.slice(1)) {
          const brand = str(row[bi]), model = str(row[mi]);
          if (!brand || !model) continue;
          const existing = state.products.find((p) => p.brand === brand && p.model === model && str(p.trim) === str(ti >= 0 ? row[ti] : ''));
          await saveProduct({
            ...(existing || {}), brand, model,
            trim: ti >= 0 ? str(row[ti]) : '',
            price: pi >= 0 ? num(row[pi]) : 0,
            dealer: di >= 0 ? str(row[di]) : '',
            region: ri >= 0 ? str(row[ri]) : '전국',
            sourceUrl: ui2 >= 0 ? str(row[ui2]) : '',
            updatedAt: todayStr(),
          });
          existing ? updated++ : added++;
        }
        toast(`시세 ${added}개 추가 · ${updated}개 갱신`, 'success');
        renderProducts(view);
      } catch (err) {
        toast(`가져오기 실패: ${err.message}`, 'error');
      }
    };
    input.click();
  }

  $('#btn-add').onclick = () => openEditor();
  $('#btn-monthly')?.addEventListener('click', openMonthly);
  $('#btn-import').onclick = openImport;
  $('#btn-export').onclick = () => {
    const rows = [['브랜드', '모델', '트림', '시세(만원)', '판매처', '지역', '출처', '최신화일', '메모']];
    for (const p of state.products) rows.push([p.brand, p.model, p.trim, p.price, p.dealer, p.region, p.sourceUrl, p.updatedAt, p.note]);
    exportXlsx({ 상품차량: rows }, 'M&M_상품차량.xlsx');
  };
  $('#f-q').addEventListener('input', debounce((e) => { ui.q = e.target.value; renderRows(); }, 180));
  $('#f-brand').addEventListener('change', (e) => { ui.brand = e.target.value; renderRows(); });
  $('#f-stale').addEventListener('change', (e) => { ui.staleOnly = e.target.checked; renderRows(); });
  renderRows();
}
