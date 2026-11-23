import {esc,openModal,exportXlsx} from '../core/utils.js';
import * as db from '../core/db.js';
import {closingRecipients,contactSubject,readClosingContacts,saveClosingContact} from '../core/closing-contacts.js';

export function openClosingContact(kind,subject,onSaved=()=>{}){
  const customer=kind==='customer';
  openModal({title:(customer?'거래처':'기사')+' 마감 연락처',sub:customer?subject:subject.name,
    body:`${customer?'<label>담당자<input class="input" name="contact" maxlength="100"></label><label>연락처<input class="input" name="phone" type="tel" maxlength="60"></label>':''}
      <label>마감 이메일<input class="input" name="email" type="email" maxlength="254" autocomplete="off"></label><p role="status" data-contact-status></p>`,
    foot:'<button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-primary" data-contact-save disabled>저장</button>',
    async onMount(el,close){
      const id=customer?subject:subject.id,button=el.querySelector('[data-contact-save]'),status=el.querySelector('[data-contact-status]');
      const inputs=[...el.querySelectorAll('[name]')];
      status.textContent='연락처 조회 중…';
      try{
        const [value]=await readClosingContacts(kind,id);
        if(!el.isConnected)return;
        for(const input of inputs)input.value=value?.[input.name]||'';
        button.disabled=false;status.textContent='';
      }catch(e){status.textContent='연락처 조회 실패 · '+e.message;return;}
      button.onclick=async()=>{
        button.disabled=true;status.textContent='저장 중…';
        try{
          await saveClosingContact(kind,id,Object.fromEntries(inputs.map(i=>[i.name,i.value])));
          if(el.isConnected){close();onSaved();}
        }catch(e){status.textContent=e.message;button.disabled=false;}
      };
    },
  });
}

export async function renderClosingContacts(body,{entries,drivers,month,closed}){
  const panel=document.createElement('section');
  panel.className='card card-pad';panel.textContent='마감 연락처 조회 중…';body.replaceChildren(panel);
  try{
    const [customers,driverContacts]=await Promise.all([readClosingContacts('customer'),readClosingContacts('driver')]);
    if(!panel.isConnected)return;
    const recipients=closingRecipients(entries,drivers,customers,driverContacts);
    const options=[...new Set([...recipients.sale.map(r=>r.name),...customers.map(r=>r.subject)])].sort((a,b)=>a.localeCompare(b,'ko'));
    const table=(title,rows)=>`<h4>${title}</h4><p class="small muted">이메일 미입력·연결 확인 ${rows.filter(r=>!r.email||r.issue).length}건</p><div class="scroll-x"><table class="data"><thead><tr><th>대상</th><th>담당자</th><th>연락처</th><th>이메일</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.contact||'—')}</td><td>${esc(r.phone||'—')}</td><td>${esc(r.issue||r.email||'미입력')}</td></tr>`).join('')||'<tr><td colspan="4">이 달에 해당하는 대상이 없습니다.</td></tr>'}</tbody></table></div>`;
    panel.innerHTML=`<h3>마감 연락처</h3><p>${esc(month)} · ${closed?'확정 마감':'정산 검토 중'}</p><label>거래처 이름 <input class="input" id="cc-customer" list="cc-customers" maxlength="240" placeholder="배차판에 적힌 거래처명"></label>
      <datalist id="cc-customers">${options.map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist>
      <button class="btn" id="cc-edit">거래처 담당자 등록·수정</button> <button class="btn" id="cc-export" ${closed?'':'disabled'}>마감 수신처 엑셀</button>
      <p role="status" id="cc-status">기사 이메일은 기사 관리에서 등록합니다. 엑셀은 마감 확정 후 내려받을 수 있습니다.</p>
      <label>매입 기사 <select class="select" id="cc-driver"><option value="">기사 선택</option>${[...drivers].sort((a,b)=>a.name.localeCompare(b.name,'ko')).map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.vehicleNo||'차량 미등록')}</option>`).join('')}</select></label>
      <button class="btn" id="cc-driver-edit">기사 이메일 등록·수정</button>
      ${table('매출 · 거래처',recipients.sale)}${table('매입 · 기사',recipients.purchase)}`;
    panel.querySelector('#cc-edit').onclick=()=>{
      const name=contactSubject(panel.querySelector('#cc-customer').value);
      if(!name){panel.querySelector('#cc-status').textContent='거래처 이름을 입력하세요.';return;}
      openClosingContact('customer',name,()=>{if(panel.isConnected)renderClosingContacts(body,{entries,drivers,month,closed});});
    };
    panel.querySelector('#cc-driver-edit').onclick=()=>{
      const driver=drivers.find(d=>d.id===panel.querySelector('#cc-driver').value);
      if(!driver){panel.querySelector('#cc-status').textContent='기사를 선택하세요.';return;}
      openClosingContact('driver',driver,()=>{if(panel.isConnected)renderClosingContacts(body,{entries,drivers,month,closed});});
    };
    panel.querySelector('#cc-export').onclick=async()=>{
      try{
      const confirmed=(await db.getAll('closings')).find(c=>c.month===month&&c.status==='closed');
      if(!confirmed)throw Error('확정 마감본이 없습니다. 마감 상태를 다시 확인하세요.');
      const latest=await Promise.all([readClosingContacts('customer'),readClosingContacts('driver')]);
      const output=closingRecipients(confirmed.entries,drivers,...latest);
      const safe=v=>/^[=+@-]/.test(v||'')?"'"+v:v||'';
      const rows=list=>[['대상','담당자','연락처','이메일','확인'],...list.map(r=>[r.name,r.contact,r.phone,r.email,r.issue||(!r.email?'이메일 미입력':'')].map(safe))];
      exportXlsx({'매출 거래처':rows(output.sale),'매입 기사':rows(output.purchase)},month+'_마감_수신처.xlsx');
      }catch(error){panel.querySelector('#cc-status').textContent='내려받기 실패 · '+error.message;}
    };
  }catch(e){if(panel.isConnected)panel.textContent='마감 연락처 조회 실패 · '+e.message;}
}
