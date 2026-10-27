import {
  $, esc, icon, nf, num, str, todayStr, shortDate, uid, openModal, openDrawer, confirmBox, toast,
  exportXlsx, debounce, monthStr, timeAgo, dateLabel,
} from '../../core/utils.js';
import { state, saveIncident, deleteIncident, setIncidentStatus, driverByName } from '../../core/data.js';
import { savePhoto, photosFor, deletePhoto } from '../../core/photos.js';
import { pageHead, searchInput, kpi, banner, field, sectionHead } from '../components.js';
import { optionList } from '../../core/utils.js';

const TYPES = ['사고', '클레임', '지연', '미출고', '기타'];
const STATUS = { open: ['접수', 'red'], processing: ['처리중', 'amber'], closed: ['완료', 'green'] };
const SEV = { 상: 'red', 중: 'amber', 하: 'gray' };

export default function renderIncidents(view) {
  const ui = { q: '', type: '', status: '', page: 1 };
  const thisMonth = monthStr(state.workdate || todayStr());
  const open = state.incidents.filter((i) => i.status !== 'closed');
  const monthList = state.incidents.filter((i) => String(i.date).startsWith(thisMonth));
  const cost = state.incidents.reduce((s, i) => s + (num(i.cost) || 0), 0);
  const byDriver = new Map();
  for (const i of state.incidents) byDriver.set(i.driverName, (byDriver.get(i.driverName) || 0) + 1);
  const repeat = [...byDriver.entries()].filter(([, n]) => n >= 2).length;

  view.innerHTML = `
    ${pageHead('사고 · 클레임', '현장 이슈를 기록하면 기사 평가에 즉시 감점이 반영됩니다.', `
      <button class="btn btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
      <button class="btn btn-primary" id="btn-add">${icon('plus')} 이슈 등록</button>`)}
    <div class="grid grid-4" style="margin-bottom:14px">
      ${kpi({ label: '진행 중', value: nf(open.length), unit: '건', iconName: 'alert', tone: open.length ? 'warn' : 'good', foot: `접수 ${state.incidents.filter((i) => i.status === 'open').length} · 처리중 ${state.incidents.filter((i) => i.status === 'processing').length}` })}
      ${kpi({ label: '이번 달', value: nf(monthList.length), unit: '건', iconName: 'calendar', foot: `${thisMonth.replace('-', '년 ')}월` })}
      ${kpi({ label: '누적 비용', value: nf(Math.round(cost / 10000)), unit: '만원', iconName: 'chart', foot: `전체 ${state.incidents.length}건` })}
      ${kpi({ label: '반복 이슈 기사', value: nf(repeat), unit: '명', iconName: 'users', tone: repeat ? 'warn' : '', foot: '2건 이상' })}
    </div>
    <div class="toolbar" style="margin-bottom:12px">
      ${searchInput('f-q', '기사·차량·내용 검색')}
      <select class="select select-sm" id="f-type"><option value="">전체 유형</option>${TYPES.map((t) => `<option>${t}</option>`).join('')}</select>
      <select class="select select-sm" id="f-status"><option value="">전체 상태</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
      <div style="flex:1"></div>
      <span class="small muted" id="cnt"></span>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th style="width:70px">일자</th><th>유형</th><th>기사 / 차량</th><th>내용</th><th class="num">비용</th><th>사진</th><th>상태</th><th style="width:44px"></th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
    <div class="section">
      <div class="insight">${icon('info')}<div><b>평가 반영</b> — 심각도 상 <b>${state.settings.eval.penalties.incident.상}점</b> · 중 <b>${state.settings.eval.penalties.incident.중}점</b> · 하 <b>${state.settings.eval.penalties.incident.하}점</b>이 기사 평가에서 차감됩니다. 비용은 1만원당 ${state.settings.eval.penalties.costPer10k}점 추가 감점.</div></div>
    </div>
  `;

  const filtered = () => {
    const q = ui.q.trim().toLowerCase();
    let rows = state.incidents.filter((i) => (!ui.type || i.type === ui.type) && (!ui.status || i.status === ui.status));
    if (q) rows = rows.filter((i) => `${i.driverName} ${i.vehicleNo} ${i.description} ${i.customer} ${i.vin}`.toLowerCase().includes(q));
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  };

  const renderRows = () => {
    const rows = filtered();
    $('#cnt').textContent = `${rows.length}건`;
    const tbody = $('#tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="icon">${icon('alert')}</div><h4>등록된 이슈가 없습니다</h4><p>사고·클레임이 발생하면 기록하세요. 사진을 첨부하면 현장 확인이 빨라집니다.</p><button class="btn btn-primary" id="empty-add">${icon('plus')} 이슈 등록</button></div></td></tr>`;
      $('#empty-add')?.addEventListener('click', () => openEditor());
      return;
    }
    tbody.innerHTML = rows.map((i) => `
      <tr class="clickable" data-id="${i.id}">
        <td class="num nowrap">${shortDate(i.date)}</td>
        <td><span class="badge ${i.type === '사고' ? 'red' : i.type === '지연' ? 'amber' : i.type === '미출고' ? 'red' : 'purple'}">${esc(i.type)}</span><div class="tiny"><span class="badge ${SEV[i.severity]}">${esc(i.severity)}</span></div></td>
        <td><div class="t-title">${esc(i.driverName || '-')}</div><div class="tiny muted">${esc(i.vehicleNo || '-')}</div></td>
        <td><div style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.description)}</div><div class="tiny muted">${esc(i.customer || '')} ${i.vin ? `· ${esc(i.vin)}` : ''}</div></td>
        <td class="num">${i.cost ? nf(i.cost) : '-'}</td>
        <td>${i.photos?.length ? `<span class="badge blue">${i.photos.length}</span>` : '<span class="muted small">-</span>'}</td>
        <td><span class="badge ${STATUS[i.status]?.[1] || 'gray'}">${STATUS[i.status]?.[0] || i.status}</span></td>
        <td><button class="icon-btn" data-edit="${i.id}">${icon('edit')}</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = (e) => {
      if (e.target.closest('[data-edit]')) return;
      const i = state.incidents.find((x) => x.id === tr.dataset.id);
      if (i) openDrawerFor(i);
    });
    tbody.querySelectorAll('[data-edit]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const i = state.incidents.find((x) => x.id === b.dataset.edit); if (i) openEditor(i); });
  };

  async function openDrawerFor(i) {
    const photos = await photosFor(i.photos || []);
    const driver = driverByName(i.driverName);
    openDrawer({
      title: `${i.type} · ${i.driverName}`,
      sub: `${dateLabel(i.date, true)} · ${i.severity} · ${STATUS[i.status]?.[0] || i.status}`,
      wide: true,
      body: `
        <div class="row" style="gap:6px;margin-bottom:12px">
          <span class="badge ${i.type === '사고' ? 'red' : 'purple'}">${esc(i.type)}</span>
          <span class="badge ${SEV[i.severity]}">심각도 ${esc(i.severity)}</span>
          <span class="badge ${STATUS[i.status]?.[1] || 'gray'}">${STATUS[i.status]?.[0] || i.status}</span>
          ${i.cost ? `<span class="badge gray">${nf(i.cost)}원</span>` : ''}
        </div>
        <div class="card card-pad" style="background:#fbfcfe">
          <div class="small strong" style="line-height:1.7">${esc(i.description)}</div>
          ${i.request ? `<div class="small muted" style="margin-top:8px;line-height:1.6">요청/조치: ${esc(i.request)}</div>` : ''}
        </div>
        <div class="grid grid-2" style="gap:0 18px;margin-top:12px">
          ${[['기사', i.driverName || '-'], ['연락처', driver?.phone || '-'], ['차량번호', i.vehicleNo || '-'], ['차대번호', i.vin || '-'], ['거래처', i.customer || '-'], ['도착지', i.destination || '-'], ['비용', i.cost ? `${nf(i.cost)}원` : '-'], ['등록', timeAgo(i.createdAt)]].map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line-2)"><span class="small muted">${k}</span><span class="small strong" style="text-align:right">${esc(v)}</span></div>`).join('')}
        </div>
        ${photos.length ? `<div class="section"><div class="section-head"><h3>첨부 사진</h3><span class="hint">${photos.length}장</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">${photos.map((p) => `<img src="${p.dataUrl}" data-photo="${p.id}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:9px;cursor:zoom-in;border:1px solid var(--line)">`).join('')}</div></div>` : ''}
      `,
      foot: `
        ${i.status !== 'closed' ? `<button class="btn btn-ghost" id="st-processing">처리중</button><button class="btn btn-primary" id="st-close">${icon('check')} 완료 처리</button>` : '<button class="btn btn-ghost" id="st-reopen" style="margin-left:auto">다시 열기</button>'}
        <button class="btn btn-ghost" id="inc-edit">수정</button>`,
      onMount(el, close) {
        el.querySelectorAll('[data-photo]').forEach((img) => img.onclick = () => {
          const p = photos.find((x) => x.id === img.dataset.photo);
          if (p) openModal({ title: '첨부 사진', body: `<img src="${p.dataUrl}" style="width:100%;border-radius:10px">` });
        });
        const update = async (status, msg) => { await setIncidentStatus(i.id, status); close(); toast(msg, 'success'); renderIncidents(view); };
        el.querySelector('#st-processing')?.addEventListener('click', () => update('processing', '처리중으로 변경했습니다.'));
        el.querySelector('#st-close')?.addEventListener('click', () => update('closed', '완료 처리했습니다.'));
        el.querySelector('#st-reopen')?.addEventListener('click', () => update('open', '다시 열었습니다.'));
        el.querySelector('#inc-edit').onclick = () => { close(); openEditor(i); };
      },
    });
  }

  function openEditor(item = null) {
    const d = item || { id: uid('inc'), date: state.workdate || todayStr(), type: '클레임', severity: '중', driverName: '', vehicleNo: '', vin: '', customer: '', destination: '', description: '', cost: 0, status: 'open', photos: [], request: '' };
    let newPhotos = []; // {dataUrl, file}
    const existing = [...(d.photos || [])];
    const id = d.id;
    const { el, close } = openModal({
      title: item ? '이슈 수정' : '사고·클레임 등록',
      sub: '사진은 자동 압축되어 기기에 저장됩니다.',
      size: 'wide',
      body: `<div class="form-grid">
        ${field('발생일', `<input class="input" type="date" id="i-date" value="${esc(d.date)}">`, { req: true })}
        ${field('유형', `<select class="select" id="i-type">${TYPES.map((t) => `<option ${t === d.type ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${field('기사', `<select class="select" id="i-driver">${optionList(state.drivers.map((x) => x.name), d.driverName, '기사 선택')}</select>`)}
        ${field('차량번호', `<input class="input" id="i-vehicle" value="${esc(d.vehicleNo)}" placeholder="경기12가3456">`)}
        ${field('차대번호', `<input class="input" id="i-vin" value="${esc(d.vin)}" placeholder="17자리 (선택)">`)}
        ${field('거래처', `<input class="input" id="i-customer" value="${esc(d.customer)}" placeholder="예: 삼성SDS">`)}
        ${field('심각도', `<select class="select" id="i-sev">${['상', '중', '하'].map((s) => `<option ${s === d.severity ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
        ${field('상태', `<select class="select" id="i-status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === d.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>`)}
        ${field('발생 비용 (원)', `<input class="input" type="number" id="i-cost" value="${num(d.cost) || ''}" placeholder="0">`)}
        ${field('도착지', `<input class="input" id="i-dest" value="${esc(d.destination)}">`)}
        ${field('내용', `<textarea class="textarea" id="i-desc" placeholder="무슨 일이 있었는지 구체적으로 기록하세요">${esc(d.description)}</textarea>`, { full: true })}
        ${field('조치 / 요청사항', `<textarea class="textarea" id="i-req" placeholder="보험 접수, 고객 안내, 재배차 등">${esc(d.request)}</textarea>`, { full: true })}
        <div class="full">
          <label class="small strong" style="font-size:11px;color:var(--muted)">현장 사진</label>
          <div class="row" style="margin-top:6px">
            <button class="btn btn-sm btn-ghost" type="button" id="i-photo">${icon('photo')} 사진 촬영·첨부</button>
            <span class="tiny muted" id="i-photo-hint">자동 압축 · 최대 1600px</span>
          </div>
          <input type="file" id="i-file" accept="image/*" capture="environment" multiple class="hidden">
          <div class="row" style="margin-top:8px;gap:6px" id="i-thumbs"></div>
        </div>
      </div>`,
      foot: `${item ? '<button class="btn btn-danger" id="i-del" style="margin-right:auto">삭제</button>' : ''}<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="i-save">저장</button>`,
      onMount(_el, _close) {
        const thumbs = _el.querySelector('#i-thumbs');
        const drawThumbs = async () => {
          const old = await photosFor(existing);
          thumbs.innerHTML = [
            ...old.map((p) => `<div style="position:relative"><img src="${p.dataUrl}" style="width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"><button type="button" data-old="${p.id}" style="position:absolute;top:-5px;right:-5px;width:18px;height:18px;border-radius:50%;background:#333;color:#fff;font-size:11px;line-height:1">×</button></div>`),
            ...newPhotos.map((p, idx) => `<div style="position:relative"><img src="${p.preview}" style="width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"><button type="button" data-new="${idx}" style="position:absolute;top:-5px;right:-5px;width:18px;height:18px;border-radius:50%;background:#333;color:#fff;font-size:11px;line-height:1">×</button></div>`),
          ].join('') || '<span class="tiny muted">첨부된 사진이 없습니다.</span>';
          thumbs.querySelectorAll('[data-new]').forEach((b) => b.onclick = () => { newPhotos.splice(Number(b.dataset.new), 1); drawThumbs(); });
          thumbs.querySelectorAll('[data-old]').forEach((b) => b.onclick = async () => {
            const pid = b.dataset.old;
            existing.splice(existing.indexOf(pid), 1);
            await deletePhoto(pid);
            drawThumbs();
          });
        };
        drawThumbs();
        _el.querySelector('#i-photo').onclick = () => _el.querySelector('#i-file').click();
        _el.querySelector('#i-file').onchange = (ev) => {
          for (const f of ev.target.files || []) {
            if (!f.type.startsWith('image/')) continue;
            newPhotos.push({ file: f, preview: URL.createObjectURL(f) });
          }
          ev.target.value = '';
          drawThumbs();
        };
        _el.querySelector('#i-driver').onchange = (ev) => {
          const drv = driverByName(ev.target.value);
          if (drv && !_el.querySelector('#i-vehicle').value) _el.querySelector('#i-vehicle').value = drv.vehicleNo || '';
        };
        _el.querySelector('#i-save').onclick = async () => {
          const desc = _el.querySelector('#i-desc').value.trim();
          const driverName = _el.querySelector('#i-driver').value;
          if (!desc) return toast('내용을 입력하세요.', 'warn');
          if (!driverName && !_el.querySelector('#i-vehicle').value.trim()) return toast('기사 또는 차량번호를 지정하세요.', 'warn');
          const btn = _el.querySelector('#i-save');
          btn.disabled = true;
          btn.textContent = '저장 중…';
          try {
            const savedIds = [];
            for (const p of newPhotos) {
              const saved = await savePhoto(id, p.file);
              savedIds.push(saved.id);
            }
            await saveIncident({
              ...(item || {}),
              id,
              date: _el.querySelector('#i-date').value,
              type: _el.querySelector('#i-type').value,
              severity: _el.querySelector('#i-sev').value,
              driverName,
              driverId: driverByName(driverName)?.id || '',
              vehicleNo: _el.querySelector('#i-vehicle').value.trim(),
              vin: _el.querySelector('#i-vin').value.trim(),
              customer: _el.querySelector('#i-customer').value.trim(),
              destination: _el.querySelector('#i-dest').value.trim(),
              description: desc,
              cost: num(_el.querySelector('#i-cost').value),
              status: _el.querySelector('#i-status').value,
              photos: [...existing, ...savedIds],
              request: _el.querySelector('#i-req').value.trim(),
            });
            _close();
            toast('사고·클레임을 저장했습니다. 평가에 반영됩니다.', 'success');
            renderIncidents(view);
          } catch (err) {
            btn.disabled = false;
            btn.textContent = '저장';
            toast(err.message, 'error');
          }
        };
        if (item) _el.querySelector('#i-del').onclick = async () => {
          if (!(await confirmBox('이 이슈를 삭제할까요? 첨부 사진도 함께 삭제됩니다.', { title: '이슈 삭제', ok: '삭제', danger: true }))) return;
          await deleteIncident(item.id);
          _close();
          toast('삭제했습니다.', 'success');
          renderIncidents(view);
        };
      },
    });
  }

  $('#btn-add').onclick = () => openEditor();
  $('#btn-export').onclick = () => {
    const rows = [['발생일', '유형', '심각도', '기사', '차량번호', '차대번호', '거래처', '도착지', '내용', '비용', '상태', '조치']];
    for (const i of filtered()) rows.push([i.date, i.type, i.severity, i.driverName, i.vehicleNo, i.vin, i.customer, i.destination, i.description, i.cost, STATUS[i.status]?.[0] || i.status, i.request]);
    exportXlsx({ '사고·클레임': rows }, `M&M_사고클레임_${todayStr()}.xlsx`);
  };
  $('#f-q').addEventListener('input', debounce((e) => { ui.q = e.target.value; renderRows(); }, 180));
  $('#f-type').addEventListener('change', (e) => { ui.type = e.target.value; renderRows(); });
  $('#f-status').addEventListener('change', (e) => { ui.status = e.target.value; renderRows(); });
  renderRows();
}
