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
  return { mode, weekdays, exceptions };
}
export function scheduleLabel(driver) {
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
  if (eq && eq.status !== 'active') return { available: false, reason: eq.status === 'maintenance' ? '차량 정비' : '차량 비가동' };
  const schedule = driver.schedule || { mode: 'daily' }, exception = schedule.exceptions?.[date];
  if (exception) return { available: exception.status === 'available', reason: `${exception.status === 'available' ? '지정 출근' : '지정 휴무'}${exception.reason ? ' · ' + exception.reason : ''}` };
  if (schedule.mode === 'oncall') return { available: false, reason: '출근일 미지정' };
  if (schedule.mode === 'weekly' && !(schedule.weekdays || []).includes(new Date(date + 'T00:00:00Z').getUTCDay())) return { available: false, reason: '정기 휴무' };
  return { available: true, reason: schedule.mode === 'weekly' ? '정기 운행일' : '매일 운행' };
}
export function availabilityRows(drivers, date, equipment = [], dispatch = [], assignments = []) {
  const overlay = new Map();
  for (const plan of assignments.filter(p => p.date === date && p.status === 'confirmed')) for (const id of plan.orderIds || []) overlay.set(id, plan);
  const orders = dispatch.filter(r => r.date === date && !['cancelled', 'notshipped', 'support'].includes(r.status));
  return drivers.map(driver => {
    const result = availabilityOn(driver, date, equipment), eq = equipmentFor(driver, equipment);
    const names = [driver.name, ...(driver.aliases || [])].map(norm);
    const booked = orders.filter(r => { const plan = overlay.get(r.id); return plan ? (plan.driverId ? plan.driverId === driver.id : names.includes(norm(plan.driverName))) : !!r.driver && names.includes(norm(r.driver)); });
    return { driver, equipment: eq, ...result, orders: booked.length, count: booked.reduce((n,r)=>n+Number(r.count || 1),0), conflict: !result.available && booked.length > 0, free: result.available && booked.length === 0 };
  });
}
