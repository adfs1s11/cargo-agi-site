import {testAccountId} from '../assets/js/core/test-account-identity.js';
export function initTestAccountForm({call,load,work}){
 const form=document.querySelector('#test-account-form'),result=document.querySelector('#test-account-result');
 const passwordSection=document.createElement('section');
 passwordSection.innerHTML='<h3>테스트 계정 비밀번호 변경</h3><p>발급된 테스트 계정만 변경합니다. 여러 아이디는 쉼표로 구분하세요. 비밀번호는 6자 이상이며, 일반 직원 계정은 변경할 수 없습니다.</p><form id="test-password-form"><label>변경할 테스트 아이디<input name="usernames" placeholder="test_dispatch, test_settlement" autocomplete="off" required></label><label>새 테스트 비밀번호<input name="password" type="password" minlength="6" maxlength="128" autocomplete="new-password" required></label><button>테스트 비밀번호 변경</button></form>';
 document.querySelector('#test-accounts').append(passwordSection);
 const passwordForm=passwordSection.querySelector('form');
 const clear=()=>{result.hidden=true;result.querySelector('[data-username]').textContent='';result.querySelector('[data-password]').textContent='';form.reset();passwordForm.reset();};
 document.querySelector('#test-account-hide').onclick=clear;
 form.onsubmit=event=>{
  event.preventDefault();
  const username=form.elements.username.value,role=form.elements.role.value;
  work(async()=>{
   const id=testAccountId(username);
   if(!['dispatch','settlement'].includes(role))throw Error('배차 담당 또는 정산 담당을 선택하세요.');
   if(!confirm(`${id} 계정을 ${role==='dispatch'?'배차 담당':'정산 담당'} 권한으로 발급할까요?\n운영 자료에 실제 접근하는 계정입니다. 테스트가 끝나면 사용 중지하세요.`))return;
   clear();
   const created=await call('/functions/v1/staff-test-account',{username:id,role});
   if(!created.ok||!created.username||!created.password)throw Error('발급 결과를 확인하지 못했습니다. 직원 목록에서 확인하세요.');
   result.querySelector('[data-username]').textContent=created.username;
   result.querySelector('[data-password]').textContent=created.password;
   result.hidden=false;
   document.querySelector('#status').textContent='테스트 계정 발급 완료. 비밀번호는 이 화면에서만 표시됩니다. 안전하게 보관하세요.';
   await load();
  });
 };
 passwordForm.onsubmit=event=>{
  event.preventDefault();
  const usernames=passwordForm.elements.usernames.value.split(',').map(value=>value.trim()).filter(Boolean);
  const password=passwordForm.elements.password.value;
  work(async()=>{
   try{
    const changed=await call('/functions/v1/staff-test-account',{action:'set-password',usernames,password});
    if(!changed.ok)throw Error('비밀번호 변경 결과를 확인하지 못했습니다.');
    clear();
    document.querySelector('#status').textContent='테스트 비밀번호 변경 완료: '+changed.changed.join(', ');
   }finally{passwordForm.elements.password.value='';}
  });
 };
 return clear;
}
