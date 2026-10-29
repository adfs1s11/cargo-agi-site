import {performancePanel} from '../performance-summary.js';
import {validDate} from '../../core/schedule.js';
import {
  $, esc, icon, nf, num, round, openDrawer, exportXlsx, todayStr, shortDate, norm, dateLabel, gradeOf,
} from '../../core/utils.js';
import { state } from '../../core/data.js';
import { evaluate, periodRange, METRIC_LABELS, GRADE_RANGES } from '../../core/evaluation.js';
import { pageHead, kpi, sectionHead, donutChart, metricBars, banner, statTile, gradePill } from '../components.js';

const GRADE_COLORS = { S: '#d8920a', A: '#0f6fae', B: '#0b8261', C: '#c48215', D: '#cf5a28', F: '#9aa7b8' };

export default function renderEvaluation(view,options={}) {
  let preset=options.preset||'6m',custom=options.custom||null,gradeFilter=options.gradeFilter||'',q=options.q||'',includeHistory=options.includeHistory===true;
  const selectedRange=periodRange(preset,custom);
  if(includeHistory&&preset==='all')for(const r of state.transportHistory||[])if(validDate(r.date)&&r.date<selectedRange.from)selectedRange.from=r.date;
  const ev = evaluate({...selectedRange,includeHistory});

  view.innerHTML = `
    ${pageHead('기사 평가', '운송량·근무일수·효율·다양성·브랜드 참여 6개 지표(100점)로 등급을 산정합니다.', `
      <select class="select select-sm" id="ev-preset">
        <option value="6m" selected>최근 6개월</option>
        <option value="3m">최근 3개월</option>
        <option value="month">이번 달</option>
        <option value="all">전체 기간</option>
        <option value="custom">직접 지정</option>
      </select>
      <button class="btn btn-ghost" id="btn-export">${icon('download')} 내보내기</button>
      <a class="btn btn-ghost" href="#/settings" data-link>${icon('weight')} 기준 설정</a>`)}

    <div class="toolbar" style="margin-bottom:12px"><label class="check"><input id="ev-history" type="checkbox" ${includeHistory?'checked':''}>참고 운송 이력 포함 · 검토용 점수</label><span class="small muted">기본은 운영 배차 + 확정 편성. 참고 이력은 동일 날짜·VIN·구간 중복을 제거하며, 포함 시 검토용 점수로 표시합니다.</span></div>
    <div id="range-box"></div><div class="insight" style="margin-bottom:12px">${includeHistory?'참고 이력 포함 검토용 점수':'운영 배차 기준 점수'} · 기록상 배차 ${nf(ev.performance.total.tripCount)}건 · 편성 정보 미확인 ${nf(ev.performance.total.unclassifiedRecords)}건 · 운영/참고 중복 ${nf(ev.performance.quality.overlap)}건 · 상충 중복 ${nf(ev.performance.quality.conflictingDuplicates)}건 · 복수 상차지 묶음 ${nf(ev.performance.total.mixedOriginTrips)}건 · 식별 정보 미확인 ${nf(ev.performance.quality.missingIdentity)}건. 기존 자료의 1회전 값 ${nf(ev.performance.total.legacyTurnRecords)}건은 과거 자동 입력 가능성이 있어 원본 확인이 필요합니다. 회전 수·적재율은 보조 지표이며 기존 6개 점수 기준에 새 가감점을 추가하지 않습니다.</div>
    <div class="grid grid-4" style="margin-bottom:14px">
      ${kpi({ label: '평가 기사', value: nf(ev.summary.activeDrivers), unit: '명', iconName: 'users', foot: `등록 ${state.drivers.length}명 중` })}
      ${kpi({ label: '평균 점수', value: ev.summary.avgScore, unit: '점', iconName: 'chart', foot: `표준편차·분포는 아래 참조` })}
      ${kpi({ label: 'A등급 이상', value: nf(ev.summary.distribution.S + ev.summary.distribution.A), unit: '명', iconName: 'target', tone: 'good', foot: `S ${ev.summary.distribution.S} · A ${ev.summary.distribution.A}` })}
      ${kpi({ label: '사고·클레임', value: nf(ev.summary.incidents), unit: '건', iconName: 'alert', tone: ev.summary.incidents ? 'warn' : '', foot: `비용 ${nf(round(ev.summary.incidentCost / 10000, 0))}만원` })}
    </div>

    <div class="split" style="margin-bottom:16px">
      <div class="card card-pad">
        <div class="row-between" style="margin-bottom:12px">
          <div><h3 style="font-size:14px;font-weight:750">등급 분포</h3><p class="tiny muted" style="margin-top:2px">${dateLabel(ev.from, true)} ~ ${dateLabel(ev.to, true)}</p></div>
          <span class="badge gray">${ev.spanDays}일 기준</span>
        </div>
        ${donutChart(GRADE_RANGES.map(([g, min, label]) => ({ label: `${g} · ${label}`, value: ev.summary.distribution[g], color: GRADE_COLORS[g] })).filter((s) => s.value > 0), { size: 128, thickness: 14, center: nf(ev.summary.activeDrivers), centerSub: '평가 기사' })}
        <div class="divider"></div>
        <div class="grid grid-4" style="gap:7px">
          ${statTile('총 운송', `${nf(ev.summary.totalVolume)}<span class="small muted">대</span>`, '')}
          ${statTile('기준 환산', ev.factor === 1 ? '6개월' : `${Math.round(ev.factor * 100)}%`, ev.factor === 1 ? '고정 기준' : '기간 비례')}
          ${statTile('도착지 다양성', `${round(ev.results.filter((r) => r.count).reduce((s, r) => s + r.destRatio, 0) / Math.max(1, ev.summary.activeDrivers), 2)}`, '평균 비율')}
          ${statTile('사고 비용', `${nf(round(ev.summary.incidentCost / 10000, 0))}만`, '감점 반영')}
        </div>
      </div>
      <div class="card card-pad">
        <h3 style="font-size:14px;font-weight:750;margin-bottom:9px">평가 기준</h3>
        <div class="small muted" style="line-height:1.7">
          <div class="row-between" style="padding:4px 0"><span>운송량 · 25점</span><b>${nf(round(ev.standards.volume, 0))}대</b></div>
          <div class="row-between" style="padding:4px 0"><span>근무 지속성 · 20점</span><b>${nf(round(ev.standards.days, 0))}일 + 장기 가점</b></div>
          <div class="row-between" style="padding:4px 0"><span>효율성 · 20점</span><b>${ev.standards.perDay}대/일</b></div>
          <div class="row-between" style="padding:4px 0"><span>도착지 다양성 · 20점</span><b>${ev.standards.destRatio}</b></div>
          <div class="row-between" style="padding:4px 0"><span>거래처 다양성 · 10점</span><b>${ev.standards.customers}곳</b></div>
          <div class="row-between" style="padding:4px 0"><span>브랜드 참여 · 5점</span><b>${Math.round(ev.standards.brandRatio * 100)}%</b></div>
        </div>
        <div class="insight" style="margin-top:10px">${icon('info')}<div>선택 기간에 맞춰 운송량·근무일 기준을 비례 환산합니다. 6개월은 원래 기준 그대로입니다.</div></div>
      </div>
    </div>

    <div class="toolbar" style="margin-bottom:12px">
      <div class="search">${icon('search')}<input id="ev-q" type="search" placeholder="기사 이름 검색"></div>
      <select class="select select-sm" id="ev-grade"><option value="">전체 등급</option>${GRADE_RANGES.map(([g, , l]) => `<option value="${g}">${g} · ${l}</option>`).join('')}</select>
      <div style="flex:1"></div>
      <span class="small muted" id="ev-cnt"></span>
    </div>
    <div class="table-wrap">
      <div class="table-scroll">
        <table class="data">
          <thead><tr>
            <th style="width:44px" class="num">순위</th><th>기사</th><th>등급</th><th class="num">총점</th>
            <th class="num">운송</th><th class="num">근무일</th><th class="num">일평균</th><th class="num">기록상 배차</th><th class="num">회전당 / 미확인</th><th class="num">도착지</th>
            <th class="num">사고</th><th class="num">감점</th><th style="width:100px">점수</th>
          </tr></thead>
          <tbody id="ev-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const rangeBox = $('#range-box');
  const drawRange = () => {
    if (preset !== 'custom') { rangeBox.innerHTML = ''; return; }
    rangeBox.innerHTML = `<div class="toolbar" style="margin-bottom:12px">
      <span class="small muted">기간</span>
      <input class="input input-sm" type="date" id="ev-from" value="${custom?.from || ev.from}">
      <span class="muted">~</span>
      <input class="input input-sm" type="date" id="ev-to" value="${custom?.to || ev.to}">
      <button class="btn btn-sm btn-primary" id="ev-apply">적용</button>
    </div>`;
    $('#ev-apply').onclick = () => {
      custom = { from: $('#ev-from').value, to: $('#ev-to').value };
      renderEvaluation(view,{preset,custom,gradeFilter,q,includeHistory});
    };
  };
  drawRange();

  const rows = () => {
    let list = ev.results.filter((r) => r.count > 0 || r.incidents > 0);
    if (gradeFilter) list = list.filter((r) => r.grade === gradeFilter);
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
    return list;
  };

  const drawRows = () => {
    const list = rows();
    $('#ev-cnt').textContent = `${list.length}명`;
    const tbody = $('#ev-body');
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="13"><div class="empty"><div class="icon">${icon('chart')}</div><h4>평가 대상 기사가 없습니다</h4><p>배차판을 업로드하면 기사별 실적이 자동 집계됩니다.</p></div></td></tr>`;
      return;
    }
    const rankBase = new Map(ev.results.map((r, i) => [r.driverKey, i + 1]));
    tbody.innerHTML = list.map((r) => {
      const rank = rankBase.get(r.driverKey);
      const pctWidth = Math.min(100, r.total);
      return `<tr class="clickable ${rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : ''}" data-driver-key="${esc(r.driverKey)}">
        <td class="num"><b>${rank}</b></td>
        <td><div class="row" style="gap:7px"><span class="grade ${r.grade}">${r.grade}</span><div><div class="t-title">${esc(r.name)}</div><div class="tiny muted">${esc(r.vehicleNo || '-')} · ${esc(r.type)}</div></div></div></td>
        <td><span class="badge ${r.grade === 'S' ? 'amber' : r.grade === 'A' ? 'blue' : r.grade === 'B' ? 'green' : r.grade === 'F' ? 'gray' : 'gray'}">${r.grade}</span></td>
        <td class="num"><b style="font-size:13.5px">${r.total}</b></td>
        <td class="num">${nf(r.count)}<span class="tiny muted">대</span></td>
        <td class="num">${nf(r.days)}</td>
        <td class="num">${r.avgPerDay}</td><td class="num">${nf(r.turns)}건</td><td class="num">${r.performance?.avgPerTrip??'-'}대<div class="tiny muted">미확인 ${nf(r.performance?.unclassifiedRecords||0)}건</div></td>
        <td class="num">${nf(r.destinations)}</td>
        <td class="num">${r.incidents ? `<span class="badge red">${r.incidents}</span>` : '<span class="muted">0</span>'}</td>
        <td class="num">${r.penalty ? `<span class="text-red">-${r.penalty}</span>` : '-'}</td>
        <td><div class="metric-bar"><span style="width:${pctWidth}%;background:linear-gradient(90deg,#5fc1ec,#1487c9)"></span></div></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('tr[data-driver-key]').forEach((tr) => tr.onclick = () => {
      const r = ev.results.find((x) => x.driverKey === tr.dataset.driverKey);
      if (r) openDetail(r);
    });
  };

  function openDetail(r) {
    openDrawer({
      title: r.name,
      sub: `${r.grade}등급 · ${r.total}점 · ${dateLabel(ev.from)} ~ ${dateLabel(ev.to)}`,
      wide: true,
      body: `
        <div class="driver-hero">
          <div class="avatar-lg">${esc(r.name.slice(0, 1))}</div>
          <div class="info"><strong>${esc(r.name)}</strong><small>${esc(r.vehicleNo || '차량 미지정')} · ${esc(r.type)} · ${esc(r.phone || '연락처 없음')}</small></div>
          <div class="score"><b>${r.total}</b><small>${r.grade}등급 · ${r.days}일 근무</small></div>
        </div>
        <div class="card card-pad" style="margin-top:14px">
          <div class="row-between" style="margin-bottom:10px"><strong style="font-size:12.5px">지표별 점수</strong><span class="tiny muted">감점 ${r.penalty}점</span></div>
          <div class="stack" style="gap:10px">${metricBars(r.subscores, state.settings.eval.weights, METRIC_LABELS)}</div>
        </div>
        <div class="grid grid-2" style="gap:7px;margin-top:12px">
          ${statTile('총 운송', `${nf(r.count)}대`, `기록상 ${nf(r.turns)}배차`)}
          ${statTile('근무일', `${nf(r.days)}일`, `일평균 ${r.avgPerDay}대`)}
          ${statTile('도착지', `${nf(r.destinations)}곳`, `비율 ${r.destRatio}`)}
          ${statTile('거래처', `${nf(r.customers)}곳`, `브랜드 ${r.brands}개`)}
        </div>
        ${performancePanel(r.performance,'선택한 평가 자료의 회전별 지표')}${!includeHistory?performancePanel(r.historyPerformance,'참고 이력 포함 · 별도 검토용'):''}
        ${r.incidentList?.length ? `<div class="section"><div class="section-head"><h3>사고·클레임</h3><span class="hint">${r.incidentList.length}건 · ${nf(r.incidentCost)}원</span></div>${r.incidentList.map((i) => `<div class="file-card" style="margin-bottom:6px"><span class="badge ${i.type === '사고' ? 'red' : 'purple'}">${esc(i.type)}</span><div class="meta"><strong>${esc(i.description)}</strong><small>${shortDate(i.date)} · ${esc(i.severity)}</small></div></div>`).join('')}</div>` : ''}
        ${r.recent?.length ? `<div class="section"><div class="section-head"><h3>최근 배차</h3></div>${r.recent.slice(0, 8).map((t) => `<div class="row" style="justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line-2);gap:8px"><div style="flex:1;min-width:0"><div class="small strong" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.destination || '-')}</div><div class="tiny muted">${shortDate(t.date)} · ${esc(t.customer || '')}</div></div><span class="tag">${nf(num(t.count) || 1)}대</span></div>`).join('')}</div>` : ''}
      `,
      foot: `<a class="btn btn-ghost" href="#/drivers" data-link>기사 관리</a><button class="btn btn-primary" data-close>닫기</button>`,
    });
  }

  $('#ev-preset').value=preset;
  $('#ev-history').onchange=e=>{includeHistory=e.target.checked;renderEvaluation(view,{preset,custom,gradeFilter,q,includeHistory});};
  $('#ev-preset').addEventListener('change', (e) => {
    preset = e.target.value;
    if (preset !== 'custom') custom = null;
    renderEvaluation(view,{preset,custom,gradeFilter,q,includeHistory});
  });
  $('#ev-q').addEventListener('input', (e) => { q = e.target.value; drawRows(); });
  $('#ev-grade').addEventListener('change', (e) => { gradeFilter = e.target.value; drawRows(); });
  $('#btn-export').onclick = () => {
    const rowsOut = [['순위', '기사', '등급', '총점', '운송대수', '근무일', '일평균', '도착지', '거래처', '브랜드', '사고', '감점', '운송량점수', '근무점수', '효율점수', '도착지다양성', '거래처다양성', '브랜드참여','기록상배차건수','회전당운송','편성미확인건수','회전확인률','한도기록적재율','자료기준']];
    rows().forEach((r, i) => rowsOut.push([i + 1, r.name, r.grade, r.total, r.count, r.days, r.avgPerDay, r.destinations, r.customers, r.brands, r.incidents, r.penalty, r.subscores.volume, r.subscores.continuity, r.subscores.efficiency, r.subscores.destVariety, r.subscores.customerVariety, r.subscores.brand,r.turns,r.performance?.avgPerTrip??'',r.performance?.unclassifiedRecords||0,r.performance?.coverage||0,r.performance?.utilization??'',includeHistory?'참고이력포함검토용':'운영배차및확정편성']));
    exportXlsx({ '기사평가': rowsOut }, `M&M_기사평가_${ev.from}_${ev.to}.xlsx`);
  };
  drawRows();
}
