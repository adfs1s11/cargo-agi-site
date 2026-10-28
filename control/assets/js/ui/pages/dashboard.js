import { icon, nf, num, dateLabel, addDays, todayStr, round, esc, regionOf, shortDate, confirmBox, toast } from '../../core/utils.js';
import { state, rowsOn, hasDriver, isCounted, plannedOverlay, clearDemoData, saveSettings } from '../../core/data.js';
import { pageHead, kpi, barChart, statTile } from '../components.js';

export function dashboardBrand(row) {
  const customer=String(row.customer || '').replace(/\s/g,'').toUpperCase();
  if (/메르세데스벤츠코리아|MERCEDESBENZKOREA|^MBK$/.test(customer)) return 'MBK';
  if (/삼성SDS|SAMSUNGSDS/.test(customer)) return 'TESLA';
  if (!/지에스글로벌|GS글로벌|GSGLOBAL/.test(customer)) return '기타';
  const model=String(row.model || '').toUpperCase();
  const matches=[
    ['VOLVO', /VOLVO|볼보|\b(?:XC|EX|EC|S|V)\s?(?:30|40|60|90)\b/],
    ['POLSTAR', /POLE?STAR|폴스타/],
    ['BYD', /\bBYD\b|비와이디|ATTO|아토|DOLPHIN|돌핀|SEAL|씰|실라이언|SEALION/],
  ].filter(([,rx])=>rx.test(model));
  return matches.length===1 ? matches[0][0] : '기타';
}


