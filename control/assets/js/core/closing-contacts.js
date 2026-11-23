import * as db from './db.js';
import {workspaceRpc,workspaceProfile,supabaseMode} from './supabase-session.js';
import {performanceResolver} from './transport-performance.js';

export const closingContactAccess=()=>!supabaseMode()||['admin','settlement'].includes(workspaceProfile()?.role);
export const contactSubject=value=>String(value??'').normalize('NFC').trim();
export function cleanClosingContact(kind,subject,contact={}){
  if(!['driver','customer'].includes(kind))throw Error('연락처 구분을 확인하세요.');
  subject=contactSubject(subject);
  const email=String(contact.email??'').trim();
  const person=kind==='customer'?String(contact.contact??'').trim():'';
  const phone=kind==='customer'?String(contact.phone??'').trim():'';
  if(!subject||subject.length>240||person.length>100||phone.length>60)throw Error('거래처 또는 담당자·연락처 길이를 확인하세요.');
  if(email.length>254||(email&&!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email)))throw Error('이메일 주소 한 개를 확인하세요.');
  return {kind,subject,contact:person,phone,email};
}
export async function readClosingContacts(kind,subject=null){
  if(!closingContactAccess())throw Error('마감 연락처 조회 권한을 확인하세요.');
  if(supabaseMode())return workspaceRpc('tms_closing_contacts',{p_kind:kind,p_subject:subject});
  return (await db.getAll('meta')).filter(r=>r.closingContact?.kind===kind&&(subject===null||r.closingContact.subject===subject)).map(r=>r.closingContact);
}
export async function saveClosingContact(kind,subject,draft){
  if(!closingContactAccess())throw Error('마감 연락처 저장 권한을 확인하세요.');
  const row=cleanClosingContact(kind,subject,draft);
  if(supabaseMode()){
    await workspaceRpc('tms_closing_contact_save',Object.fromEntries(Object.entries(row).map(([k,v])=>['p_'+k,v])));
    const [stored]=await readClosingContacts(kind,row.subject);
    if(!stored||Object.keys(row).some(k=>stored[k]!==row[k]))throw Error('서버의 최신 연락처와 입력값이 다릅니다. 다시 조회하세요.');
    return stored;
  }
  await db.put('meta',{key:'closing-contact:'+JSON.stringify([kind,row.subject]),closingContact:row});return row;
}
export function closingRecipients(entries,drivers,customerContacts,driverContacts){
  const resolve=performanceResolver(drivers),customers=new Map(customerContacts.map(c=>[c.subject,c])),emails=new Map(driverContacts.map(c=>[c.subject,c]));
  const sale=new Map(),purchase=new Map();
  for(const row of entries){
    const customer=contactSubject(row.customer);
    if(customer)sale.set(customer,{name:customer,...customers.get(customer)});
    const owner=resolve(row);
    if(row.driver||row.driverId){
      if(owner.master&&(!row.driverId||owner.master.id===row.driverId))purchase.set(owner.master.id,{name:owner.master.name,...emails.get(owner.master.id),issue:''});
      else purchase.set(JSON.stringify([row.driverId,row.driver]),{name:row.driver||'기사 미확인',issue:'기사 명부 연결 확인'});
    }
  }
  return {sale:[...sale.values()],purchase:[...purchase.values()]};
}
