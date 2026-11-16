import {validateNotice} from './notice-model.js';
// Fictional UI examples only; these are not actual brand operating instructions.
export function demoNotices(){return [
 {id:'demo-accident',revision:1,category:'사고 전파',title:'[화면 예시] 사고 사례와 재발 방지 안내',summary:'사고 개요와 기사님이 확인할 조치를 한곳에서 읽습니다.',body:'이 내용은 개발 화면 검토를 위한 가상 예시입니다. 실제 사고나 업무 지침이 아닙니다.\n\n1. 사고 개요\n관리자가 확인한 사실을 기재합니다.\n\n2. 원인 및 확인 사항\n확정된 내용과 조사 중인 내용을 구분합니다.\n\n3. 기사 확인 사항\n운행 전 확인할 조치와 담당자 연락 방법을 기재합니다.',important:true,pinned:true,read:false,updated_at:'2026-11-16T09:00:00+09:00',expires_at:null},
 ...['TESLA','MBK','VOLVO'].map((brand,i)=>({id:'demo-brand-'+i,revision:2,category:'브랜드별 출고 주의사항',brand,title:`[화면 예시] ${brand} 출고 전 확인사항`,summary:'브랜드별 최신 지침을 고정해 필요할 때 다시 찾습니다.',body:'실제 '+brand+' 출고 지침이 아닙니다.\n\n이곳에 회사가 승인한 출고 절차, 필수 확인 항목, 현장별 예외와 문의 방법을 등록합니다.\n\n지침이 바뀌면 새 버전으로 게시하고 다시 확인받습니다.',important:true,pinned:true,read:i===2,updated_at:'2026-11-15T09:00:00+09:00',expires_at:null})),
 {id:'demo-general',revision:1,category:'기타 공지',title:'[화면 예시] 기사 앱 이용 안내',summary:'공지 확인과 차량 점검 메뉴를 안내합니다.',body:'가상 공지입니다.\n\n공지함에서 내용을 읽고 확인 버튼을 누르는 흐름을 체험할 수 있습니다. 체험 결과는 실제 회사 서버에 저장되지 않습니다.',important:false,pinned:false,read:false,updated_at:'2026-11-16T08:00:00+09:00',expires_at:null}
 ];}
const KEY='mmtc.notice-center.demo.v1';
function store(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.version===1&&Array.isArray(saved.notices))return saved;}catch{}return {version:1,notices:demoNotices().map(n=>({...n,active:true,ackAt:n.read?'2026-11-16T09:30:00+09:00':null}))};}
const write=value=>localStorage.setItem(KEY,JSON.stringify(value));
const visible=n=>n.active&&(!n.expires_at||Date.parse(n.expires_at)>Date.now());
export function loadDemoNotices(){return store().notices.filter(visible);}
export function acknowledgeDemoNotice(id,revision){const state=store(),n=state.notices.find(n=>n.id===id);if(!n||!visible(n)||n.revision!==revision)throw Error('체험 공지가 변경됐습니다. 목록에서 새로고침하세요.');n.read=true;n.ackAt=new Date().toISOString();write(state);}
export async function noticeDemoAdmin(action,payload={}){
 const state=store();if(action==='list')return {notices:state.notices.map(n=>({...n,active:visible(n),target_count:2,read_count:n.read?1:0}))};
 let n=state.notices.find(n=>n.id===payload.id);
 if(action==='readers'){if(!n||n.revision!==payload.revision)throw Error('체험 공지가 변경됐습니다. 다시 조회하세요.');return {revision:n.revision,drivers:[{driver_id:'demo-two',name:'가상 기사 2',read:false},{driver_id:'demo-one',name:'체험 기사',read:n.read,at:n.ackAt}]};}
 if(action==='archive'){if(!n||n.revision!==payload.revision)throw Error('체험 공지가 변경됐습니다. 다시 조회하세요.');n.active=false;}
 else if(action==='publish'){const value=validateNotice(payload);if(n&&n.revision!==payload.revision)throw Error('체험 공지가 변경됐습니다. 다시 조회하세요.');const updated={...value,id:value.id,revision:(n?.revision||0)+1,active:true,read:false,ackAt:null,expires_at:value.expiresAt,updated_at:new Date().toISOString()};if(n)Object.assign(n,updated);else state.notices.unshift(updated);}
 else throw Error('지원하지 않는 체험 요청');write(state);return {ok:true};
}
