import {vehicleSafetyBlock} from './vehicle-safety-policy.js';
import { norm } from './utils.js';

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const SCHEDULE_MODES = { daily: '매일 운행', weekly: '요일별 운행', oncall: '출근일 별도 지정' };
export function validDate(date) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(date || '') && !Number.isNaN(Date.parse(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
}
export function validateSchedule(value = {}) {
  const mode = value.mode || 'daily';
  if (!Object.hasOwn(SCHEDULE_MODES, mode)) throw Error('운행 유형을 확인하세요.');
  const weekdays = [...new Set(value.weekdays || [])];
  if (weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6)) throw Error('운행 요일을 확인하세요.');
  if (mode === 'weekly' && !weekdays.length) throw Error('운행 요일을 하나 이상 선택하세요.');
  const exceptions = {};
  for (const [date, item] of Object.entries(value.exceptions || {})) {
    if (!validDate(date) || !['available', 'off'].includes(item?.status)) throw Error('날짜별 출근·휴무를 확인하세요.');
    exceptions[date] = { status: item.status, reason: String(item.reason || '').trim().slice(0, 300) };
  }
  const capacity = Number(value.capacity || 0), maxTurns = Number(value.maxTurns || 3);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 50) throw Error('회전당 상차 대수는 1~50대 또는 미설정으로 입력하세요.');
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 20) throw Error('일일 회전 한도는 1~20회로 입력하세요.');
  const extraReason = String(value.extraReason || '').trim().slice(0,300);
  if (maxTurns > 3 && !extraReason) throw Error('3회전 초과 시 소형차량·특수 운송 등 허용 사유를 입력하세요.');
  return { mode, weekdays, exceptions, capacity, maxTurns, extraReason };
}
export function scheduleLabel(driver) {
  const safetyBlock=vehicleSafetyBlock(eq,date);if(safetyBlock)return {available:false,reason:safetyBlock};
  const schedule = driver.schedule || { mode: 'daily' };
  return (SCHEDULE_MODES[schedule.mode] || SCHEDULE_MODES.daily) + (schedule.mode === 'weekly' ? ' · ' + (schedule.weekdays || []).map(n=>WEEKDAYS[n]).join('·') : '');
}
export function equipmentFor(driver, equipment = []) {
  return (driver.vehicleNo && equipment.find(e => norm(e.plateNo) === norm(driver.vehicleNo))) || equipment.find(e => e.driverId === driver.id) || null;
}
export function availabilityOn(driver, date, equipment = []) {
  if (!validDate(date)) return { available: false, reason: '날짜 확인 필요' };
  if (driver.status !== 'active') return { available: false, reason: '비활동 기사' };
  const eq = equipmentFor(driver, equipment);
  if (eq && eq.status !== 'active') return { available: false, reason: eq.status === 'maintenance' ? '차량 정비' : eq.status === 'pending' ? '차량 가동 상태 확인 필요' : '차량 비가동' };
  const safetyBlock=vehicleSafetyBlock(eq,date);if(safetyBlock)return {available:false,reason:safetyBlock};
  const schedule = driver.schedule || { mode: 'daily' }, exception = schedule.exceptions?.[date];
  if (exception) return { available: exception.status === 'available', reason: `${exception.status === 'available' ? '지정 출근' : '지정 휴무'}${exception.reason ? ' · ' + exception.reason : ''}` };
  if (schedule.mode === 'oncall') return { available: false, reason: '출근일 미지정' };
  if (schedule.mode === 'weekly' && !(schedule.weekdays || []).includes(new Date(date + 'T00:00:00Z').getUTCDay())) return { available: false, reason: '정기 휴무' };
  return { available: true, reason: schedule.mode === 'weekly' ? '정기 운행일' : '매일 운행' };
}
// 회전은 횟수 합계가 아니라 기사·일자 내 회전 번호다. 미기입은 개별 미확인 회전으로 유지한다.
export function loadPolicy(driver, equipment = []) {
  const eq = equipmentFor(driver, equipment), sc = driver.schedule || {};
  const driverCapacity=Number(sc.capacity||0),vehicleCapacity=Number(eq?.capacity||0);
  const capacity=driverCapacity>0&&vehicleCapacity>0?Math.min(driverCapacity,vehicleCapacity):driverCapacity||vehicleCapacity;
  return { capacity: Number.isInteger(capacity) && capacity > 0 ? capacity : 0, maxTurns: Number.isInteger(Number(sc.maxTurns)) && Number(sc.maxTurns)>0 && (Number(sc.maxTurns)<=3 || String(sc.extraReason || '').trim()) ? Math.min(20,Number(sc.maxTurns)) : 3, extraReason: sc.extraReason || '' };
}
export function effectiveOrders(date, dispatch = [], assignments = []) {
  const overlay = new Map();
  for (const plan of assignments.filter(p => p.date === date && p.status === 'confirmed')) for (const id of plan.orderIds || []) overlay.set(id, plan);
  return dispatch.filter(r => r.date === date && !['cancelled','notshipped','support'].includes(r.status)).map(r => {
    const p = overlay.get(r.id);
    return p ? {...r, driverId:p.driverId, driver:p.driverName, vehicleNo:p.vehicleNo, turn:p.orderTurns?.[r.id] ?? r.turn} : r;
  });
}
export function rotationLoad(orders, capacity = 0) {
  const groups = new Map(); let unknown = 0, invalidCount = 0;
  for (const r of orders) {
    const turn = Number(r.turn), known = Number.isInteger(turn) && turn > 0;
    if (!known) unknown++;
    const key = known ? String(turn) : 'unknown:' + r.id;
    if (!groups.has(key)) groups.set(key,{turn:known?turn:null,count:0,orders:[],origins:new Set()});
    const g=groups.get(key), count=Number(r.count);
    if (!Number.isInteger(count) || count < 1) invalidCount++;
    else g.count+=count;
    g.orders.push(r); g.origins.add(norm(r.origin));
  }
  const turns=[...groups.values()].sort((a,b)=>(a.turn ?? Infinity)-(b.turn ?? Infinity));
  return {turns, usedTurns:Math.max(turns.length,...turns.map(t=>t.turn || 0),0), unknown, invalidCount,
    count:turns.reduce((n,t)=>n+t.count,0), overloaded:capacity>0 && turns.some(t=>t.count>capacity), mixedOrigin:turns.some(t=>t.origins.size>1)};
}
export function allocateTurn(booked, order, policy) {
  if (!norm(order.origin) || !policy.capacity || !Number.isInteger(Number(order.count)) || Number(order.count)<1 || Number(order.count)>policy.capacity) return null;
  const load=rotationLoad(booked,policy.capacity);
  if (load.unknown || load.invalidCount || load.overloaded || load.mixedOrigin) return null;
  const requested=Number(order.turn);
  for(let n=1;n<=policy.maxTurns;n++) {
    if (Number.isInteger(requested) && requested>0 && requested!==n) continue;
    const t=load.turns.find(t=>t.turn===n);
    if (!t || (t.count+Number(order.count)<=policy.capacity && t.origins.has(norm(order.origin)))) return n;
  }
  return null;
}
export function availabilityRows(drivers, date, equipment = [], dispatch = [], assignments = []) {
  const orders=effectiveOrders(date,dispatch,assignments);
  return drivers.map(driver=>{
    const result=availabilityOn(driver,date,equipment), eq=equipmentFor(driver,equipment), policy=loadPolicy(driver,equipment);
    const names=[driver.name,...(driver.aliases || [])].map(norm);
    const booked=orders.filter(r=>r.driverId ? r.driverId===driver.id : !!r.driver && names.includes(norm(r.driver)));
    const load=rotationLoad(booked,policy.capacity), remainingTurns=Math.max(0,policy.maxTurns-load.usedTurns);
    const review=load.unknown>0 || load.invalidCount>0 || load.mixedOrigin || !policy.capacity;
    const over=load.overloaded || load.usedTurns>policy.maxTurns;
    return {driver,equipment:eq,...result,...policy,...load,booked,remainingTurns,orders:booked.length,
      remainingCount:policy.capacity ? Math.max(0,policy.capacity*policy.maxTurns-load.count) : 0,
      conflict:(!result.available && booked.length>0)||over, review, over,
      canAssign:result.available && !review && !over && policy.capacity*policy.maxTurns>load.count,
      free:result.available && booked.length===0};
  });
}
