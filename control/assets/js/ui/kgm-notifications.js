import {workspaceAction} from '../core/supabase-session.js';
import {esc} from '../core/utils.js';
import {KGM_STATUS} from '../core/kgm-model.js';

export function noticeText(row,day){
 const stage=row.status==='transit'?'출발':'배차 확정';
 return '[M&M KGM '+stage+' 안내]\n'+day+' · '+row.model+' / 차대번호 '+row.chassis+
  '\n도착지 '+row.destination+'\n담당 기사 '+row.assignment.driverName+
  (row.assignment.phone?' · '+row.assignment.phone:'')+
  (row.status==='transit'?'\n차량이 출발했습니다.':'\n배차가 확정되었습니다.');
}
export function renderNotices({data,day,shell,table,button}){
 if(!data.canWrite)return shell('<p>배차 담당자와 관리자가 사용할 수 있습니다.</p>');
 const orders=data.orders.filter(r=>['assigned','transit'].includes(r.status)&&r.assignment?.driverName);
 shell('<section class="kgm-panel"><h3>고객 배차·출발 안내</h3><p data-company-setup role="status">회사 발신 설정 확인 중…</p><p>고객과 도착지를 확인하고 안내할 운송을 선택하세요. 출발 안내는 운송 시작 처리 후 사용할 수 있습니다.</p><label>고객·영업소·차대번호 검색<input id="kgm-notice-search"></label><div id="kgm-notice-list"></div></section>');
 return orders;
}
export function noticeTable(orders,q,table,button){
 const query=q.trim().toLowerCase();
 return table(['상태','매출처 / 고객 · 영업소','차종 / 차대번호','도착지','안내'],orders.filter(r=>[r.customer,r.customerName,r.salesOffice,r.chassis,r.destination].some(v=>String(v||'').toLowerCase().includes(query))).map(r=>'<tr><td>'+esc(KGM_STATUS[r.status])+'</td><td>'+esc(r.customer)+'<small>'+esc([r.customerName,r.salesOffice].filter(Boolean).join(' · '))+'</small></td><td>'+esc(r.model)+'<small>'+esc(r.chassis)+'</small></td><td>'+esc(r.destination)+'</td><td>'+button(r.status==='transit'?'출발 안내':'배차 확정 안내','notice',r.id)+'</td></tr>'));
}
export async function openNotice({view,row,day,api,formDialog}){
 const params={day,id:row.id,orderRevision:row.revision};
 const read=()=>api.write('contact_read',params,crypto.randomUUID());
 const recipient=await read();
 if(!view.isConnected)return;
 const text=noticeText(row,day);
 const dialog=document.createElement('dialog');dialog.className='kgm-dialog kgm-workspace';
 dialog.innerHTML='<h2>고객 안내</h2><p>'+esc([row.customer,row.salesOffice,row.customerName,row.destination].filter(Boolean).join(' · '))+'</p><p>등록 수신처 <b>'+esc(recipient.name||'미등록')+' '+esc(recipient.phone)+'</b></p><pre style="white-space:pre-wrap">'+esc(text)+'</pre><div class="kgm-actions"><button data-edit>수신처 등록·수정</button><button data-sms disabled>회사 문자 발송</button><button data-kakao disabled>카카오 알림톡 발송</button><button data-check>발송 상태 확인</button><button data-close>닫기</button></div><p data-result role="status"></p>';
 view.append(dialog);dialog.showModal();
 const close=()=>{dialog.close();dialog.remove();};
 dialog.oncancel=e=>{e.preventDefault();close();};
 dialog.querySelector('[data-close]').onclick=close;
 dialog.querySelector('[data-edit]').onclick=()=>{
  close();
  formDialog('KGM 안내 수신처','<p class="kgm-note wide">'+esc([row.customer,row.salesOffice,row.customerName,row.destination].filter(Boolean).join(' · '))+'의 안내 수신처입니다.</p><label>수신자 이름<input name="name" required maxlength="100" value="'+esc(recipient.name)+'"></label><label>휴대폰 번호<input type="tel" name="phone" required value="'+esc(recipient.phone)+'"></label>',(v,req)=>api.write('contact_save',{...params,...v,revision:recipient.revision},req));
 };
 const note=dialog.querySelector('[data-result]');
 const labels={ready:'발송 전',sending:'발송 요청 처리 중',accepted:'발송사 접수 · 도착 결과 대기',delivered:'수신처 배송 완료',failed:'발송 실패 · 수신처와 발송사 설정 확인 후 다시 시도하세요.',uncertain:'결과 확인 필요 · 중복 방지를 위해 재발송을 보류합니다.',unconfigured:'회사 발신 설정 대기'};
 const send=api.notice||((payload)=>workspaceAction('kgm.corporateNotice',payload));
 const paramsForSend={...params,stage:row.status,recipientRevision:recipient.revision};
 let operating=false;
 const buttons=['sms','kakao'].map(channel=>[channel,dialog.querySelector('[data-'+channel+']')]);
 function show(result){
  const ready=['ready','failed'].includes(result.state);
  for(const [channel,button] of buttons)button.disabled=operating||!ready||!recipient.phone||!result[channel];
  note.textContent=[!result.sms?'회사 발신번호 등록·연결 대기':'회사 발신번호 '+result.sender,!result.kakao?'알림톡 채널·템플릿 연결 대기':'',labels[result.state]].filter(Boolean).join(' · ');
 }
 async function check(){try{show(await send({...paramsForSend,mode:'inspect'}));}
 catch(e){for(const [,b] of buttons)b.disabled=true;note.textContent='발송 상태를 확인하지 못했습니다. '+e.message;}}
 dialog.querySelector('[data-check]').onclick=()=>{if(!operating)check();};
 for(const [channel,button] of buttons)button.onclick=async()=>{
  if(operating||!confirm(recipient.name+' ('+recipient.phone+') 님에게 '+(channel==='sms'?'회사 문자':'카카오 알림톡')+'로 안내를 발송할까요?'))return;
  operating=true;buttons.forEach(([,b])=>b.disabled=true);note.textContent='발송사에 요청 중…';
  try{const result=await send({...paramsForSend,mode:'send',channel,request:crypto.randomUUID()});operating=false;show(result);}
  catch(e){operating=false;note.textContent='발송 결과를 다시 확인하세요. '+e.message;}
 };
 await check();
}
