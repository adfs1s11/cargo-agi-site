import * as db from './db.js';
import { norm, uid } from './utils.js';
import { classifyOrder } from './dispatch-profile.js';

export const RATE_FIELDS = ['customer', 'driver', 'brand', 'model', 'cargoClass', 'origin', 'destination', 'transportType'];
export const money = (value) => {
  const s = String(value ?? '').trim().replaceAll(',', '').replace(/원$/, '');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s) || !Number.isFinite(Number(s))) throw Error('금액·수량은 숫자로 입력하세요.');
  return Number(s);
};
export const hashKey = (value) => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16); };
export function validateRate(rate) {
  if (!['sale', 'purchase'].includes(rate.side)) throw Error('매출 또는 매입을 선택하세요.');
  if (!['base', 'extra'].includes(rate.kind)) throw Error('기본 또는 추가요금을 선택하세요.');
  if (!['vehicle', 'trip', 'km'].includes(rate.basis)) throw Error('단가 기준을 확인하세요.');
  if (money(rate.price) < 0) throw Error('단가는 0 이상이어야 합니다.');
  if (money(rate.vatPercent) < 0 || money(rate.vatPercent) > 100) throw Error('부가세율은 0~100 사이로 입력하세요.');
  if (rate.minKm !== '' && rate.minKm != null && money(rate.minKm) < 0) throw Error('거리는 0 이상이어야 합니다.');
  if (rate.maxKm !== '' && rate.maxKm != null && money(rate.maxKm) < Number(rate.minKm || 0)) throw Error('최대 거리는 최소 거리 이상이어야 합니다.');
  if (rate.from && rate.to && rate.from > rate.to) throw Error('단가 적용 기간을 확인하세요.');
  if (!Number.isFinite(Number(rate.priority))) throw Error('우선순위를 확인하세요.');
  return { ...rate, price: money(rate.price), vatPercent: money(rate.vatPercent), priority: Number(rate.priority), name: String(rate.name || '단가') };
}
const bounded = (v) => v !== '' && v != null;
function match(rate, row, ignoreDistance = false) {
  if (rate.active === false || (rate.from && row.date < rate.from) || (rate.to && row.date > rate.to)) return false;
  if (!RATE_FIELDS.every((key) => !rate[key] || norm(rate[key]) === norm(row[key]))) return false;
  if (ignoreDistance) return true;
  if ((bounded(rate.minKm) || bounded(rate.maxKm) || rate.basis === 'km') && !bounded(row.distanceKm)) return false;
  return (!bounded(rate.minKm) || Number(row.distanceKm) >= Number(rate.minKm)) && (!bounded(rate.maxKm) || Number(row.distanceKm) <= Number(rate.maxKm));
}
const specificity = (r) => RATE_FIELDS.filter((key) => r[key]).length + Number(bounded(r.minKm) || bounded(r.maxKm)) + Number(!!r.from || !!r.to);
export function quoteSide(row, rates, side) {
  const relevant = rates.filter((r) => r.side === side && match(r, row, true));
  const issues = [];
  if (!bounded(row.distanceKm) && relevant.some((r) => bounded(r.minKm) || bounded(r.maxKm) || r.basis === 'km')) issues.push('거리 입력 필요');
  const matches = relevant.filter((r) => match(r, row));
  const bases = matches.filter((r) => r.kind === 'base').sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || specificity(b) - specificity(a));
  if (!bases.length) issues.push('기본단가 없음');
  else if (bases[1] && Number(bases[0].priority || 0) === Number(bases[1].priority || 0) && specificity(bases[0]) === specificity(bases[1])) issues.push('기본단가 충돌');
  const selected = issues.length ? [] : [bases[0], ...matches.filter((r) => r.kind === 'extra')];
  const lines = selected.map((r) => {
    const quantity = r.basis === 'vehicle' ? Number(row.count || 1) : r.basis === 'km' ? Number(row.distanceKm) : 1;
    const amount = Math.round(Number(r.price) * quantity);
    return { rateId: r.id, name: r.name, kind: r.kind, basis: r.basis, quantity, price: Number(r.price), vatPercent: Number(r.vatPercent || 0), conditions: Object.fromEntries(RATE_FIELDS.filter((k) => r[k]).map((k) => [k, r[k]])), from: r.from || '', to: r.to || '', minKm: r.minKm ?? '', maxKm: r.maxKm ?? '', priority: Number(r.priority || 0), amount, vat: Math.round(amount * Number(r.vatPercent || 0) / 100) };
  });
  return { amount: lines.reduce((n, l) => n + l.amount, 0), vat: lines.reduce((n, l) => n + l.vat, 0), lines, issues };
}
export function calculateSettlement(dispatch, rates, overrides = [], assignments = [], products = []) {
  const edits = new Map(overrides.map((e) => [e.orderId, e]));
  const plans = new Map();
  for (const p of assignments.filter((p) => p.status === 'confirmed')) for (const id of p.orderIds || []) plans.set(id, p);
  return dispatch.filter((r) => !['cancelled', 'notshipped', 'support'].includes(r.status) && Number(r.count || 1) > 0).map((original) => {
    const edit = edits.get(original.id) || {};
    const plan = plans.get(original.id);
    const row = { ...classifyOrder(original, products), driver: plan?.date === original.date ? plan.driverName : original.driver };
    row.transportType = row.transportType || row.requiredEquipment || '';
    for (const key of ['distanceKm', 'transportType', 'cargoClass']) if (edit[key] !== undefined) row[key] = edit[key];
    const sale = quoteSide(row, rates, 'sale'), purchase = quoteSide(row, rates, 'purchase');
    const issues = [];
    if (!row.driver || ['취소', '지원', '미출고'].includes(row.driver)) issues.push('기사 미배정');
    for (const [side, quote] of [['sale', sale], ['purchase', purchase]]) {
      if (edit.source === 'import') {
        quote.amount = Number(edit[side + 'Amount']); quote.vat = Number(edit[side + 'Vat'] || 0);
        quote.lines = [{ name: '마감 엑셀 확정금액', amount: quote.amount, vat: quote.vat }]; quote.issues = [];
        if (!Number.isFinite(quote.amount) || quote.amount < 0 || !Number.isFinite(quote.vat) || quote.vat < 0) quote.issues.push('가져온 금액 확인 필요');
      }
      const adjustment = Number(edit[side + 'Adjustment'] || 0), adjustmentVat = Number(edit[side + 'AdjustmentVat'] || 0);
      if (adjustment || adjustmentVat) quote.lines.push({ name: '수동 조정', amount: adjustment, vat: adjustmentVat });
      quote.amount += adjustment; quote.vat += adjustmentVat;
      if (quote.amount < 0 || quote.vat < 0 || !Number.isFinite(quote.amount) || !Number.isFinite(quote.vat)) quote.issues.push('조정 금액 확인 필요');
      issues.push(...quote.issues.map((text) => `${side === 'sale' ? '매출' : '매입'} ${text}`));
    }
    return { id: `stl_${row.id}`, orderId: row.id, date: row.date, customer: row.customer || '', driver: row.driver || '', brand: row.brand || '', model: row.model || '', origin: row.origin || '', destination: row.destination || '', vin: row.vin || '', count: Number(row.count || 1), distanceKm: row.distanceKm ?? '', transportType: row.transportType || '', cargoClass: row.cargoClass || '', sale, purchase, margin: sale.amount - purchase.amount, issues, note: edit.note || '', source: edit.source || 'rates' };
  });
}
export function totals(entries) {
  return entries.reduce((t, e) => ({ count: t.count + e.count, sale: t.sale + e.sale.amount, saleVat: t.saleVat + e.sale.vat, purchase: t.purchase + e.purchase.amount, purchaseVat: t.purchaseVat + e.purchase.vat, margin: t.margin + e.margin, unresolved: t.unresolved + Number(e.issues.length > 0) }), { count: 0, sale: 0, saleVat: 0, purchase: 0, purchaseVat: 0, margin: 0, unresolved: 0 });
}
export async function loadSettlementData() {
  const names = ['rates', 'settlements', 'closings', 'settlementImports'];
  return Object.fromEntries(await Promise.all(names.map(async (key) => [key, await db.getAll(key)])));
}
/* A shared read-write transaction prevents closing/edits racing across tabs. */
export async function saveDrafts(month, rows, importRecord = null) {
  const database = await db.openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['settlements', 'closings', 'settlementImports'], 'readwrite');
    let problem;
    tx.objectStore('closings').getAll().onsuccess = (event) => {
      if (event.target.result.some((c) => c.month === month && c.status === 'closed')) { problem = Error('마감된 월은 수정할 수 없습니다. 먼저 마감을 해제하세요.'); tx.abort(); return; }
      for (const row of rows) { if (!row.date?.startsWith(month) || !row.orderId) { problem = Error('정산 월과 운송일이 일치하지 않습니다.'); tx.abort(); return; } tx.objectStore('settlements').put({ ...row, id: `stl_${row.orderId}`, updatedAt: new Date().toISOString() }); }
      if (importRecord) tx.objectStore('settlementImports').put(importRecord);
    };
    tx.oncomplete = resolve; tx.onabort = () => reject(problem || tx.error || Error('저장을 취소했습니다.')); tx.onerror = () => reject(tx.error);
  });
}
export async function closeMonth(month) {
  const database = await db.openDb();
  return new Promise((resolve, reject) => {
    const names = ['dispatch', 'rates', 'settlements', 'closings', 'assignments', 'products'];
    const tx = database.transaction(names, 'readwrite'), values = {}; let left = names.length, failure, snapshot;
    const fail = (message) => { failure = Error(message); tx.abort(); };
    for (const name of names) tx.objectStore(name).getAll().onsuccess = (event) => {
      values[name] = event.target.result; if (--left) return;
      if (values.closings.some((c) => c.month === month && c.status === 'closed')) return fail('이미 마감된 월입니다.');
      const entries = calculateSettlement(values.dispatch.filter((r) => r.date?.startsWith(month)), values.rates, values.settlements, values.assignments, values.products);
      if (!entries.length) return fail('마감할 운송건이 없습니다.');
      if (entries.some((e) => e.issues.length)) return fail('미배정·미등록 단가·충돌 등 확인 대상이 남아 있습니다.');
      snapshot = { id: uid('closing'), month, status: 'closed', entries, totals: totals(entries), closedAt: new Date().toISOString(), closedBy: '관리자', version: values.closings.filter((c) => c.month === month).length + 1 };
      tx.objectStore('closings').put(snapshot);
    };
    tx.oncomplete = () => resolve(snapshot); tx.onabort = () => reject(failure || tx.error || Error('마감 취소')); tx.onerror = () => reject(tx.error);
  });
}
export async function reopenMonth(id, reason) {
  if (!reason.trim()) throw Error('마감 해제 사유를 입력하세요.');
  const database = await db.openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('closings', 'readwrite');
    tx.objectStore('closings').get(id).onsuccess = (e) => { const row = e.target.result; if (row?.status === 'closed') tx.objectStore('closings').put({ ...row, status: 'reopened', reopenedAt: new Date().toISOString(), reopenReason: reason.trim() }); };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
