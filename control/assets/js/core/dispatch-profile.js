import {vehicleSafetyBlock} from './vehicle-safety-policy.js';
import {equipmentStructure,equipmentMatches} from './equipment-policy.js';
import { norm } from './utils.js';

export const routeKey = (order) => `${norm(order.origin)}→${norm(order.destination)}`;
const productIndexes = new WeakMap();
export function classifyOrder(order, products = []) {
  const model = norm(order.model), brand = norm(order.brand);
  let index = productIndexes.get(products);
  if (!index) { index = new Map(); for (const p of products) { const key = norm(p.model); const entries = index.get(key) || []; entries.push(p); index.set(key, entries); } productIndexes.set(products, index); }
  const matching = index.get(model) || [];
  const product = brand ? matching.find((p) => norm(p.brand) === brand) : matching.length === 1 ? matching[0] : null;
  return { ...order, cargoClass: order.cargoClass || product?.cargoClass || '', requiredEquipment: product?.requiredEquipment || order.transportType || order.requiredEquipment || '', minSkill: Math.max(Number(order.minSkill || 1), Number(product?.minSkill || 1)), weightKg: Number(order.weightKg || product?.weightKg || 0), equipmentConflict: !!(product?.requiredEquipment && order.transportType && norm(product.requiredEquipment) !== norm(order.transportType)) };
}
export function driverSimilarity(a, b) {
  const sa=equipmentStructure(a.equipment),sb=equipmentStructure(b.equipment);if(sa&&sb&&sa!==sb)return 0;
  if (!a.equipment?.type || !b.equipment?.type || norm(a.equipment.type) !== norm(b.equipment.type)) return 0;
  const ca = Number(a.equipment.capacity || 1), cb = Number(b.equipment.capacity || 1);
  let score = 0.5 + 0.25 * Math.min(ca, cb) / Math.max(ca, cb);
  if (a.skillLevel && b.skillLevel) score += 0.15 * (1 - Math.min(4, Math.abs(a.skillLevel - b.skillLevel)) / 4);
  if (a.baseOrigin && norm(a.baseOrigin) === norm(b.baseOrigin)) score += 0.1;
  return score;
}
export function compatible(order, driver) {
  if (order.equipmentConflict) return false;
  const eq = driver.equipment;
  if (eq && eq.status !== 'active') return false;
  if (vehicleSafetyBlock(eq,order.date)) return false;
  if (order.requiredEquipment && (!eq || !equipmentMatches(eq,order.requiredEquipment))) return false;
  if (Number(order.minSkill || 1) > Number(driver.skillLevel || 1)) return false;
  const allowed = eq?.supportedClasses || [];
  if (order.cargoClass && allowed.length && !allowed.some((v) => norm(v) === norm(order.cargoClass))) return false;
  if (driver.supportedClasses?.length && order.cargoClass && !driver.supportedClasses.some((v) => norm(v) === norm(order.cargoClass))) return false;
  if (order.weightKg && eq?.maxLoadKg && Number(order.weightKg) * Number(order.count || 1) > Number(eq.maxLoadKg)) return false;
  const time = String(order.departTime || '').match(/\b([01]\d|2[0-3]):[0-5]\d\b/)?.[0];
  if (time && driver.availableFrom && driver.availableTo) {
    const from = driver.availableFrom, to = driver.availableTo;
    if (from <= to ? time < from || time > to : time < from && time > to) return false;
  }
  return true;
}
