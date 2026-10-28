import {sharedOnlineMode} from '../../core/shared-auth.js';
import {
  $, $$, esc, icon, nf, num, readFile, downloadJson, toast, openModal, confirmBox, timeAgo, todayStr, round,
} from '../../core/utils.js';
import { state, saveSettings, clearDemoData, seedDemo, reloadAll, resetEverything } from '../../core/data.js';
import * as db from '../../core/db.js';
import { ping, pushAll, pullAll } from '../../core/google.js';
import { photoUsage, cleanupPhotos } from '../../core/photos.js';
import { pageHead, field, banner, sectionHead } from '../components.js';
import { renderSidebar, updateStorage } from '../shell.js';

const TABS = [
  ['general', '브랜드·데이터'],
  ['eval', '평가 기준'],
  ['assign', '가배차 기준'],
  ['google', 'Google Sheets'],
  ['storage', '저장공간·사진'],
];

export default function renderSettings(view, ctx = {}) {
  let tab = ctx.tab || 'general';
  const s = state.settings;

  view.innerHTML = `
    ${pageHead('설정 · 연동', '평가·가배차 기준과 데이터 보관 방식을 관리합니다.', `
      <button class="btn btn-ghost" id="btn-backup">${icon('download')} 전체 백업</button>
      <button class="btn btn-ghost" id="btn-restore">${icon('upload')} 복원</button>`)}
    <div class="tabs" id="tabs">
      ${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div id="tab-body"></div>
  `;

  const body = $('#tab-body');
  const draw = async () => {
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'general') drawGeneral();
    if (tab === 'eval') drawEval();
    if (tab === 'assign') drawAssign();
    if (tab === 'google') drawGoogle();
    if (tab === 'storage') drawStorage();
  };

  /* ---------------- 일반 ---------------- */
  function drawGeneral() {
    body.innerHTML = `
      <div class="split">
        <div class="stack">
          <div class="card card-pad">
            <div class="section-head"><h3>회사 정보</h3></div>
            <div class="form-grid">
              ${field('회사명', `<input class="input" id="s-company" value="${esc(s.company)}">`)}
              ${field('데이터 모드', `<div class="row" style="height:34px"><span class="badge ${s.demo ? 'amber' : 'green'}">${s.demo ? '샘플 데이터 포함' : '실데이터'}</span></div>`)}
            </div>
            <div class="divider"></div>
            <div class="row-between" style="align-items:flex-start;gap:16px">
              <div>
                <div class="small strong">회사 로고</div>
                <div class="tiny muted" style="margin-top:3px">사이드바·인쇄·모바일 화면에 사용됩니다. PNG/SVG, 1MB 이하.</div>
                <div class="row" style="margin-top:9px">
                  <button class="btn btn-sm btn-ghost" id="logo-upload">${icon('upload')} 로고 변경</button>
                  <button class="btn btn-sm btn-ghost" id="logo-reset">기본 로고</button>
                  <input type="file" id="logo-file" accept="image/*" class="hidden">
                </div>
              </div>
              <div style="width:150px;padding:10px;border:1px solid var(--line);border-radius:10px;background:#f8fafd;text-align:center">
                <img src="${s.logo || 'assets/logo.png'}" style="max-height:52px;max-width:100%">
              </div>
            </div>
            <div class="row" style="margin-top:16px"><button class="btn btn-primary" id="s-save-general">${icon('check')} 저장</button></div>
          </div>

          <div class="card card-pad" style="border-color:#f0d4d6">
            <div class="section-head"><h3 style="color:#a92d32">데이터 초기화</h3></div>
            <p class="small muted" style="line-height:1.65">이 브라우저에 저장된 배차·기사·차량·사고·가배차를 모두 삭제합니다. 먼저 <b>전체 백업</b>을 받아 두세요.</p>
            <button class="btn btn-danger" id="btn-reset-all" style="margin-top:12px">${icon('warning')} 모든 데이터 삭제</button>
          </div>
        </div>
        <div class="stack">
          <div class="card card-pad">
            <h3 style="font-size:13.5px;font-weight:750;margin-bottom:9px">현재 데이터</h3>
            ${[
              ['배차 원장', nf(state.dispatch.length) + '건'], ['기사', nf(state.drivers.length) + '명'],
              ['운송차량', nf(state.equipment.length) + '대'], ['상품차량', nf(state.products.length) + '개'],
              ['사고·클레임', nf(state.incidents.length) + '건'], ['안전점검', nf(state.safety.length) + '대'], ['가져오기 이력', nf(state.imports.length) + '건'],
            ].map(([k, v]) => `<div class="row-between" style="padding:6px 0;border-bottom:1px solid var(--line-2)"><span class="small muted">${k}</span><b class="small">${v}</b></div>`).join('')}
          </div>
          <div class="insight">${icon('lock')}<div><b>저장 위치</b> — ${sharedOnlineMode()?'업무 자료는 로그인한 직원들이 같은 온라인 공용 원장을 사용합니다. 화면 위 저장 상태를 확인하세요. 인터넷 연결이 끊기거나 저장 충돌이 발생하면 수정 내용은 이 PC에 대기합니다.':'현재는 브라우저별 저장입니다. 온라인 공용 원장 전환 전 자료를 백업해 주세요.'}</div></div>
        </div>
      </div>`;

    $('#logo-upload').onclick = () => $('#logo-file').click();
    $('#logo-file').onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > 1024 * 1024) return toast('1MB 이하 이미지를 사용하세요.', 'warn');
      const dataUrl = await readFile(f, 'dataUrl');
      await saveSettings({ logo: dataUrl });
      toast('로고를 변경했습니다.', 'success');
      drawGeneral();
      renderSidebar('settings');
    };
    $('#logo-reset').onclick = async () => { await saveSettings({ logo: '' }); drawGeneral(); renderSidebar('settings'); };
    $('#s-save-general').onclick = async () => {
      await saveSettings({ company: $('#s-company').value.trim() || 'M&M통운' });
      toast('저장했습니다.', 'success');
    };
    $('#btn-reset-all').onclick = async () => {
      if (!(await confirmBox('모든 데이터를 삭제합니다. 되돌릴 수 없습니다. 계속할까요?', { title: '전체 삭제', ok: '삭제', danger: true }))) return;
      if (!(await confirmBox('마지막 확인입니다. 정말 삭제하시겠습니까?', { title: '마지막 확인', ok: '모두 삭제', danger: true }))) return;
      await resetEverything();
      location.reload();
    };
  }

  /* ---------------- 평가 ---------------- */
  function drawEval() {
    const e = s.eval;
    body.innerHTML = `
      <div class="split">
        <div class="card card-pad">
          <div class="section-head"><h3>배점 (100점)</h3><span class="hint" id="weight-sum"></span></div>
          <div class="stack" style="gap:8px">
            ${Object.entries({ volume: '운송량', continuity: '근무 지속성', efficiency: '효율성', destVariety: '도착지 다양성', customerVariety: '거래처 다양성', brand: '브랜드 참여도' }).map(([k, label]) => `
              <div class="row" style="gap:10px">
                <span class="small" style="width:110px">${label}</span>
                <input class="input input-sm" type="number" min="0" max="100" step="1" data-w="${k}" value="${e.weights[k]}" style="width:80px">
                <span class="tiny muted">점</span>
              </div>`).join('')}
          </div>
          <div class="divider"></div>
          <div class="section-head"><h3>기준값 (6개월)</h3><span class="hint">상위 25% 중앙값 기준</span></div>
          <div class="form-grid">
            ${field('운송량 기준 (대)', `<input class="input" type="number" id="std-volume" value="${e.standards.volume}">`)}
            ${field('근무일 기준 (일)', `<input class="input" type="number" id="std-days" value="${e.standards.days}">`)}
            ${field('일평균 기준 (대/일)', `<input class="input" type="number" step="0.1" id="std-perday" value="${e.standards.perDay}">`)}
            ${field('도착지 다양성 기준', `<input class="input" type="number" step="0.001" id="std-dest" value="${e.standards.destRatio}">`)}
            ${field('거래처 다양성 기준 (곳)', `<input class="input" type="number" id="std-cust" value="${e.standards.customers}">`)}
            ${field('브랜드 참여 기준', `<input class="input" type="number" step="0.001" id="std-brand" value="${e.standards.brandRatio}">`)}
          </div>
          <div class="divider"></div>
          <div class="section-head"><h3>가점·감점</h3></div>
          <div class="form-grid">
            ${field('100일 이상 가점', `<input class="input" type="number" step="0.5" id="bonus-100" value="${e.bonus.d100}">`)}
            ${field('80일 이상 가점', `<input class="input" type="number" step="0.5" id="bonus-80" value="${e.bonus.d80}">`)}
            ${field('60일 이상 가점', `<input class="input" type="number" step="0.5" id="bonus-60" value="${e.bonus.d60}">`)}
            ${field('취소율 감점 계수', `<input class="input" type="number" step="0.1" id="pen-cancel" value="${e.penalties.cancelRate}">`, { help: '취소율 × 계수' })}
            ${field('사고 감점 (상)', `<input class="input" type="number" step="0.5" id="pen-high" value="${e.penalties.incident.상}">`)}
            ${field('사고 감점 (중)', `<input class="input" type="number" step="0.5" id="pen-mid" value="${e.penalties.incident.중}">`)}
            ${field('사고 감점 (하)', `<input class="input" type="number" step="0.5" id="pen-low" value="${e.penalties.incident.하}">`)}
            ${field('비용 감점 (1만원당)', `<input class="input" type="number" step="0.05" id="pen-cost" value="${e.penalties.costPer10k}">`)}
          </div>
          <label class="switch" style="margin-top:12px"><input type="checkbox" id="prorate" ${e.prorate ? 'checked' : ''}><span class="track"></span>선택 기간에 맞춰 기준값 비례 환산 (6개월 고정 기준 사용 시 끄기)</label>
          <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="save-eval">${icon('check')} 평가 기준 저장</button></div>
        </div>
        <div class="stack">
          <div class="card card-pad">
            <h3 style="font-size:13.5px;font-weight:750;margin-bottom:8px">등급 구간</h3>
            ${[['S', '90점 이상', '최우수'], ['A', '80~89점', '우수'], ['B', '70~79점', '양호'], ['C', '60~69점', '보통'], ['D', '50~59점', '미흡'], ['F', '50점 미만', '개선 필요']].map(([g, r, l]) => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line-2)"><span class="row" style="gap:7px"><span class="grade ${g}">${g}</span><span class="small">${l}</span></span><span class="small muted">${r}</span></div>`).join('')}
          </div>
          <div class="insight warn">${icon('warning')}<div>배점 합계가 100점이 아니어도 계산되지만, 공지된 기준과 일치시키려면 100점으로 맞추세요. 변경 후 기사 평가 화면에서 즉시 재계산됩니다.</div></div>
        </div>
      </div>`;

    const sum = () => {
      const total = $$('[data-w]').reduce((a, b) => a + (num(b.value) || 0), 0);
      $('#weight-sum').innerHTML = `<span class="${total === 100 ? 'text-green' : 'text-orange'}">합계 ${total}점</span>`;
    };
    $$('[data-w]').forEach((i) => i.addEventListener('input', sum));
    sum();
    $('#save-eval').onclick = async () => {
      const weights = {};
      $$('[data-w]').forEach((i) => { weights[i.dataset.w] = Math.min(100, Math.max(0, num(i.value))); });
      await saveSettings({
        eval: {
          weights,
          standards: {
            volume: num($('#std-volume').value), days: num($('#std-days').value), perDay: num($('#std-perday').value),
            destRatio: num($('#std-dest').value), customers: num($('#std-cust').value), brandRatio: num($('#std-brand').value),
          },
          bonus: { d100: num($('#bonus-100').value), d80: num($('#bonus-80').value), d60: num($('#bonus-60').value) },
          penalties: {
            cancelRate: num($('#pen-cancel').value),
            incident: { 상: num($('#pen-high').value), 중: num($('#pen-mid').value), 하: num($('#pen-low').value) },
            costPer10k: num($('#pen-cost').value),
          },
          prorate: $('#prorate').checked,
        },
      });
      toast('평가 기준을 저장했습니다.', 'success');
    };
  }

  /* ---------------- 가배차 ---------------- */
  function drawAssign() {
    const a = s.assign;
    body.innerHTML = `
      <div class="split">
        <div class="card card-pad">
          <div class="section-head"><h3>가배차 기본값</h3></div>
          <div class="form-grid">
            ${field('기사 1인 일일 한도 (대)', `<input class="input" type="number" id="a-cap" min="1" max="40" value="${a.maxPerDriver}">`)}
            ${field('사고 이력 감점 계수', `<input class="input" type="number" step="0.01" id="a-inc" value="${a.incidentPenalty}">`)}
            ${field('이력 분석 기간 (일)', `<select class="select" id="a-history">
              ${[[180, '최근 6개월'], [365, '최근 1년'], [730, '최근 2년'], [1095, '최근 3년']].map(([v, l]) => `<option value="${v}" ${Number(a.historyDays) === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>`, { help: '가배차 추천 시 참고할 과거 배차 이력입니다. 데이터가 많을수록 계산이 느려질 수 있습니다.' })}
          </div>
          <div class="divider"></div>
          <div class="section-head"><h3>추천 가중치</h3><span class="hint">합계가 1이 되도록 자동 정규화</span></div>
          <div class="stack" style="gap:10px">
            ${[
              ['historyWeight', '배차 이력', a.historyWeight],
              ['gradeWeight', '평가 등급', a.gradeWeight],
              ['prefWeight', '선호 권역', a.prefWeight],
              ['balanceWeight', '부하 균형', a.balanceWeight],
            ].map(([k, label, v]) => `<div class="row"><span class="small" style="width:90px">${label}</span><input class="input input-sm" type="range" min="0" max="1" step="0.05" data-aw="${k}" value="${v}" style="flex:1"><b class="small num" data-awv="${k}" style="width:34px;text-align:right">${v}</b></div>`).join('')}
          </div>
          <div class="row" style="margin-top:16px"><button class="btn btn-primary" id="save-assign">${icon('check')} 저장</button></div>
        </div>
        <div class="stack">
          <div class="insight">${icon('info')}<div>가배차는 <b>미배차 건</b>을 우선 채우고, 같은 권역·거래처 경험이 많고 평가등급이 높으며 일일 한도에 여유가 있는 기사를 추천합니다. 추천 결과는 <b>가배차 초안</b>으로만 저장되며 원본 배차판은 수정하지 않습니다.</div></div>
          <div class="card card-pad">
            <h3 style="font-size:13.5px;font-weight:750;margin-bottom:8px">안전 원칙</h3>
            <ul class="small muted" style="line-height:1.8;padding-left:4px">
              <li>· 확정 전에는 배차 원장에 반영되지 않습니다.</li>
              <li>· 엑셀 내보내기로 기존 배차판에 붙여넣을 수 있습니다.</li>
              <li>· 기사 한도, 선호·기피 권역, 차량 정비 상태를 함께 확인합니다.</li>
            </ul>
          </div>
        </div>
      </div>`;
    $$('[data-aw]').forEach((r) => r.oninput = () => { $(`[data-awv="${r.dataset.aw}"]`).textContent = r.value; });
    $('#save-assign').onclick = async () => {
      const patch = { assign: { maxPerDriver: num($('#a-cap').value), incidentPenalty: num($('#a-inc').value), historyDays: num($('#a-history').value) || 365 } };
      $$('[data-aw]').forEach((r) => { patch.assign[r.dataset.aw] = num(r.value); });
      await saveSettings(patch);
      toast('가배차 기준을 저장했습니다.', 'success');
    };
  }

  /* ---------------- Google ---------------- */
  function drawGoogle() {
    const g = s.google;
    body.innerHTML = `
      <div class="split">
        <div class="card card-pad">
          <div class="section-head"><h3>Apps Script 웹앱 연동</h3><span class="hint" id="g-status">${g.url ? (g.lastSync ? `최근 동기화 ${timeAgo(g.lastSync)}` : '연결 설정됨') : '미설정'}</span></div>
          ${field('웹앱 URL', `<input class="input" id="g-url" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(g.url)}">`, { help: 'Apps Script를 배포한 뒤 나오는 /exec 주소' })}
          <div style="height:12px"></div>
          ${field('인증 토큰', `<input class="input" id="g-token" type="password" placeholder="32자 이상 임의 문자열" value="${esc(g.token)}">`, { help: 'Code.gs의 TOKEN 값과 동일해야 합니다.' })}
          <div class="tiny muted" style="margin-top:10px">데이터 변경은 이 기기에 먼저 저장됩니다. 여러 기기와 공유하려면 <b>전체 업로드</b>를 주기적으로 실행하세요.</div>
          <div class="row" style="margin-top:16px">
            <button class="btn btn-primary" id="g-save">${icon('check')} 저장</button>
            <button class="btn btn-ghost" id="g-test">${icon('cloud')} 연결 테스트</button>
            <button class="btn btn-ghost" id="g-push">${icon('upload')} 전체 업로드</button>
            <button class="btn btn-ghost" id="g-pull">${icon('download')} 전체 다운로드</button>
          </div>
          <div id="g-progress" style="margin-top:14px"></div>
          <div id="g-result" style="margin-top:10px"></div>
        </div>
        <div class="stack">
          <div class="card card-pad">
            <h3 style="font-size:13.5px;font-weight:750;margin-bottom:8px">설치 순서</h3>
            <ol class="small muted" style="line-height:1.9;padding-left:18px">
              <li>새 Google 스프레드시트를 만듭니다.</li>
              <li>확장 프로그램 → Apps Script에 <code>apps-script/Code.gs</code>를 붙여넣습니다.</li>
              <li>CONFIG의 TOKEN·SPREADSHEET_ID를 채웁니다.</li>
              <li>배포 → 웹앱 (실행: 나, 액세스: 모든 사용자) 후 /exec URL 복사.</li>
              <li>위 URL·토큰을 입력하고 연결 테스트 → 전체 업로드.</li>
            </ol>
            <button class="btn btn-sm btn-ghost" id="g-guide" style="margin-top:10px">${icon('file')} 설치 안내·코드 보기</button>
          </div>
          <div class="insight warn">${icon('warning')}<div>웹앱을 <b>모든 사용자</b>로 배포하면 URL과 토큰을 아는 사람이 접근할 수 있습니다. 토큰을 길게 만들고 외부 공유를 피하세요.</div></div>
        </div>
      </div>`;

    const saveCfg = async () => saveSettings({ google: { url: $('#g-url').value.trim(), token: $('#g-token').value.trim() } });
    $('#g-save').onclick = async () => { await saveCfg(); toast('연동 설정을 저장했습니다.', 'success'); };
    $('#g-test').onclick = async () => {
      await saveCfg();
      const box = $('#g-result');
      box.innerHTML = '<span class="small muted">연결 확인 중…</span>';
      try {
        const data = await ping();
        box.innerHTML = `<div class="insight">${icon('check')}<div><b>연결 성공</b> · ${esc(data.spreadsheetTitle || '')} · 시트 ${nf(data.tabCount || 0)}개</div></div>`;
      } catch (err) {
        box.innerHTML = `<div class="insight warn">${icon('warning')}<div>연결 실패: ${esc(err.message)}</div></div>`;
      }
    };
    const runSync = async (fn, label) => {
      await saveCfg();
      const prog = $('#g-progress');
      prog.innerHTML = `<div class="row-between small"><span>${label}</span><span id="g-pct">0%</span></div><div class="progress" style="margin-top:5px"><span id="g-bar" style="width:0%"></span></div>`;
      try {
        const res = await fn((r, text) => {
          const pct = Math.round(r * 100);
          $('#g-bar').style.width = `${pct}%`;
          $('#g-pct').textContent = `${pct}%`;
          prog.querySelector('.row-between span').textContent = text;
        });
        prog.innerHTML = `<div class="insight">${icon('check')}<div><b>${label} 완료</b><br>${Object.entries(res).map(([k, v]) => `${k}: ${v.pushed ?? v.pulled ?? 0}`).join(' · ')}</div></div>`;
        draw();
      } catch (err) {
        prog.innerHTML = `<div class="insight warn">${icon('warning')}<div>실패: ${esc(err.message)}</div></div>`;
      }
    };
    $('#g-push').onclick = () => runSync(pushAll, '전체 업로드');
    $('#g-pull').onclick = () => runSync(pullAll, '전체 다운로드');
    $('#g-guide').onclick = openGuide;
  }

  async function openGuide() {
    let code = '';
    try { code = await (await fetch('apps-script/Code.gs')).text(); } catch { code = '파일을 불러오지 못했습니다. 프로젝트의 apps-script/Code.gs를 여세요.'; }
    openModal({
      title: 'Google Sheets 연동 설치',
      sub: '5분이면 설정할 수 있습니다.',
      size: 'xwide',
      body: `
        <ol class="small" style="line-height:1.9;padding-left:18px">
          <li>Google Drive에서 새 스프레드시트를 만들고 이름을 <b>M&M 통합관제 원장</b>으로 지정합니다.</li>
          <li>URL에서 <code>/d/</code>와 <code>/edit</code> 사이의 ID를 복사합니다.</li>
          <li>확장 프로그램 → Apps Script → 아래 코드를 붙여넣고, <code>TOKEN</code>과 <code>SPREADSHEET_ID</code>를 수정합니다.</li>
          <li>배포 → 새 배포 → 유형 <b>웹앱</b>, 실행 <b>나</b>, 액세스 <b>모든 사용자</b>로 배포합니다.</li>
          <li>나오는 <b>/exec</b> URL과 TOKEN을 이 화면에 입력합니다.</li>
          <li>[연결 테스트] → [전체 업로드]를 누르면 시트가 자동 생성됩니다.</li>
        </ol>
        <div class="insight warn" style="margin:12px 0">${icon('warning')}<div>토큰은 32자 이상의 임의 문자열로 만드세요. 웹앱 URL과 토큰을 아는 사람은 데이터에 접근할 수 있습니다.</div></div>
        <div class="row" style="margin-bottom:6px"><span class="small strong">Code.gs</span><button class="btn btn-xs btn-ghost" id="copy-code" style="margin-left:auto">${icon('copy')} 복사</button></div>
        <pre style="max-height:320px;overflow:auto;background:#0b1e33;color:#cfe3f7;padding:12px;border-radius:10px;font-size:10.5px;line-height:1.55">${esc(code)}</pre>`,
      foot: `<button class="btn btn-ghost" data-close>닫기</button>`,
      onMount(el) {
        el.querySelector('#copy-code').onclick = async () => {
          try { await navigator.clipboard.writeText(code); toast('Code.gs를 복사했습니다.', 'success'); } catch { toast('복사에 실패했습니다. 직접 선택해 복사하세요.', 'warn'); }
        };
      },
    });
  }

  /* ---------------- 저장공간 ---------------- */
  async function drawStorage() {
    const usage = await photoUsage();
    const est = await db.estimateStorage();
    body.innerHTML = `
      <div class="grid grid-2">
        <div class="card card-pad">
          <div class="section-head"><h3>브라우저 저장공간</h3></div>
          ${est ? `
            <div class="row-between small"><span>사용량</span><b>${(est.usage / 1048576).toFixed(1)}MB / ${(est.quota / 1048576).toFixed(0)}MB</b></div>
            <div class="progress ${est.ratio > 0.85 ? 'bad' : est.ratio > 0.7 ? 'warn' : ''}" style="margin-top:8px"><span style="width:${Math.min(100, est.ratio * 100)}%"></span></div>
            <div class="tiny muted" style="margin-top:6px">${Math.round(est.ratio * 100)}% 사용 중</div>` : '<div class="small muted">브라우저가 저장공간 정보를 제공하지 않습니다.</div>'}
          <div class="divider"></div>
          <div class="row-between small"><span>첨부 사진</span><b>${nf(usage.count)}장 · ${(usage.bytes / 1048576).toFixed(1)}MB</b></div>
          <div class="row" style="margin-top:12px">
            <button class="btn btn-sm btn-ghost" id="photo-clean">${icon('trash')} 180일 이전·미참조 정리</button>
            <button class="btn btn-sm btn-ghost" id="st-refresh">${icon('refresh')} 새로고침</button>
          </div>
        </div>
        <div class="card card-pad">
          <div class="section-head"><h3>사진 보관 정책</h3></div>
          <div class="form-grid">
            ${field('최대 가로·세로 (px)', `<input class="input" type="number" id="ph-width" value="${s.photo.maxWidth}">`)}
            ${field('JPEG 품질', `<input class="input" type="number" step="0.02" min="0.4" max="0.95" id="ph-quality" value="${s.photo.quality}">`)}
            ${field('경고 기준 (%)', `<input class="input" type="number" id="ph-warn" value="${Math.round(s.photo.warnAt * 100)}">`)}
            ${field('첨부 차단 기준 (%)', `<input class="input" type="number" id="ph-block" value="${Math.round(s.photo.blockAt * 100)}">`)}
          </div>
          <div class="row" style="margin-top:12px"><button class="btn btn-sm btn-primary" id="ph-save">저장</button></div>
          <div class="insight" style="margin-top:12px">${icon('info')}<div>사진은 업로드 시 자동 압축되어 기기에 저장됩니다. 운영 데이터가 커지면 Google Drive·Cloud Storage로 옮기는 2단계를 권장합니다.</div></div>
        </div>
      </div>
      <div class="section">
        <div class="card card-pad">
          <h3 style="font-size:13.5px;font-weight:750;margin-bottom:8px">용량 대책</h3>
          <div class="grid grid-3">
            <div><div class="small strong">1단계 · 현재</div><p class="tiny muted" style="line-height:1.65;margin-top:3px">구글시트 원장 + 브라우저 로컬. 사진은 압축 보관, 180일 후 정리.</p></div>
            <div><div class="small strong">2단계 · 확장</div><p class="tiny muted" style="line-height:1.65;margin-top:3px">사고·증빙 사진을 Drive 폴더로 업로드하고 시트에는 링크만 저장.</p></div>
            <div><div class="small strong">3단계 · 모바일</div><p class="tiny muted" style="line-height:1.65;margin-top:3px">기사·주재원·고객 앱 분리, 사진은 오브젝트 스토리지로 이전.</p></div>
          </div>
        </div>
      </div>`;
    $('#photo-clean').onclick = async () => {
      const r = await cleanupPhotos({ keepDays: 180 });
      toast(`사진 ${r.removed}장 · ${(r.bytes / 1048576).toFixed(1)}MB를 정리했습니다.`, 'success');
      updateStorage();
      drawStorage();
    };
    $('#st-refresh').onclick = () => drawStorage();
    $('#ph-save').onclick = async () => {
      await saveSettings({ photo: {
        maxWidth: num($('#ph-width').value) || 1600,
        quality: Math.min(0.95, Math.max(0.4, num($('#ph-quality').value) || 0.72)),
        warnAt: (num($('#ph-warn').value) || 70) / 100,
        blockAt: (num($('#ph-block').value) || 88) / 100,
      } });
      toast('사진 정책을 저장했습니다.', 'success');
    };
  }

  /* ---------------- backup ---------------- */
  $('#btn-backup').onclick = async () => {
    const payload = await db.exportAll();
    downloadJson(payload, `M&M_통합관제_백업_${todayStr()}.json`);
    toast('백업 파일을 내려받았습니다.', 'success');
  };
  $('#btn-restore').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      if (!(await confirmBox('백업 파일로 현재 데이터를 덮어쓸까요?', { title: '데이터 복원', ok: '복원', danger: true }))) return;
      try {
        const text = await readFile(f, 'text');
        const payload = JSON.parse(text);
        await db.importAll(payload, { merge: false });
        await reloadAll();
        toast('복원했습니다. 화면을 새로고침합니다.', 'success');
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        toast(`복원 실패: ${err.message}`, 'error');
      }
    };
    input.click();
  };

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    draw();
  });

  draw();
}
