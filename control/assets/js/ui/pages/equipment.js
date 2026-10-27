import {
  $, esc, icon, nf, num, normalizePlate, openModal, confirmBox, toast, exportXlsx, debounce, todayStr, diffDays, ddayLabel, dday, addDays,
} from '../../core/utils.js';
import { state, saveEquipment, deleteEquipment, safetyForPlate, importEquipmentFromSafety } from '../../core/data.js';
import { safetySummary } from '../../core/safety.js';
import { pageHead, searchInput, kpi, sectionHead, banner, field } from '../components.js';
import { optionList } from '../../core/utils.js';


const TYPES = ['카캐리어', '탁송', '윙', '기타'];

export default function renderEquipment(view) {
  const ui = { q: '', status: '' };
  const safetyFor = (e) => {
    const rows = safetyForPlate(e.plateNo);
    return rows.length ? { row: rows[0], sum: safetySummary(rows[0]) } : null;
  };
  const safetyAttention = state.equipment.filter((e) => {
    const s = safetyFor(e);
    return s && s.sum.attention > 0;
  }).length;
  const expiring = state.equipment.filter((e) => {
    const a = dday(e.insuranceExpiry), b = dday(e.inspectionExpiry);
    return (a !== null && a <= 30) || (b !== null && b <= 30);
  });

  view.innerHTML = `
    ${pageHead('운송차량', '카캐리어·탁송 장비의 제원, 보험·검사 만료, 기사 배정을 관리합니다.', `
      <a class="btn btn-ghost" href="#/safety" data-link>${icon('shield')} 안전점검</a>
      <button class="btn btn-ghost" id="btn-safety-import">${icon('download')} 안전차량 반영</button>
      <button class="btn btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
      <button class="btn btn-primary" id="btn-add">${icon('plus')} 차량 추가</button>`)}
    <div class="grid grid-4" style="margin-bottom:14px">
      ${kpi({ label: '등록 차량', value: nf(state.equipment.length), unit: '대', iconName: 'truck', foot: `가동 <b>${nf(state.equipment.filter((e) => e.status === 'active').length)}</b>대` })}
      ${kpi({ label: '총 적재 능력', value: nf(state.equipment.reduce((s, e) => s + (num(e.capacity) || 0), 0)), unit: '대', iconName: 'grid', foot: '1회 기준 합계' })}
      ${kpi({ label: '만료 임박', value: nf(expiring.length), unit: '대', iconName: 'warning', tone: expiring.length ? 'warn' : 'good', foot: '보험·검사 30일 이내' })}
      ${kpi({ label: '정비·휴차', value: nf(state.equipment.filter((e) => e.status !== 'active').length), unit: '대', iconName: 'clock', foot: '가배차에서 제외' })}
    </div>
    ${expiring.length ? banner(`보험·검사가 30일 이내인 차량이 <b>${expiring.length}대</b> 있습니다. 만료 전 갱신해 주세요.`, 'warn') : ''}
    ${safetyAttention ? banner(`Tesla 안전점검에서 확인·조치가 필요한 차량이 <b>${safetyAttention}대</b> 있습니다. <a class="link" href="#/safety" data-link>안전점검 열기 →</a>`, 'warn') : ''}
    <div class="toolbar" style="margin-bottom:12px">
      ${searchInput('f-q', '차량번호·모델·기사 검색')}
      <select class="select select-sm" id="f-status">
        <option value="">전체 상태</option>
        <option value="active">가동</option>
        <option value="maintenance">정비</option>
        <option value="idle">휴차</option>
      </select>
      <div style="flex:1"></div>
      <span class="small muted" id="cnt"></span>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th>차량번호</th><th>유형 / 제원</th><th class="num">적재</th><th>배정 기사</th><th>보험 만료</th><th>검사 만료</th><th>안전점검</th><th>상태</th><th style="width:44px"></th></tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  const renderRows = () => {
    const q = ui.q.trim().toLowerCase();
    let rows = state.equipment.filter((e) => !ui.status || e.status === ui.status);
    if (q) rows = rows.filter((e) => `${e.plateNo} ${e.model} ${e.driverName} ${e.type}`.toLowerCase().includes(q));
    rows.sort((a, b) => a.plateNo.localeCompare(b.plateNo, 'ko'));
    $('#cnt').textContent = `${rows.length}대`;
    const tbody = $('#tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="icon">${icon('truck')}</div><h4>등록된 차량이 없습니다</h4><p>카캐리어·탁송 차량을 등록하면 가배차에서 적재량과 가동 상태를 반영합니다.</p><button class="btn btn-primary" id="empty-add">${icon('plus')} 차량 추가</button></div></td></tr>`;
      $('#empty-add')?.addEventListener('click', () => openEditor());
      return;
    }
    tbody.innerHTML = rows.map((e) => {
      const ins = dday(e.insuranceExpiry), insp = dday(e.inspectionExpiry);
      const saf = safetyFor(e);
      return `<tr class="clickable" data-id="${e.id}">
        <td><div class="t-title mono">${esc(e.plateNo)}</div><div class="tiny muted">${esc(e.memo || '')}</div></td>
        <td><div class="small">${esc(e.type)}</div><div class="tiny muted">${esc(e.model || '-')}</div></td>
        <td class="num">${nf(e.capacity)}대</td>
        <td>${e.driverName ? `<div class="small strong">${esc(e.driverName)}</div>` : '<span class="muted small">미배정</span>'}</td>
        <td>${ins === null ? '<span class="muted small">-</span>' : `<span class="badge ${ins < 0 ? 'red' : ins <= 30 ? 'amber' : 'gray'}">${ins < 0 ? `${Math.abs(ins)}일 경과` : `${ins}일 남음`}</span><div class="tiny muted">${esc(e.insuranceExpiry)}</div>`}</td>
        <td>${insp === null ? '<span class="muted small">-</span>' : `<span class="badge ${insp < 0 ? 'red' : insp <= 30 ? 'amber' : 'gray'}">${insp < 0 ? `${Math.abs(insp)}일 경과` : `${insp}일 남음`}</span><div class="tiny muted">${esc(e.inspectionExpiry)}</div>`}</td>
        <td>${saf ? `<span class="badge ${saf.sum.status === 'risk' ? 'red' : saf.sum.status === 'ok' ? 'green' : 'amber'}" title="${esc(saf.row.company || '')}">${esc(saf.sum.label)}</span><div class="tiny muted">${saf.sum.completion}% 완료</div>` : '<span class="muted small">미등록</span>'}</td>
        <td><span class="badge ${e.status === 'active' ? 'green' : e.status === 'maintenance' ? 'amber' : 'gray'}">${e.status === 'active' ? '가동' : e.status === 'maintenance' ? '정비' : '휴차'}</span></td>
        <td><button class="icon-btn" data-edit="${e.id}">${icon('edit')}</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = () => {
      const e = state.equipment.find((x) => x.id === tr.dataset.id);
      if (e) openEditor(e);
    });
  };

  function openEditor(e = null) {
    const d = e || { plateNo: '', type: '카캐리어', model: '', capacity: 6, driverId: '', driverName: '', insuranceExpiry: addDays(todayStr(), 365), inspectionExpiry: addDays(todayStr(), 180), status: 'active', memo: '' };
    const saf = e ? safetyFor(e) : null;
    openModal({
      title: e ? '차량 수정' : '차량 추가',
      sub: '보험·검사 만료일은 대시보드 알림과 가배차 가능 여부에 반영됩니다.',
      size: 'wide',
      body: `${saf ? `<div class="insight" style="margin-bottom:12px">${icon('shield')}<div><b>안전점검 연동</b> · ${esc(saf.row.company || '')} · ${esc(saf.sum.label)} · 완료율 ${saf.sum.completion}% <a class="link" href="#/safety?plate=${encodeURIComponent(d.plateNo)}" data-link>상세 →</a></div></div>` : ''}<div class="form-grid">
        ${field('차량번호', `<input class="input" id="e-plate" value="${esc(d.plateNo)}" placeholder="경기12가3456">`, { req: true })}
        ${field('유형', `<select class="select" id="e-type">${TYPES.map((t) => `<option ${t === d.type ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${field('모델 / 제원', `<input class="input" id="e-model" value="${esc(d.model)}" placeholder="현대 11톤 윙">`)}
        ${field('적재 가능 대수', `<input class="input" type="number" id="e-cap" min="1" max="20" value="${num(d.capacity) || 6}">`)}
        ${field('배정 기사', `<select class="select" id="e-driver">${optionList(state.drivers.map((x) => ({ value: x.id, label: `${x.name} (${x.vehicleNo || '차량 미지정'})` })), d.driverId, '미배정')}</select>`)}
        ${field('상태', `<select class="select" id="e-status"><option value="active" ${d.status === 'active' ? 'selected' : ''}>가동</option><option value="maintenance" ${d.status === 'maintenance' ? 'selected' : ''}>정비</option><option value="idle" ${d.status === 'idle' ? 'selected' : ''}>휴차</option></select>`)}
        ${field('보험 만료일', `<input class="input" type="date" id="e-ins" value="${esc(d.insuranceExpiry)}">`)}
        ${field('검사 만료일', `<input class="input" type="date" id="e-insp" value="${esc(d.inspectionExpiry)}">`)}
        ${field('메모', `<textarea class="textarea" id="e-memo" placeholder="정비 이력, 특이사항">${esc(d.memo)}</textarea>`, { full: true })}
      </div>`,
      foot: `${e ? '<button class="btn btn-danger" id="e-del" style="margin-right:auto">삭제</button>' : ''}<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="e-save">저장</button>`,
      onMount(el, close) {
        el.querySelector('#e-save').onclick = async () => {
          const plateNo = el.querySelector('#e-plate').value.trim();
          if (!plateNo) return toast('차량번호를 입력하세요.', 'warn');
          const driverId = el.querySelector('#e-driver').value;
          const driver = state.drivers.find((x) => x.id === driverId);
          await saveEquipment({
            ...(e || {}),
            plateNo,
            type: el.querySelector('#e-type').value,
            model: el.querySelector('#e-model').value.trim(),
            capacity: num(el.querySelector('#e-cap').value),
            driverId,
            driverName: driver?.name || '',
            status: el.querySelector('#e-status').value,
            insuranceExpiry: el.querySelector('#e-ins').value,
            inspectionExpiry: el.querySelector('#e-insp').value,
            memo: el.querySelector('#e-memo').value.trim(),
          });
          close();
          toast('차량 정보를 저장했습니다.', 'success');
          renderEquipment(view);
        };
        if (e) el.querySelector('#e-del').onclick = async () => {
          if (!(await confirmBox(`${e.plateNo} 차량을 삭제할까요?`, { title: '차량 삭제', ok: '삭제', danger: true }))) return;
          await deleteEquipment(e.id);
          close();
          toast('삭제했습니다.', 'success');
          renderEquipment(view);
        };
      },
    });
  }

  $('#btn-safety-import').onclick = () => {
    const companies = [...new Set(state.safety.map((r) => r.company).filter(Boolean))];
    const active = state.safety.filter((r) => r.active);
    openModal({
      title: '안전점검 차량을 운송차량에 반영',
      sub: '안전점검 목록의 차량번호를 기준으로 운송차량을 생성합니다. 이미 등록된 차량은 건드리지 않습니다.',
      body: `<div class="form-grid">
        ${field('운송사', `<select class="select" id="si-company">${companies.map((c) => `<option value="${esc(c)}" ${c === 'M&M' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`)}
        ${field('대상', `<label class="check" style="height:34px"><input type="checkbox" id="si-active" checked> 운행 중인 차량만</label>`)}
      </div>
      <div class="insight" style="margin-top:12px">${icon('info')}<div>현재 안전점검 <b>${nf(state.safety.length)}대</b> · 운행 <b>${nf(active.length)}대</b> · 등록 차량 <b>${nf(state.equipment.length)}대</b>. 차량번호가 같은 기존 운송차량은 유지됩니다.</div></div>`,
      foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="si-go">${icon('check')} 반영</button>`,
      onMount(el, close) {
        el.querySelector('#si-go').onclick = async () => {
          const company = el.querySelector('#si-company').value;
          const onlyActive = el.querySelector('#si-active').checked;
          close();
          const res = await importEquipmentFromSafety(state.safety, { company, onlyActive });
          toast(`안전점검 차량 ${nf(res.created)}대를 운송차량에 등록했습니다.${res.skipped ? ` (${nf(res.skipped)}대 기존 등록)` : ''}`, 'success', 5000);
          renderEquipment(view);
        };
      },
    });
  };
  $('#btn-add').onclick = () => openEditor();
  $('#btn-export').onclick = () => {
    const rows = [['차량번호', '유형', '모델', '적재', '기사', '보험만료', '검사만료', '상태', '메모']];
    for (const e of state.equipment) rows.push([e.plateNo, e.type, e.model, e.capacity, e.driverName, e.insuranceExpiry, e.inspectionExpiry, e.status, e.memo]);
    exportXlsx({ 운송차량: rows }, 'M&M_운송차량.xlsx');
  };
  $('#f-q').addEventListener('input', debounce((ev) => { ui.q = ev.target.value; renderRows(); }, 180));
  $('#f-status').addEventListener('change', (ev) => { ui.status = ev.target.value; renderRows(); });
  renderRows();
}
