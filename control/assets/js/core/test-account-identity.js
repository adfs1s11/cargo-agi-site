// Internal Auth identifiers; no email is sent to this reserved domain.
export const TEST_ACCOUNT_DOMAIN='mm-test.invalid';
export function testAccountId(value){
 const id=String(value??'').trim().toLowerCase();
 if(!/^test_[a-z0-9][a-z0-9_]{2,26}$/.test(id))throw Error('테스트 아이디는 test_로 시작하는 영문 소문자·숫자·밑줄 8~32자로 입력하세요.');
 return id;
}
export function loginIdentity(value){
 const id=String(value??'').trim();
 return id.includes('@')?id:testAccountId(id)+'@'+TEST_ACCOUNT_DOMAIN;
}
export function displayLoginIdentity(value){
 const email=String(value??'');
 if(!email.endsWith('@'+TEST_ACCOUNT_DOMAIN))return email;
 const id=email.slice(0,-TEST_ACCOUNT_DOMAIN.length-1);
 try{return testAccountId(id);}catch{return email;}
}