export default function renderDashboard(view) {
  const date = state.workdate || todayStr();
  const rows = rowsOn(date);
  const counted = rows.filter(isCounted);
  const overlay = plannedOverlay(date);
  const orders = counted.reduce((s, r) => s + (num(r.count) || 1), 0);
  const assignedRows = counted.filter((r) => hasDriver(r) || overlay.has(r.id));
  const assigned = assignedRows.reduce((s, r) => s + (num(r.count) || 1), 0);
  const unassignedRows = counted.filter((r) => !hasDriver(r) && !overlay.has(r.id));
  const unassigned = unassignedRows.reduce((s, r) => s + (num(r.count) || 1), 0);
  const plannedCount = counted.filter((r) => !hasDriver(r) && overlay.has(r.id)).reduce((s, r) => s + (num(r.count) || 1), 0);
  const driverLoads = new Map();
  const customers = new Map();
  for (const r of counted) {
    const units = num(r.count) || 1;
    const customer = r.customer || '거래처 미입력';
    customers.set(customer, (customers.get(customer) || 0) + units);
    if (!hasDriver(r) && !overlay.has(r.id)) continue;
    const name = overlay.get(r.id)?.driverName || r.driver;
    const load = driverLoads.get(name) || { name, count: 0, trips: 0 };
    load.count += units;
    load.trips++;
    driverLoads.set(name, load);
  }
  const drivers = [...driverLoads.values()].sort((a, b) => b.count - a.count);
  const topCustomers = [...customers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const excluded = ['cancelled', 'notshipped', 'support'].map((status) => ({
    label: { cancelled: '취소', notshipped: '미출고', support: '지원' }[status],
    count: rows.filter((r) => r.status === status).length,
  }));
  const coverage = orders ? (assigned / orders) * 100 : 0;
  const brands=['MBK','TESLA','VOLVO','POLSTAR','BYD','기타'].map(name=>{
    const entries=counted.filter(r=>dashboardBrand(r)===name);
    const total=entries.reduce((n,r)=>n+(num(r.count)||1),0);
    const allocated=entries.filter(r=>hasDriver(r)||overlay.has(r.id)).reduce((n,r)=>n+(num(r.count)||1),0);
    return {name,total,allocated,pending:total-allocated};
  });

  const recentDays = Array.from({ length: 14 }, (_, i) => addDays(date, i - 13));
  const trend = recentDays.map((d) => {
    const rs = state.dispatch.filter((r) => r.date === d && isCounted(r));
    return { label: shortDate(d), value: rs.reduce((s, r) => s + (num(r.count) || 1), 0), dim: d !== date };
  });
  const maxTrend = Math.max(1, ...trend.map((t) => t.value));

  const regionMap = new Map();
  for (const r of counted) {
    const reg = r.region || regionOf(r.destination);
    regionMap.set(reg, (regionMap.get(reg) || 0) + (num(r.count) || 1));
  }
  const regions = [...regionMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxRegion = Math.max(1, ...regions.map((r) => r[1]));

  const alerts = [];
  if (!rows.length) alerts.push({ tone: 'red', text: `${dateLabel(date)} 배차 데이터가 없습니다. 배차판을 업로드하세요.`, hash: '#/board' });
  else if (unassigned) alerts.push({ tone: 'amber', text: `미배차 ${nf(unassigned)}대 · ${nf(unassignedRows.length)}건의 담당 기사 배정이 필요합니다.`, hash: '#/assign' });
  if (plannedCount) alerts.push({ tone: 'amber', text: `확정 가배차 ${nf(plannedCount)}대가 배정 현황에 포함되어 있습니다.`, hash: '#/assign' });

  view.innerHTML = `
    <div class="dispatch-dashboard">
    ${pageHead(`배차 현황`, `${dateLabel(date, true)} 기준 · 배정 현황과 확인할 배차를 한눈에 확인하세요.`, `
      <a class="btn btn-ghost" href="#/board" data-link>${icon('upload')} 배차판 업로드</a>
      <a class="btn btn-primary" href="#/assign" data-link>${icon('route')} 가배차 실행</a>`)}
    ${state.settings.demo ? `<div class="row" style="margin-bottom:14px;gap:8px"><span class="badge amber">샘플 데이터</span><span class="small muted">${state.imports.length ? '샘플이 실제 배차·평가에 함께 집계되고 있습니다.' : '실제 운영 전 샘플을 지우고 배차판을 업로드하세요.'}</span><button class="btn btn-xs btn-ghost" id="quick-clear-demo" style="margin-left:auto">샘플 삭제</button></div>` : ''}
    ${alerts.length ? `<div class="grid" style="gap:8px;margin-bottom:16px">${alerts.slice(0, 4).map((a) => `
      <a href="${a.hash}" data-link class="row" style="gap:8px;padding:9px 12px;border-radius:10px;background:${a.tone === 'red' ? '#fff5f5' : '#fffaf2'};border:1px solid ${a.tone === 'red' ? '#f6dada' : '#f3e4cd'};font-size:14px;color:${a.tone === 'red' ? '#a92d32' : '#8a5a12'}">
        ${icon(a.tone === 'red' ? 'warning' : 'bell')} <span style="flex:1">${esc(a.text)}</span>${icon('chevronRight')}
      </a>`).join('')}</div>` : ''}

    <div class="grid grid-4">
      ${kpi({ label: '기준일 배차', value: nf(orders), unit: '대', iconName: 'board', foot: `<b>${nf(counted.length)}</b>건 · 취소·미출고·지원 제외`, tone: '' })}
      ${kpi({ label: '기사 배정', value: nf(assigned), unit: '대', iconName: 'users', tone: 'good', foot: `배정률 <b>${round(coverage, 1)}%</b> · ${assignedRows.length}건${plannedCount ? ` · 가배차 확정 ${nf(plannedCount)}` : ''}` })}
      ${kpi({ label: '미배차', value: nf(unassigned), unit: '대', iconName: 'alert', tone: unassigned ? 'warn' : '', foot: unassigned ? '<a class="link" href="#/assign" data-link>가배차 바로가기 →</a>' : '모든 배차가 배정되었습니다' })}
      ${kpi({ label: '투입 기사', value: nf(drivers.length), unit: '명', iconName: 'users', foot: `배정 ${nf(assignedRows.length)}건 · 확정 가배차 포함` })}
    </div>

    <div class="card section" id="dashboard-brands">
      <div class="card-tight row-between"><h3>브랜드별 운송 현황</h3><span class="small muted">${dateLabel(date)} · 대수 기준</span></div>
      <div class="scroll-x"><table class="data"><thead><tr><th>브랜드</th><th class="num">전체</th><th class="num">배정</th><th class="num">미배차</th><th class="num">배정률</th></tr></thead>
      <tbody>${brands.map(b=>`<tr><td class="t-title">${b.name}</td><td class="num">${nf(b.total)}대</td><td class="num">${nf(b.allocated)}대</td><td class="num">${nf(b.pending)}대</td><td class="num">${b.total?round(b.allocated/b.total*100,1):0}%</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>합계</th><th class="num">${nf(orders)}대</th><th class="num">${nf(assigned)}대</th><th class="num">${nf(unassigned)}대</th><th class="num">${round(coverage,1)}%</th></tr></tfoot></table></div>
      <p class="small muted" style="padding:12px 18px">MBK: 메르세데스벤츠코리아 · TESLA: 삼성SDS · GS: 차종에 따라 VOLVO/POLSTAR/BYD. PH선광 등 그 외 거래처와 GS 차종 미확인·중복 판정 건은 기타로 집계합니다. 취소·미출고·지원 제외.</p>
    </div>

    <div class="split section">
      <div class="stack">
        <div class="card card-pad">
          <div class="row-between" style="margin-bottom:6px">
            <div>
              <h3 style="font-size:18px;font-weight:750">배차 추이</h3>
              <p class="small muted" style="margin-top:2px">최근 14일 · 운송 대수 기준</p>
            </div>
            <div class="row">
              <span class="pill"><span class="dot" style="background:var(--blue)"></span>일별 배차</span>
              <span class="badge gray">기준일 ${nf(trend[trend.length - 1].value)}대</span>
            </div>
          </div>
          <div class="scroll-x" aria-label="최근 14일 배차 추이">${barChart(trend.map((t) => ({ ...t, dim: false, color: t.label === shortDate(date) ? '#0f6fae' : '#639cc2' })), { height: 168 })}</div>
          <div class="row" style="justify-content:space-between;margin-top:10px;font-size:13px;color:var(--muted)">
            <span>최고 ${nf(maxTrend)}대 · 일평균 ${nf(round(trend.reduce((s, t) => s + t.value, 0) / 14, 0))}대</span>
            <span>${shortDate(recentDays[0])} ~ ${shortDate(date)}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-tight row-between">
            <h3 style="font-size:18px;font-weight:750">미배차 · 확인 필요</h3>
            <div class="row">
              <span class="badge ${unassigned ? 'amber' : 'green'}">${nf(unassigned)}대</span>
              <a class="btn btn-sm btn-ghost" href="#/assign" data-link>가배차 열기</a>
            </div>
          </div>
          ${unassignedRows.length ? `
          <div class="scroll-x">
            <table class="data">
              <thead><tr><th>거래처</th><th>도착지</th><th>차종</th><th class="num">대수</th><th>권역</th></tr></thead>
              <tbody>
                ${unassignedRows.slice(0, 6).map((r) => `<tr>
                  <td class="t-title">${esc(r.customer || '-')}</td>
                  <td><div style="max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.destination || '-')}</div></td>
                  <td class="small muted">${esc(r.model || '-')}</td>
                  <td class="num">${nf(num(r.count) || 1)}</td>
                  <td><span class="tag">${esc(r.region || regionOf(r.destination))}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${unassignedRows.length > 6 ? `<div class="table-foot"><span class="small muted">외 ${unassignedRows.length - 6}건</span><a class="link" href="#/assign" data-link>전체 보기 →</a></div>` : ''}
          ` : `<div class="empty" style="padding:34px 20px"><div class="icon">${icon('check')}</div><h4>미배차 건이 없습니다</h4><p>${rows.length ? '모든 운송 건에 기사가 배정되어 있습니다.' : '배차판을 업로드하면 미배차 건이 표시됩니다.'}</p></div>`}
        </div>
      </div>

      <div class="stack">
        <div class="card card-pad">
          <div class="row-between" style="margin-bottom:14px"><h3>배정 현황</h3><span class="badge blue">배정률 ${round(coverage, 1)}%</span></div>
          <div class="progress dispatch-progress" role="progressbar" aria-label="배정률" aria-valuenow="${round(coverage, 1)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${coverage}%"></span></div>
          <div class="grid grid-2" style="margin-top:16px;gap:12px">
            ${statTile('배정 완료', nf(assigned) + '대', '원본 배정 + 확정 가배차')}
            ${statTile('미배차', nf(unassigned) + '대', nf(unassignedRows.length) + '건 담당 기사 배정 필요')}
          </div>
          <div class="divider"></div>
          <div class="row" style="gap:8px;flex-wrap:wrap">${excluded.map((x) => `<span class="pill">${x.label} ${nf(x.count)}건</span>`).join('')}</div>
          <p class="small muted" style="margin-top:10px">취소·미출고·지원 건은 운송 대수에서 제외합니다.</p>
        </div>

        <div class="card card-pad">
          <div class="row-between" style="margin-bottom:10px">
            <h3 style="font-size:18px;font-weight:750">권역별 배차</h3>
            <span class="tiny muted">${dateLabel(date)}</span>
          </div>
          ${regions.length ? regions.map(([name, v]) => `
            <div style="margin-bottom:9px">
              <div class="row-between tiny" style="margin-bottom:3px"><span>${esc(name)}</span><b>${nf(v)}대</b></div>
              <div class="metric-bar"><span style="width:${(v / maxRegion) * 100}%;background:linear-gradient(90deg,#5fc1ec,#1487c9)"></span></div>
            </div>`).join('') : '<div class="small muted">데이터 없음</div>'}
        </div>

        <div class="card card-pad">
          <div class="row-between" style="margin-bottom:12px"><h3>거래처별 배차</h3><a class="link" href="#/board" data-link>배차판 →</a></div>
          ${topCustomers.length ? topCustomers.map(([name, count]) => `<div class="dispatch-list-row"><span>${esc(name)}</span><strong>${nf(count)}대</strong></div>`).join('') : '<p class="muted">배차 데이터가 없습니다.</p>'}
        </div>
      </div>
    </div>
    <div class="section card dispatch-driver-summary">
      <div class="card-tight row-between"><h3>기사별 배정 현황</h3><a class="link" href="#/assign" data-link>가배차 열기 →</a></div>
      ${drivers.length ? `<div class="scroll-x"><table class="data dispatch-driver-table"><thead><tr><th>기사</th><th class="num">배정 건수</th><th class="num">운송 대수</th></tr></thead><tbody>${drivers.slice(0, 10).map((d) => `<tr><td class="t-title">${esc(d.name)}</td><td class="num">${nf(d.trips)}건</td><td class="num"><strong>${nf(d.count)}대</strong></td></tr>`).join('')}</tbody></table></div>${drivers.length > 10 ? `<div class="table-foot"><span class="muted">상위 10명 표시 · 전체 ${nf(drivers.length)}명</span><a class="link" href="#/board" data-link>전체 배차 보기 →</a></div>` : ''}` : '<div class="empty"><h4>배정된 기사가 없습니다</h4><p>가배차에서 담당 기사를 배정하세요.</p></div>'}
    </div>
    </div>
  `;
  view.querySelector('#quick-clear-demo')?.addEventListener('click', async () => {
    if (!(await confirmBox('샘플 배차·기사·차량·상품·사고를 삭제할까요? 직접 올린 데이터는 유지됩니다.', { title: '샘플 삭제', ok: '삭제', danger: true }))) return;
    await clearDemoData();
    await saveSettings({ demo: false });
    toast('샘플 데이터를 삭제했습니다. 배차판을 업로드하세요.', 'success');
    renderDashboard(view);
  });
}

