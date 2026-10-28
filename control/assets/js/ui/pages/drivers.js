import {
  $, $$, esc, icon, nf, num, str, norm, normalizePlate, openModal, openDrawer, confirmBox, toast,
  exportXlsx, debounce, unique, shortDate, gradeOf, timeAgo, todayStr, round,
} from '../../core/utils.js';
import { state, saveDriver, deleteDriver, driversFromDispatch, registerDriversFromDispatch, driverByName } from '../../core/data.js';
import { evaluate, periodRange, METRIC_LABELS } from '../../core/evaluation.js';
import { pageHead, searchInput, kpi, sectionHead, metricBars, gradePill, field, banner } from '../components.js';

import { scheduleLabel } from '../../core/schedule.js';

const REGIONS = ['서울', '경기', '인천', '강원', '충청', '경상', '대구', '부산', '전라', '광주', '제주'];

export default function renderDrivers(view) {
  const ui = { q: '', status: 'active' };
  const range = periodRange('6m');
  const ev = evaluate(range);
  const scoreMap = new Map(ev.results.map((r) => [norm(r.name), r]));

  view.innerHTML = `
    ${pageHead('기사 관리', '기사 정보와 선호 권역, 평가등급, 사고 이력을 함께 관리합니다.', `
      <a class="btn btn-ghost" href="#/schedule" data-link>기사 스케줄 · 가용 현황</a>
      <button class="btn btn-ghost" id="btn-auto">${icon('refresh')} 배차판에서 자동 등록</button>
      <button class="btn btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
      <button class="btn btn-primary" id="btn-add">${icon('plus')} 기사 추가</button>`)}
    <div class="grid grid-4" style="margin-bottom:14px">
      ${kpi({ label: '등록 기사', value: nf(state.drivers.length), unit: '명', iconName: 'users', foot: `활동 <b>${nf(state.drivers.filter((d) => d.status === 'active').length)}</b>명` })}
      ${kpi({ label: '평가 평균', value: `${ev.summary.avgScore}`, unit: '점', iconName: 'chart', foot: `최근 6개월 · ${nf(ev.summary.activeDrivers)}명` })}
      ${kpi({ label: 'A등급 이상', value: nf(ev.summary.distribution.S + ev.summary.distribution.A), unit: '명', iconName: 'target', tone: 'good', foot: `S ${ev.summary.distribution.S} · A ${ev.summary.distribution.A}` })}
      ${kpi({ label: '사고·클레임', value: nf(ev.summary.incidents), unit: '건', iconName: 'alert', tone: ev.summary.incidents ? 'warn' : '', foot: `비용 ${nf(ev.summary.incidentCost / 10000)}만원` })}
    </div>
    <div class="toolbar" style="margin-bottom:12px">
      ${searchInput('f-q', '이름·연락처·차량번호 검색')}
      <select class="select select-sm" id="f-status">
        <option value="active">활동 중</option>
        <option value="">전체</option>
        <option value="inactive">비활동</option>
      </select>
      <div style="flex:1"></div>
      <span class="small muted" id="cnt"></span>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table class="data">
          <thead><tr>
            <th style="width:34px"></th><th>기사</th><th>연락처</th><th>차량번호</th><th>유형</th>
            <th>선호 권역</th><th class="num">최근 6개월</th><th>등급</th><th class="num">사고</th><th>상태</th><th style="width:44px"></th>
          </tr></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
    <div class="section">
      <div class="insight">${icon('info')}<div><b>평가 등급</b>은 최근 6개월 배차 실적(운송량·근무일수·효율·도착지/거래처 다양성·브랜드 참여)에서 사고·클레임 감점을 반영해 자동 계산됩니다. 기사 상세에서 지표별 점수를 확인하세요.</div></div>
    </div>
  `;

  const renderRows = () => {
    const q = ui.q.trim().toLowerCase();
    let rows = state.drivers.filter((d) => !ui.status || d.status === ui.status);
    if (q) rows = rows.filter((d) => `${d.name} ${d.phone} ${d.vehicleNo} ${d.type} ${(d.aliases || []).join(' ')}`.toLowerCase().includes(q));
    rows.sort((a, b) => {
      const sa = scoreMap.get(norm(a.name))?.total || 0;
      const sb = scoreMap.get(norm(b.name))?.total || 0;
      return sb - sa || a.name.localeCompare(b.name, 'ko');
    });
    $('#cnt').textContent = `${rows.length}명`;
    const tbody = $('#tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11"><div class="empty"><div class="icon">${icon('users')}</div><h4>기사가 없습니다</h4><p>기사를 추가하거나 배차판에서 자동 등록하세요.</p><button class="btn btn-primary" id="empty-add">${icon('plus')} 기사 추가</button></div></td></tr>`;
      $('#empty-add')?.addEventListener('click', () => openEditor());
      return;
    }
    tbody.innerHTML = rows.map((d) => {
      const s = scoreMap.get(norm(d.name));
      const grade = s?.grade || 'F';
      return `<tr class="clickable" data-id="${d.id}">
        <td><span class="grade ${grade}" style="width:24px;height:24px;border-radius:7px">${grade}</span></td>
        <td><div class="t-title">${esc(d.name)}</div><div class="tiny muted">${esc(d.type)}${d.aliases?.length ? ` · 별칭 ${d.aliases.length}` : ''}</div></td>
        <td class="small num">${esc(d.phone || '-')}</td>
        <td class="mono small">${esc(d.vehicleNo || '-')}</td>
        <td><span class="tag">${esc(d.type || '-')}</span></td>
        <td>${(d.preferred || []).slice(0, 3).map((r) => `<span class="tag" style="margin-right:3px">${esc(r)}</span>`).join('') || '<span class="muted small">-</span>'}</td>
        <td class="num"><b>${nf(s?.count || 0)}</b><span class="tiny muted">대</span><div class="tiny muted">${nf(s?.days || 0)}일</div></td>
        <td>${s ? `<span class="strong">${s.total}</span><span class="tiny muted">점</span>` : '<span class="muted small">-</span>'}</td>
        <td class="num">${s?.incidents ? `<span class="badge red">${s.incidents}</span>` : '<span class="muted">0</span>'}</td>
        <td><span class="badge ${d.status === 'active' ? 'green' : 'gray'}">${d.status === 'active' ? '활동' : '비활동'}</span></td>
        <td><button class="icon-btn" data-edit="${d.id}" title="수정">${icon('edit')}</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.onclick = (e) => {
        if (e.target.closest('[data-edit]')) return;
        const d = state.drivers.find((x) => x.id === tr.dataset.id);
        if (d) openDriverDrawer(d);
      };
    });
    tbody.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); const d = state.drivers.find((x) => x.id === b.dataset.edit); if (d) openEditor(d); };
    });
  };

  function openDriverDrawer(d) {
    const s = scoreMap.get(norm(d.name));
    const eq = state.equipment.filter((e) => e.driverId === d.id || normalizePlate(e.plateNo) === normalizePlate(d.vehicleNo));
    const inc = state.incidents.filter((i) => norm(i.driverName) === norm(d.name)).slice(0, 5);
    const trips = (s?.recent || []).slice(0, 8);
    openDrawer({
      title: d.name,
      sub: `${d.type} · ${d.phone || '연락처 없음'}`,
      wide: true,
      body: `
        <div class="driver-hero">
          <div class="avatar-lg">${esc(d.name.slice(0, 1))}</div>
          <div class="info">
            <strong>${esc(d.name)}</strong>
            <small>${esc(d.vehicleNo || '차량 미지정')} · ${esc(d.type)} · 입사 ${d.joinedAt ? shortDate(d.joinedAt) : '-'}</small>
          </div>
          <div class="score">
            <b>${s ? s.total : '-'}</b>
            <small>${s ? `${s.grade}등급 · ${s.count}대 / ${s.days}일` : '배차 이력 없음'}</small>
          </div>
        </div>
        ${s ? `<div class="card card-pad" style="margin-top:14px">
          <div class="row-between" style="margin-bottom:10px"><strong style="font-size:12.5px">지표별 점수</strong><span class="tiny muted">최근 6개월 · 감점 ${s.penalty}</span></div>
          <div class="stack" style="gap:9px">${metricBars(s.subscores, state.settings.eval.weights, METRIC_LABELS)}</div>
        </div>` : ''}
        <div class="section">
          <div class="section-head"><h3>기본 정보</h3></div>
          <div class="grid grid-2" style="gap:0 18px">
            ${[['연락처', d.phone || '-'], ['차량번호', d.vehicleNo || '-'], ['유형', d.type || '-'], ['상태', d.status === 'active' ? '활동' : '비활동'], ['선호 권역', (d.preferred || []).join(', ') || '-'], ['기피 권역', (d.avoid || []).join(', ') || '-'], ['별칭', (d.aliases || []).join(', ') || '-'], ['메모', d.memo || '-']].map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line-2)"><span class="small muted">${k}</span><span class="small strong" style="text-align:right">${esc(v)}</span></div>`).join('')}
          </div>
        </div>
        ${eq.length ? `<div class="section"><div class="section-head"><h3>운송차량</h3></div>${eq.map((e) => `<div class="file-card" style="margin-bottom:6px"><div class="fi">${icon('truck')}</div><div class="meta"><strong>${esc(e.plateNo)} · ${esc(e.model)}</strong><small>${esc(e.type)} · 적재 ${e.capacity}대 · 보험 ${esc(e.insuranceExpiry || '-')} / 검사 ${esc(e.inspectionExpiry || '-')}</small></div></div>`).join('')}</div>` : ''}
        ${inc.length ? `<div class="section"><div class="section-head"><h3>최근 사고·클레임</h3><span class="hint">${s?.incidents || 0}건</span></div>${inc.map((i) => `<div class="file-card" style="margin-bottom:6px"><span class="badge ${i.type === '사고' ? 'red' : 'purple'}">${esc(i.type)}</span><div class="meta"><strong>${esc(i.description)}</strong><small>${shortDate(i.date)} · ${esc(i.severity)} · ${nf(i.cost)}원 · ${i.status === 'closed' ? '완료' : '진행'}</small></div></div>`).join('')}</div>` : ''}
        ${trips.length ? `<div class="section"><div class="section-head"><h3>최근 배차</h3></div>${trips.map((t) => `<div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line-2);gap:8px"><div style="flex:1;min-width:0"><div class="small strong" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.destination || '-')}</div><div class="tiny muted">${shortDate(t.date)} · ${esc(t.customer || '')}</div></div><span class="tag">${nf(num(t.count) || 1)}대</span></div>`).join('')}</div>` : ''}
      `,
      foot: `<button class="btn btn-ghost" id="d-close">닫기</button><button class="btn btn-primary" id="d-edit">${icon('edit')} 수정</button>`,
      onMount(el, close) {
        el.querySelector('#d-close').onclick = close;
        el.querySelector('#d-edit').onclick = () => { close(); openEditor(d); };
      },
    });
  }

  function openEditor(d = null) {
    const data = d || { name: '', phone: '', vehicleNo: '', type: '개별', status: 'active', preferred: [], avoid: [], aliases: [], joinedAt: todayStr(), memo: '' };
    const prefSet = new Set(data.preferred || []);
    const avoidSet = new Set(data.avoid || []);
    const { el, close } = openModal({
      title: d ? '기사 수정' : '기사 추가',
      sub: '선호 권역은 가배차 추천에 직접 반영됩니다.',
      size: 'wide',
      body: `
        <div class="form-grid">
          ${field('기사 이름', `<input class="input" id="d-name" value="${esc(data.name)}" placeholder="예: 김민준">`, { req: true })}
          ${field('연락처', `<input class="input" id="d-phone" value="${esc(data.phone)}" placeholder="010-0000-0000">`)}
          ${field('차량번호', `<input class="input" id="d-vehicle" value="${esc(data.vehicleNo)}" placeholder="경기12가3456">`)}
          ${field('고용 유형', `<select class="select" id="d-type">${['개별', '협력', '직영', '용차'].map((t) => `<option ${t === data.type ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
          ${field('숙련도 (1 초급 ~ 5 숙련)', `<input class="input" type="number" id="d-skill" min="1" max="5" value="${data.skillLevel || 1}">`)}
          ${field('출발지 거점', `<input class="input" id="d-base" value="${esc(data.baseOrigin || '')}" placeholder="배차 출발지와 같은 명칭">`)}
          ${field('가능 상품분류 (쉼표 구분)', `<input class="input" id="d-classes" value="${esc((data.supportedClasses || []).join(', '))}" placeholder="세단, SUV, 대형SUV">`)}
          ${field('운행 가능 시작', `<input class="input" type="time" id="d-from" value="${esc(data.availableFrom || '')}">`)}
          ${field('운행 가능 종료', `<input class="input" type="time" id="d-to" value="${esc(data.availableTo || '')}">`)}
          <div class="full insight">운행 스케줄: ${esc(scheduleLabel(data))} · 날짜별 출근·휴무는 ‘기사 스케줄’ 메뉴에서 설정하세요.</div>
          ${field('입사일', `<input class="input" type="date" id="d-joined" value="${esc(data.joinedAt)}">`)}
          ${field('활동 상태', `<select class="select" id="d-status"><option value="active" ${data.status === 'active' ? 'selected' : ''}>활동</option><option value="inactive" ${data.status !== 'active' ? 'selected' : ''}>비활동</option></select>`)}
          <div class="full">
            <label class="small strong" style="font-size:11px;color:var(--muted)">선호 권역</label>
            <div class="chips" style="margin-top:6px" id="pref-chips">${REGIONS.map((r) => `<button type="button" class="chip-toggle ${prefSet.has(r) ? 'on' : ''}" data-pref="${r}">${r}</button>`).join('')}</div>
          </div>
          <div class="full">
            <label class="small strong" style="font-size:11px;color:var(--muted)">기피 권역</label>
            <div class="chips" style="margin-top:6px" id="avoid-chips">${REGIONS.map((r) => `<button type="button" class="chip-toggle ${avoidSet.has(r) ? 'on' : ''}" data-avoid="${r}">${r}</button>`).join('')}</div>
          </div>
          ${field('배차판 별칭', `<input class="input" id="d-aliases" value="${esc((data.aliases || []).join(', '))}" placeholder="예: 김민준개별, 김민준(경기)">`, { full: true, help: '쉼표로 구분 · 배차판의 운전자명과 자동 매칭됩니다.' })}
          ${field('메모', `<textarea class="textarea" id="d-memo" placeholder="특이사항, 자격, 담당 노선 등">${esc(data.memo)}</textarea>`, { full: true })}
        </div>`,
      foot: `${d ? '<button class="btn btn-danger" id="d-del" style="margin-right:auto">삭제</button>' : ''}
        <button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="d-save">저장</button>`,
      onMount(_el, _close) {
        _el.querySelectorAll('[data-pref]').forEach((b) => b.onclick = () => { b.classList.toggle('on'); prefSet.has(b.dataset.pref) ? prefSet.delete(b.dataset.pref) : prefSet.add(b.dataset.pref); });
        _el.querySelectorAll('[data-avoid]').forEach((b) => b.onclick = () => { b.classList.toggle('on'); avoidSet.has(b.dataset.avoid) ? avoidSet.delete(b.dataset.avoid) : avoidSet.add(b.dataset.avoid); });
        _el.querySelector('#d-save').onclick = async () => {
          const name = _el.querySelector('#d-name').value.trim();
          if (!name) return toast('기사 이름을 입력하세요.', 'warn');
          const dup = state.drivers.find((x) => norm(x.name) === norm(name) && x.id !== d?.id);
          if (dup) return toast('같은 이름의 기사가 이미 있습니다. 별칭을 사용하세요.', 'warn');
          await saveDriver({
            ...(d || {}),
            name,
            skillLevel: num(_el.querySelector('#d-skill').value), baseOrigin: _el.querySelector('#d-base').value.trim(), supportedClasses: _el.querySelector('#d-classes').value.split(',').map(s=>s.trim()).filter(Boolean), availableFrom: _el.querySelector('#d-from').value, availableTo: _el.querySelector('#d-to').value,
            phone: _el.querySelector('#d-phone').value.trim(),
            vehicleNo: _el.querySelector('#d-vehicle').value.trim(),
            type: _el.querySelector('#d-type').value,
            joinedAt: _el.querySelector('#d-joined').value,
            status: _el.querySelector('#d-status').value,
            preferred: [...prefSet],
            avoid: [...avoidSet],
            aliases: _el.querySelector('#d-aliases').value.split(',').map((s) => s.trim()).filter(Boolean),
            memo: _el.querySelector('#d-memo').value.trim(),
          });
          _close();
          toast('기사 정보를 저장했습니다.', 'success');
          renderDrivers(view);
        };
        if (d) _el.querySelector('#d-del').onclick = async () => {
          if (!(await confirmBox(`${d.name} 기사를 삭제할까요? 배차 이력은 유지됩니다.`, { title: '기사 삭제', ok: '삭제', danger: true }))) return;
          await deleteDriver(d.id);
          _close();
          toast('삭제했습니다.', 'success');
          renderDrivers(view);
        };
      },
    });
  }

  function openAutoRegister() {
    const unknown = driversFromDispatch();
    if (!unknown.length) return toast('배차판의 모든 기사가 이미 등록되어 있습니다.', 'success');
    const selected = new Set(unknown.map((u) => u.name));
    openModal({
      title: '배차판에서 기사 자동 등록',
      sub: `배차판에만 있는 운전자 ${unknown.length}명을 찾았습니다.`,
      size: 'wide',
      body: `<div class="stack" style="gap:6px;max-height:380px;overflow:auto">
        ${unknown.map((u) => `<label class="file-card" style="cursor:pointer">
          <input type="checkbox" data-name="${esc(u.name)}" checked style="width:15px;height:15px;accent-color:#1487c9">
          <span class="meta"><strong>${esc(u.name)}</strong><small>${nf(u.count)}대 · 최근 ${esc(u.lastDate)} · ${esc(u.plates.slice(0, 2).join(', ') || '차량 미상')}</small></span>
        </label>`).join('')}
      </div>
      <div class="tiny muted" style="margin-top:8px">등록 후 기사 관리에서 연락처·선호 권역을 보완하세요.</div>`,
      foot: `<button class="btn btn-ghost" data-close>취소</button><button class="btn btn-primary" id="auto-ok">선택 등록</button>`,
      onMount(el, close) {
        el.querySelectorAll('[data-name]').forEach((cb) => cb.onchange = () => { cb.checked ? selected.add(cb.dataset.name) : selected.delete(cb.dataset.name); });
        el.querySelector('#auto-ok').onclick = async () => {
          const n = await registerDriversFromDispatch([...selected]);
          close();
          toast(`${n}명을 등록했습니다.`, 'success');
          renderDrivers(view);
        };
      },
    });
  }

  $('#btn-add').onclick = () => openEditor();
  $('#btn-auto').onclick = openAutoRegister;
  $('#btn-export').onclick = () => {
    const rows = [['이름', '연락처', '차량번호', '유형', '상태', '선호권역', '기피권역', '등급', '점수', '6개월운송', '근무일', '사고']];
    for (const d of state.drivers) {
      const s = scoreMap.get(norm(d.name));
      rows.push([d.name, d.phone, d.vehicleNo, d.type, d.status, (d.preferred || []).join('/'), (d.avoid || []).join('/'), s?.grade || '', s?.total || 0, s?.count || 0, s?.days || 0, s?.incidents || 0]);
    }
    exportXlsx({ 기사: rows }, 'M&M_기사목록.xlsx');
  };
  $('#f-q').addEventListener('input', debounce((e) => { ui.q = e.target.value; renderRows(); }, 180));
  $('#f-status').addEventListener('change', (e) => { ui.status = e.target.value; renderRows(); });

  renderRows();
}
