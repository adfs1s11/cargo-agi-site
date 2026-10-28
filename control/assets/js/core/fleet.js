import * as db from './db.js';
import { norm, normalizePlate, uid, addDays } from './utils.js';
import { validDate } from './schedule.js';
import { referenceHistory } from './transport-history.js';

export const FLEET_LABELS={A:'용차A',B:'용차B',C:'용차C',CF:'용차C · 고정용차'};
export function fleetClass(driver, equipment=[], fleet={}) {
  const plate=normalizePlate(driver.vehicleNo || equipment.find(e=>e.driverId===driver.id)?.plateNo || driver.plateNo || '');
  if(!plate)return {code:'',label:'차량번호 확인 필요',plate};
  const matches=(fleet.roster || []).filter(r=>normalizePlate(r.plate)===plate);
  if(new Set(matches.map(r=>r.grade)).size>1)return {code:'',label:'명단 구분 충돌',plate};
  if(matches.length) return {code:matches[0].grade,label:FLEET_LABELS[matches[0].grade],plate,source:matches[0]};
  const fixed=fleet.fixed?.[plate];
  return {code:fixed?.enabled?'CF':'C',label:fixed?.enabled?FLEET_LABELS.CF:FLEET_LABELS.C,plate,reason:fixed?.reason || ''};
}
export function parseFleetRoster(buffer,fileName) {
  const wb=window.XLSX.read(buffer,{type:'array'}), rows=[], held=[];
  const platePattern=/^[가-힣]{0,4}\d{2,3}[가-힣]\d{4}$/;
  let asOf='';
  for(const sheet of wb.SheetNames) {
    const grade=/용차\s*A/i.test(sheet)?'A':/용차\s*B/i.test(sheet)?'B':'';
    if(!grade)continue;
    const ws=wb.Sheets[sheet], matrix=window.XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
    const header=matrix.findIndex(r=>r.some(v=>norm(v)==='차량번호')&&r.some(v=>norm(v)==='성명'));
    if(header<0)continue;
    const title=matrix.slice(0,header).flat().join(' '), match=title.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    const date=match?`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`:'';
    if(!validDate(date))throw Error('명단 제목의 기준일을 확인하세요.');
    if(asOf && asOf!==date)throw Error('시트별 명단 기준일이 다릅니다.');asOf=date;
    const heads=matrix[header].map(norm), idx=k=>heads.indexOf(k), plateIdx=idx('차량번호'), nameIdx=idx('성명');
    const cell=(r,c)=>{
      const merge=(ws['!merges'] || []).find(m=>m.s.r<=r&&r<=m.e.r&&m.s.c<=c&&c<=m.e.c);
      return String(matrix[merge?merge.s.r:r]?.[merge?merge.s.c:c] || '').trim();
    };
    for(let i=header+1;i<matrix.length;i++) {
      if(!/^\d+$/.test(String(matrix[i][0]).trim()))continue;
      const plate=normalizePlate(cell(i,plateIdx)), name=cell(i,nameIdx).replace(/\s+/g,'');
      if(!plate||!name||!platePattern.test(plate)){held.push({sheet,row:i+1,reason:'차량번호·성명 확인 필요'});continue;}
      const get=k=>idx(k)>=0?cell(i,idx(k)):'';
      rows.push({plate,name,grade,phone:get('연락처'),affiliation:get('소속'),department:get('운영부서'),vehicleType:get('차종'),manufacturer:cell(i,idx('차종')+1),asOf,sourceFile:fileName,sourceSheet:sheet,sourceRow:i+1});
    }
  }
  if(!rows.length)throw Error('용차A·용차B 시트와 차량번호·성명 열이 있는 운영 현황 명단을 선택하세요.');
  const groups=new Map();for(const r of rows){if(!groups.has(r.plate))groups.set(r.plate,[]);groups.get(r.plate).push(r);}
  const accepted=[];
  for(const items of groups.values()) {
    if(new Set(items.map(r=>r.grade+'|'+norm(r.name))).size>1){items.forEach(r=>held.push({...r,reason:'동일 차량의 구분·기사 충돌'}));continue;}
    accepted.push(items[0]);
  }
  return {rows:accepted,held,asOf,fileName};
}
export function fleetUsage(dispatch,history,date,{days=90,minDays=20,recentDays=5}={}) {
  const map=new Map(), end=addDays(date,1);
  for(const r of referenceHistory(dispatch,history,end,addDays(date,-days+1))) {
    const plate=normalizePlate(r.vehicleNo);if(!plate)continue;
    if(!map.has(plate))map.set(plate,{plate,days:new Set(),recent:new Set(),count:0,names:new Set(),lastDate:''});
    const s=map.get(plate);s.days.add(r.date);if(r.date>=addDays(date,-29))s.recent.add(r.date);
    s.count+=Number(r.count)||0;s.names.add(r.driver);if(r.date>s.lastDate)s.lastDate=r.date;
  }
  return [...map.values()].map(s=>({...s,days:s.days.size,recent:s.recent.size,names:[...s.names],candidate:s.days.size>=minDays&&s.recent.size>=recentDays})).sort((a,b)=>b.days-a.days||b.count-a.count);
}
export async function applyFleetRoster(parsed,registerMissing=false) {
  const database=await db.openDb();let result;
  await new Promise((resolve,reject)=>{
    const tx=database.transaction(['settings','drivers','equipment'],'readwrite'), values={};let left=3,failure;
    for(const name of ['settings','drivers','equipment'])tx.objectStore(name).getAll().onsuccess=e=>{
      values[name]=e.target.result;if(--left)return;
      try {
        const setting=values.settings.find(s=>s.key==='settings'), settings=setting?.value || {}, old=settings.fleet || {};
        if(old.asOf && parsed.asOf<old.asOf)throw Error('현재 명단보다 오래된 명단은 반영할 수 없습니다.');
        const roster=new Map((old.roster || []).map(r=>[r.plate,r]));
        const counts={registered:0,matched:0,held:0,equipment:0,heldDetails:[]};
        for(const r of parsed.rows) {
          roster.set(r.plate,r);
          const sameNames=parsed.rows.filter(x=>norm(x.name)===norm(r.name));
          const plateMatches=values.drivers.filter(d=>normalizePlate(d.vehicleNo)===r.plate);
          let matches=plateMatches;
          if(!matches.length)matches=values.drivers.filter(d=>[d.name,...(d.aliases || [])].some(n=>norm(n)===norm(r.name)));
          if((!plateMatches.length && sameNames.length>1) || matches.length>1 || (matches.length===1 && normalizePlate(matches[0].vehicleNo) && normalizePlate(matches[0].vehicleNo)!==r.plate) || (matches.length===1 && ![matches[0].name,...(matches[0].aliases || [])].some(n=>norm(n)===norm(r.name)))) {counts.held++;counts.heldDetails.push({plate:r.plate,name:r.name,reason:'동명이인·기존 차량번호·기사명 불일치 확인 필요'});
            if(registerMissing && !values.equipment.some(e=>normalizePlate(e.plateNo)===r.plate)) {
              const eq={id:uid('eqp'),plateNo:r.plate,driverId:'',driverName:'',type:'카캐리어',model:[r.vehicleType,r.manufacturer].filter(Boolean).join(' / '),capacity:0,status:'idle',memo:'운영 명단 등록 · 기사 연결·가동 상태·적재 대수 확인 필요'};
              tx.objectStore('equipment').put(eq);values.equipment.push(eq);counts.equipment++;
            }continue;}

          let d=matches[0];
          if(d) {counts.matched++;if(!d.vehicleNo){d={...d,vehicleNo:r.plate};tx.objectStore('drivers').put(d);}}
          else if(registerMissing) {
            d={id:uid('drv'),name:r.name,phone:r.phone,vehicleNo:r.plate,type:'용차',status:'active',aliases:[],preferred:[],avoid:[],schedule:{mode:'oncall',weekdays:[],exceptions:{},maxTurns:3,capacity:0},memo:'운영 현황 명단 등록 · 출근일과 적재 대수 확인 필요',createdAt:new Date().toISOString()};
            tx.objectStore('drivers').put(d);values.drivers.push(d);counts.registered++;
          }
          if(d && registerMissing && !values.equipment.some(e=>normalizePlate(e.plateNo)===r.plate)) {
            const eq={id:uid('eqp'),plateNo:r.plate,driverId:d.id,driverName:d.name,type:'카캐리어',model:[r.vehicleType,r.manufacturer].filter(Boolean).join(' / '),capacity:0,status:'idle',memo:'운영 명단 등록 · 가동 상태·적재 대수 확인 필요'};
            tx.objectStore('equipment').put(eq);values.equipment.push(eq);counts.equipment++;
          }
        }
        const fleet={...old,roster:[...roster.values()],asOf:parsed.asOf,sourceFile:parsed.fileName,importedAt:new Date().toISOString()};
        tx.objectStore('settings').put({key:'settings',value:{...settings,fleet}});result={...counts,fleet};
      }catch(e){failure=e;tx.abort();}
    };
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure || tx.error);
  });return result;
}
export async function setFixedCharter(plate,enabled,reason) {
  plate=normalizePlate(plate);if(!plate||!reason?.trim())throw Error('차량번호와 변경 사유를 입력하세요.');
  const database=await db.openDb();let result;
  await new Promise((resolve,reject)=>{
    const tx=database.transaction('settings','readwrite');let failure;
    tx.objectStore('settings').get('settings').onsuccess=e=>{
      const settings=e.target.result?.value || {},fleet=settings.fleet || {};
      if((fleet.roster || []).some(r=>r.plate===plate)){failure=Error('용차A·B 명단 차량은 C 고정용차로 변경할 수 없습니다.');tx.abort();return;}
      result={...fleet,fixed:{...(fleet.fixed || {}),[plate]:{enabled:!!enabled,reason:reason.trim(),updatedAt:new Date().toISOString()}}};
      tx.objectStore('settings').put({key:'settings',value:{...settings,fleet:result}});
    };
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(failure || tx.error);
  });return result;
}
