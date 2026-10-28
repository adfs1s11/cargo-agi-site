import { openDb } from './db.js';
import { reloadAll } from './data.js';
import { rotationLoad } from './schedule.js';

export function unassignChanges(values, from, to) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(from) || !/^20\d{2}-\d{2}-\d{2}$/.test(to) || from > to) throw Error('취소할 기간을 지정하세요.');
  const inRange = r => r.date >= from && r.date <= to;
  const closed = new Set(values.closings.filter(c => c.status === 'closed').map(c => c.month));
  const protectedIds = new Set(values.settlements.filter(s => ['confirmed', 'closed'].includes(s.status)).map(s => s.orderId));
  const eligible = values.dispatch.filter(r => inRange(r) && (!r.status || r.status === 'normal') && !closed.has(r.date.slice(0,7)) && !protectedIds.has(r.id));
  const ids = new Set(eligible.map(r => r.id));
  const plans = values.assignments.filter(p => (p.orderIds || []).some(id => ids.has(id)));
  const plannedIds = new Set(plans.flatMap(p => p.orderIds || []));
  const rows = eligible.filter(r => r.driver || r.vehicleNo || r.turn || plannedIds.has(r.id));
  const updates = rows.map(r => ({...r, driver:'', driverPhone:'', vehicleNo:'', turn:0, manualAssignmentClearedAt:new Date().toISOString(), updatedAt:new Date().toISOString()}));
  const keptPlans = [], removedPlans = [];
  for (const p of plans) {
    const orderIds = p.orderIds.filter(id => !ids.has(id));
    if (!orderIds.length) { removedPlans.push(p.id); continue; }
    const orderTurns = Object.fromEntries(Object.entries(p.orderTurns || {}).filter(([id]) => !ids.has(id)));
    const orders = values.dispatch.filter(r => orderIds.includes(r.id));
    keptPlans.push({...p, orderIds, orderTurns, regions:[...new Set(orders.map(r => r.region).filter(Boolean))], totalCount:orders.reduce((n,r)=>n+Number(r.count || 1),0), totalTurns:rotationLoad(orders.map(r=>({...r,turn:orderTurns[r.id] ?? r.turn}))).usedTurns, updatedAt:new Date().toISOString()});
  }
  return {updates, keptPlans, removedPlans, count:rows.length, protectedCount:values.dispatch.filter(r=>inRange(r) && (closed.has(r.date.slice(0,7)) || protectedIds.has(r.id))).length};
}

export async function cancelAssignments(from, to, preview = false) {
  const database = await openDb();
  const result = await new Promise((resolve,reject) => {
    const names=['dispatch','assignments','closings','settlements'];
    const tx=database.transaction(names,preview?'readonly':'readwrite'), values={};
    let remaining=names.length, result, failure;
    for (const name of names) tx.objectStore(name).getAll().onsuccess = e => {
      values[name]=e.target.result;
      if (--remaining) return;
      try {
        result=unassignChanges(values,from,to);
        if (!preview) {
          for (const r of result.updates) tx.objectStore('dispatch').put(r);
          for (const p of result.keptPlans) tx.objectStore('assignments').put(p);
          for (const id of result.removedPlans) tx.objectStore('assignments').delete(id);
        }
      } catch(e) {failure=e;tx.abort();}
    };
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(failure || tx.error || Error('배차 취소를 완료하지 못했습니다.'));
    tx.onerror=()=>reject(tx.error);
  });
  if (!preview) await reloadAll();
  return result;
}
