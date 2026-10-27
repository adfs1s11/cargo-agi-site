/* Google Sheets 연동 (Apps Script 웹앱) */
import { state, saveSettings, reloadAll } from './data.js';
import * as db from './db.js';

export const TABLE_NAMES = {
  drivers: 'DRIVERS',
  equipment: 'EQUIPMENT',
  products: 'PRODUCTS',
  incidents: 'INCIDENTS',
  assignments: 'ASSIGNMENTS',
  dispatch: 'DISPATCH',
  imports: 'IMPORTS',
};

export const TABLE_LABELS = {
  drivers: '기사', equipment: '운송차량', products: '상품차량',
  incidents: '사고·클레임', assignments: '가배차', dispatch: '배차 원장', imports: '가져오기 이력',
};

function config() {
  const g = state.settings.google || {};
  if (!g.url) throw new Error('Apps Script 웹앱 URL이 설정되지 않았습니다.');
  return g;
}

async function call(action, payload = {}, { timeout = 45000 } = {}) {
  const g = config();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(g.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: g.token || '', action, payload }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`서버 응답을 해석할 수 없습니다. (${res.status}) ${text.slice(0, 120)}`); }
    if (!data.ok) throw new Error(data.error || '요청이 실패했습니다.');
    return data.data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('응답 시간이 초과되었습니다. 웹앱 배포 상태를 확인하세요.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function ping() {
  const data = await call('ping');
  return data;
}

export async function listTable(table) {
  if (!TABLE_NAMES[table]) throw new Error('알 수 없는 테이블입니다.');
  const data = await call('list', { table: TABLE_NAMES[table] });
  return Array.isArray(data?.rows) ? data.rows : [];
}

export async function pushTable(table) {
  if (!TABLE_NAMES[table]) throw new Error('알 수 없는 테이블입니다.');
  const rows = await db.getAll(table);
  if (!rows.length) return { pushed: 0 };
  let pushed = 0;
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    await call('upsert', { table: TABLE_NAMES[table], rows: slice });
    pushed += slice.length;
  }
  return { pushed };
}

export async function pullTable(table) {
  const rows = await listTable(table);
  if (!rows.length) return { pulled: 0 };
  const mapped = rows.map((r) => normalizeIncoming(table, r));
  await db.bulkPut(table, mapped);
  return { pulled: mapped.length };
}

export async function uploadPhoto(dataUrl, name = 'photo.jpg') {
  const data = await call('uploadPhoto', { dataUrl, name }, { timeout: 90000 });
  return data;
}

export async function pushAll(onProgress = () => {}) {
  const tables = ['drivers', 'equipment', 'products', 'incidents', 'assignments', 'dispatch'];
  const out = {};
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    onProgress(i / tables.length, `${TABLE_LABELS[t]} 업로드 중…`);
    out[t] = await pushTable(t);
  }
  await saveSettings({ google: { lastSync: new Date().toISOString() } });
  onProgress(1, '완료');
  return out;
}

export async function pullAll(onProgress = () => {}) {
  const tables = ['drivers', 'equipment', 'products', 'incidents', 'assignments', 'dispatch'];
  const out = {};
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    onProgress(i / tables.length, `${TABLE_LABELS[t]} 내려받는 중…`);
    out[t] = await pullTable(t);
  }
  await reloadAll();
  await saveSettings({ google: { lastSync: new Date().toISOString() } });
  onProgress(1, '완료');
  return out;
}

const JSON_FIELDS = ['preferred', 'avoid', 'aliases', 'orderIds', 'regions', 'reasons', 'photos', 'warnings', 'sheets', 'dates'];

function normalizeIncoming(table, r) {
  const out = { ...r };
  for (const k of JSON_FIELDS) {
    if (typeof out[k] === 'string' && out[k].trim().startsWith('[')) {
      try { out[k] = JSON.parse(out[k]); } catch { /* keep */ }
    }
  }
  for (const k of ['count', 'turn', 'capacity', 'price', 'cost', 'totalCount', 'totalTurns', 'score', 'billed', 'unpaid', 'supportAmount']) {
    if (out[k] !== undefined && out[k] !== '') out[k] = Number(out[k]);
  }
  if (!out.id) out.id = `${table}_${Math.random().toString(36).slice(2)}`;
  return out;
}

export async function syncStatus() {
  const g = state.settings.google;
  return { configured: !!(g?.url && g?.token), lastSync: g?.lastSync || null };
}
