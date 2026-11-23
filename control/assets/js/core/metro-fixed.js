import {nameKey} from './dispatch-reference-model.js';
import {destinationRegion} from './destination-regions.js';
import {monthRange,historyDriverResolver} from './monthly-history-model.js';
import {mergePerformanceRows} from './transport-performance.js';

function nextColumn(column){
  let index=[...column].reduce((sum,c)=>sum*26+c.charCodeAt(0)-64,0)+1;
  let next='';
  for(;index;index=Math.floor((index-1)/26))next=String.fromCharCode(65+(index-1)%26)+next;
  return next;
}

export function rosterMonth(sheetName){
  const match=String(sheetName).trim().match(/^(?:20)?(\d{2})(0[1-9]|1[0-2])$/);
  return match? `20${match[1]}-${match[2]}` : '';
}

export function rosterSheets(book){
  return (book?.summary||[]).filter(s=>s.kind==='metro'&&rosterMonth(s.name))
    .sort((a,b)=>rosterMonth(b.name).localeCompare(rosterMonth(a.name))||Number(a.hidden)-Number(b.hidden))
    .filter((s,i,all)=>!i||rosterMonth(s.name)!==rosterMonth(all[i-1].name));
}

export function metroRoster(sheet,drivers){
  const resolve=historyDriverResolver(drivers),members=new Map();
  const raw=new Map((sheet.raw||[]).map(([cell,value])=>[cell,value]));
  for(const person of sheet.people||[]){
    const key=nameKey(person.name);
    if(!key)continue;
    const column=person.source?.match(/^([A-Z]+)4$/)?.[1];
    if(column&&raw.size&&String(raw.get(nextColumn(column)+'4')||'').trim()!=='댓수')continue;
    const owner=resolve({driver:person.name});
    const member=members.get(owner.master?.id||key);
    if(member){member.keys.push(key);continue;}
    members.set(owner.master?.id||key,{
      ...person,keys:[key],driver:owner.master||null,ownerKey:owner.ambiguous?'':owner.key,
      match:owner.master?'명부 연결':owner.ambiguous?'동명이인 확인':'명부 미연결',
    });
  }
  return [...members.values()];
}

export function rosterDate(month,value){
  const match=String(value||'').trim().match(/^(?:(\d{2}|\d{4})[.\/-]\s*)?(\d{1,2})[.\/-]\s*(\d{1,2})\s*\.?$/);
  if(!match||Number(match[2])!==Number(month.slice(5))||(match[1]&&!month.startsWith(match[1].length===2?'20'+match[1]:match[1])))return '';
  const date=month+'-'+match[3].padStart(2,'0');
  return Number(match[3])>0&&date<=monthRange(month).to?date:'';
}

export function metroOperation(sheet,roster){
  const month=rosterMonth(sheet.name),byName=new Map(roster.flatMap(p=>p.keys.map(key=>[key,p]))),days=new Map();
  for(const row of sheet.rows||[]){
    const date=rosterDate(month,row.date),person=byName.get(nameKey(row.name));
    if(!date||!person)continue;
    const key=JSON.stringify([date,person.name]);
    if(!days.has(key))days.set(key,{date,person,reasons:new Set()});
    const day=days.get(key),text=nameKey(row.note)+' '+nameKey(row.countNote);
    for(const [reason,rx] of [['강제휴무',/강제휴무/],['개인사정',/개인사정/],['차량정비',/차량정비/]])if(rx.test(text))day.reasons.add(reason);
    if(!day.reasons.size&&/휴무|휴가|휴차/.test(text))day.unspecified=true;
  }
  return [...days.values()].map(day=>({...day,status:[...day.reasons].join(' · ')||(day.unspecified?'휴무 사유 확인':'참고 기록')}))
    .sort((a,b)=>b.date.localeCompare(a.date)||a.person.name.localeCompare(b.person.name,'ko'));
}

export function metroCumulative(sheets,records,drivers,assignments){
  const months=new Map();
  const resolve=historyDriverResolver(drivers);
  for(const sheet of sheets){
    const month=rosterMonth(sheet.name),members=metroRoster(sheet,drivers);
    const owners=new Map(members.filter(p=>p.ownerKey).map(p=>[p.ownerKey,{...p,metro:0,other:0,unknown:0,reference:0,operating:0}]));
    months.set(month,{month,members,owners});
  }
  const merged=mergePerformanceRows({drivers,assignments,...records},{includeHistory:true});
  for(const row of merged.rows){
    const count=Number(row.count);
    if(['cancelled','notshipped','support'].includes(row.status)||!Number.isInteger(count)||count<1)continue;
    const owner=months.get(row.date.slice(0,7))?.owners.get(resolve(row).key);
    if(!owner)continue;
    const region=destinationRegion(row);
    owner[region==='수도권'?'metro':region==='기타/미확인'?'unknown':'other']+=count;
    owner[merged.sources.get(row)==='history'?'reference':'operating']+=count;
  }
  return {months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),held:merged.held.length};
}
