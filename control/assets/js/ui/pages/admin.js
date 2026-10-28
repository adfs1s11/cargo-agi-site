import { accountName, changeAccount, logout, sharedMode } from '../../core/auth.js';
import { state, seedDemo, clearDemoData, saveSettings } from '../../core/data.js';
import { esc, nf, toast, confirmBox } from '../../core/utils.js';
import { pageHead } from '../components.js';

export default function renderAdmin(view) {
  view.innerHTML = `${pageHead('관리자 페이지', '관리자 계정과 운영 자료 설정을 관리합니다.', '<button class="btn btn-ghost" id="admin-logout">로그아웃</button>')}
    <div class="admin-grid">
      <form id="admin-account" class="card card-pad admin-form"><h3>관리자 계정 설정</h3><p class="muted">${sharedMode()?'회사 공용 계정을 변경합니다. 변경 후 모든 직원이 새 계정으로 다시 로그인해야 합니다.':'변경 후 새 계정으로 다시 로그인합니다.'}</p>
        <label for="admin-id">로그인 아이디</label><input class="input" id="admin-id" autocomplete="username" required maxlength="40" value="${esc(accountName())}">
        <label for="admin-current">현재 비밀번호</label><input class="input" id="admin-current" type="password" autocomplete="current-password" required>
        <label for="admin-new">새 비밀번호</label><input class="input" id="admin-new" type="password" autocomplete="new-password" minlength="4" maxlength="128" placeholder="현재 비밀번호 유지 시 비워두세요">
        <label for="admin-confirm">새 비밀번호 확인</label><input class="input" id="admin-confirm" type="password" autocomplete="new-password" maxlength="128">
        <p id="admin-error" class="login-error" role="alert" aria-live="polite"></p><button class="btn btn-primary" type="submit">계정 설정 저장</button>
      </form>
      <div class="stack"><section class="card card-pad"><h3>샘플 자료 관리</h3><p class="muted">가상 기사·차량·배차·상품·사고 자료입니다. 실제 연락처나 운영 원장은 포함하지 않습니다.</p><div class="admin-counts"><span>배차 <b>${nf(state.dispatch.length)}건</b></span><span>기사 <b>${nf(state.drivers.length)}명</b></span><span>차량 <b>${nf(state.equipment.length)}대</b></span></div><div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn btn-ghost" id="admin-seed">샘플 자료 넣기</button><button class="btn btn-ghost" id="admin-clear-sample">샘플 자료 삭제</button></div><p class="small muted">샘플은 자동으로 입력되지 않습니다. 직접 등록·업로드한 자료는 유지됩니다. 같은 샘플을 다시 넣어도 중복 추가하지 않습니다.</p><a class="link" href="#/dashboard" data-link>배차 현황 확인 →</a></section>
      <section class="card card-pad"><h3>사용 환경 안내</h3><p class="muted">${sharedMode()?'회사 공용 계정을 서버에서 확인합니다. 1차에는 모든 메뉴를 함께 사용합니다. 단가·정산의 직원별 권한 분리는 다음 단계입니다. 업무 자료는 현재 PC별 저장이며 다른 PC와 자동 공유되지 않습니다.':'현재는 브라우저별 로그인입니다. 공용 로그인 서버 연결 전에는 계정 변경과 자료가 다른 PC에 공유되지 않습니다.'}</p><a class="btn btn-ghost" href="#/settings" data-link>데이터 백업·연동 설정</a></section></div>
    </div>`;
  view.querySelector('#admin-logout').onclick = logout;
  view.querySelector('#admin-account').onsubmit = async (event) => {
    event.preventDefault();
    const error = view.querySelector('#admin-error'); error.textContent = '';
    const button = event.submitter; button.disabled = true;
    try {
      const password = view.querySelector('#admin-new').value;
      if (password !== view.querySelector('#admin-confirm').value) throw Error('새 비밀번호 확인이 일치하지 않습니다.');
      await changeAccount({ username: view.querySelector('#admin-id').value, currentPassword: view.querySelector('#admin-current').value, password });
      location.hash = '#/dashboard'; logout();
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  };
  view.querySelector('#admin-seed').onclick = async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { const result = await seedDemo(); await saveSettings({ demo: true }); toast(`샘플 배차 ${nf(result.dispatch)}건을 확인할 수 있습니다.`, 'success'); renderAdmin(view); }
    catch (e) { toast(e.message, 'warn'); }
    finally { button.disabled = false; }
  };
  view.querySelector('#admin-clear-sample').onclick = async () => {
    if (!await confirmBox('샘플 자료만 삭제할까요? 직접 업로드한 자료는 유지됩니다.', { title: '샘플 자료 삭제', ok: '삭제', danger: true })) return;
    try { await clearDemoData(); await saveSettings({ demo: false }); toast('샘플 자료를 삭제했습니다.', 'success'); renderAdmin(view); }
    catch (e) { toast(e.message, 'warn'); }
  };
}
