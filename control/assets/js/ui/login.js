import { sharedOnlineMode } from '../core/shared-auth.js';
import { login, sharedMode } from '../core/auth.js';
import {supabaseMode,resetWorkspacePassword} from '../core/supabase-session.js';

export default function renderLogin(view) {
  document.body.classList.add('auth-mode');
  document.body.classList.remove('auth-pending', 'role-mode', 'board-focus');
  document.title = '로그인 · M&M 통합 운송 관제';
  view.innerHTML = `<div class="login-layout">
    <section class="login-intro"><img src="assets/logo.png" alt="M&M통운"><span class="login-eyebrow">MIGHT & MAIN</span><h1>운송 업무의 시작,<br>통합 관제시스템</h1><p>배차 현황부터 기사별 배정과 운송 이력까지<br>한 화면에서 확인하세요.</p><div class="login-features"><span>배차 현황</span><span>가배차 추천</span><span>기사·차량 관리</span></div></section>
    <section class="login-panel"><form id="login-form" class="login-card"><span class="login-eyebrow">M&M 통합 운송 관제</span><h2>${sharedMode()?'회사 공용 로그인':'관리자 로그인'}</h2><p>${sharedMode()?'회사에서 안내한 공용 계정으로 접속하세요.':'관리자 계정으로 로그인해 주세요.'}</p>
      <label for="login-id">아이디</label><input id="login-id" name="username" autocomplete="username" required maxlength="40" placeholder="아이디를 입력하세요">
      <label for="login-password">비밀번호</label><input id="login-password" name="password" type="password" autocomplete="current-password" required maxlength="128" placeholder="비밀번호를 입력하세요">
      <p id="login-error" class="login-error" role="alert" aria-live="polite"></p><button type="submit" id="login-submit">로그인</button>
      <div class="login-note">${sharedMode()?(sharedOnlineMode()?'직원 공용 로그인 · 온라인 공용 원장<br>로그인 후 회사의 같은 배차·기사 자료를 사용합니다.':'직원 공용 로그인 · 공용 원장 연결 준비 중'):'실제 기사와 배차 자료를 등록해 운영을 시작하세요.<br>계정은 로그인 후 관리자 페이지에서 변경하세요.'}</div>
    <a class="btn btn-ghost" style="display:block;margin-top:14px;text-align:center" href="customer/">고객사 배차 조회</a></form></section></div>`;
  document.body.dataset.loginReady = '1';
  if(supabaseMode()){
    view.querySelector('h2').textContent='직원 개인 로그인';
    view.querySelector('h2 + p').textContent='회사 이메일 또는 관리자가 발급한 테스트 아이디로 로그인하세요.';
    view.querySelector('label[for="login-id"]').textContent='회사 이메일 / 테스트 아이디';
    const input=view.querySelector('#login-id');input.type='text';input.maxLength=254;input.placeholder='회사 이메일 또는 test_dispatch';input.autocapitalize='none';input.spellcheck=false;
    view.querySelector('.login-note').textContent='직원은 개인 이메일, 테스트 계정은 관리자가 발급한 아이디와 비밀번호를 사용하세요. 테스트 계정의 비밀번호는 관리자에게 문의하세요. 기존 ADMIN 공용 계정과 Supabase 관리 사이트 계정은 사용할 수 없습니다.';
    const recovery=document.createElement('button');recovery.type='button';recovery.id='login-recovery';recovery.className='btn btn-ghost';recovery.textContent='비밀번호 재설정 메일 받기';
    view.querySelector('#login-submit').after(recovery);
    recovery.onclick=async()=>{
      const message=view.querySelector('#login-error');recovery.disabled=true;message.textContent='';
      try{if(!input.value.includes('@'))throw Error('테스트 계정은 이메일 재설정을 지원하지 않습니다. 발급한 관리자에게 문의하세요.');message.textContent=await resetWorkspacePassword(input.value);}
      catch(e){message.textContent=e.name==='TimeoutError'?'발송 결과를 확인하지 못했습니다. 메일함을 먼저 확인해 주세요.':e.message;}
      finally{recovery.disabled=false;}
    };
  }
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
    } catch (e) { error.textContent = e.message || '로그인에 실패했습니다. 연결 상태를 확인하세요.'; }
    finally { button.disabled = false; }
  };
}
