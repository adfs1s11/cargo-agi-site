import { login } from '../core/auth.js';

export default function renderLogin(view) {
  document.body.classList.add('auth-mode');
  document.body.classList.remove('auth-pending', 'role-mode', 'board-focus');
  document.title = '로그인 · M&M 통합 운송 관제';
  view.innerHTML = `<div class="login-layout">
    <section class="login-intro"><img src="assets/logo.png" alt="M&M통운"><span class="login-eyebrow">MIGHT & MAIN</span><h1>운송 업무의 시작,<br>통합 관제시스템</h1><p>배차 현황부터 기사별 배정과 운송 이력까지<br>한 화면에서 확인하세요.</p><div class="login-features"><span>배차 현황</span><span>가배차 추천</span><span>기사·차량 관리</span></div></section>
    <section class="login-panel"><form id="login-form" class="login-card"><span class="login-eyebrow">M&M 통합 운송 관제</span><h2>관리자 로그인</h2><p>관리자 계정으로 로그인해 주세요.</p>
      <label for="login-id">아이디</label><input id="login-id" name="username" autocomplete="username" required maxlength="40" placeholder="아이디를 입력하세요">
      <label for="login-password">비밀번호</label><input id="login-password" name="password" type="password" autocomplete="current-password" required maxlength="128" placeholder="비밀번호를 입력하세요">
      <p id="login-error" class="login-error" role="alert" aria-live="polite"></p><button type="submit" id="login-submit">로그인</button>
      <div class="login-note">실제 기사와 배차 자료를 등록해 운영을 시작하세요.<br>계정은 로그인 후 관리자 페이지에서 변경하세요.</div>
    </form></section></div>`;
  document.body.dataset.loginReady = '1';
  view.querySelector('#login-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = view.querySelector('#login-submit');
    const error = view.querySelector('#login-error');
    button.disabled = true; error.textContent = '';
    try {
      if (!await login(view.querySelector('#login-id').value, view.querySelector('#login-password').value)) {
        error.textContent = '아이디 또는 비밀번호가 일치하지 않습니다.';
        view.querySelector('#login-password').value = '';
        return;
      }
      location.reload();
    } catch { error.textContent = '로그인 정보를 저장할 수 없습니다. 브라우저 저장 설정을 확인하세요.'; }
    finally { button.disabled = false; }
  };
}
