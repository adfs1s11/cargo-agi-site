import {testAccountId} from '../assets/js/core/test-account-identity.js';
export function initTestAccountForm({call,load,work}){
 const form=document.querySelector('#test-account-form'),result=document.querySelector('#test-account-result');
 const clear=()=>{result.hidden=true;result.querySelector('[data-username]').textContent='';result.querySelector('[data-password]').textContent='';form.reset();};
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
 return clear;
}
