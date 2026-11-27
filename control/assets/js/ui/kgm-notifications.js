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
 shell('<section class="kgm-panel"><h3>고객 배차·출발 안내</h3><p>고객과 도착지를 확인하고 안내할 운송을 선택하세요. 출발 안내는 운송 시작 처리 후 사용할 수 있습니다.</p><label>고객·영업소·차대번호 검색<input id="kgm-notice-search"></label><div id="kgm-notice-list"></div></section>');
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
 dialog.innerHTML='<h2>고객 안내</h2><p>'+esc([row.customer,row.salesOffice,row.customerName,row.destination].filter(Boolean).join(' · '))+'</p><p>등록 수신처 <b>'+esc(recipient.name||'미등록')+' '+esc(recipient.phone)+'</b></p><pre style="white-space:pre-wrap">'+esc(text)+'</pre><div class="kgm-actions"><button data-edit>수신처 등록·수정</button><button data-sms>문자 작성</button><button data-share>카카오톡 공유·복사</button><button data-close>닫기</button></div><p data-result role="status"></p>';
 view.append(dialog);dialog.showModal();
 const close=()=>{dialog.close();dialog.remove();};
 dialog.oncancel=e=>{e.preventDefault();close();};
 dialog.querySelector('[data-close]').onclick=close;
 dialog.querySelector('[data-edit]').onclick=()=>{
  close();
  formDialog('KGM 안내 수신처','<p class="kgm-note wide">'+esc([row.customer,row.salesOffice,row.customerName,row.destination].filter(Boolean).join(' · '))+'의 안내 수신처입니다.</p><label>수신자 이름<input name="name" required maxlength="100" value="'+esc(recipient.name)+'"></label><label>휴대폰 번호<input type="tel" name="phone" required value="'+esc(recipient.phone)+'"></label>',(v,req)=>api.write('contact_save',{...params,...v,revision:recipient.revision},req));
 };
 const note=dialog.querySelector('[data-result]');
 for(const channel of ['sms','share']){
  const btn=dialog.querySelector('[data-'+channel+']');btn.disabled=!recipient.phone;
  btn.onclick=async()=>{
   try{
    const fresh=await read();
    if(fresh.revision!==recipient.revision||fresh.phone!==recipient.phone)throw Error('수신처가 변경되었습니다. 창을 닫고 다시 확인하세요.');
    if(channel==='sms'){
     const link=document.createElement('a');link.href='sms:'+recipient.phone+(/iPhone|iPad|iPod/.test(navigator.userAgent)?'&':'?')+'body='+encodeURIComponent(text);link.click();
     note.textContent='문자 앱에서 수신번호와 내용을 확인한 뒤 전송하세요.';
    }else{
     await navigator.clipboard.writeText(text);
     note.textContent='안내문을 복사했습니다. 카카오톡에서 '+fresh.name+' 님의 대화방을 확인한 뒤 붙여넣어 전송하세요.';
     if(navigator.share){const share=document.createElement('button');share.textContent='공유 앱에서 카카오톡 선택';share.onclick=async()=>{try{await navigator.share({text});}catch(e){if(e.name!=='AbortError')note.textContent='카카오톡 대화방에 복사한 안내문을 붙여넣으세요.';}};note.append(' ',share);}
    }
   }catch(e){note.textContent=e.message;}
  };
 }
}
