/* global XLSX */
import { diffDays, num, str, todayStr, uid, ymd } from './utils.js';
export { SAFETY_SOURCE } from './safety-seed.js';

export const SAFETY_CHECK_LABELS = {
  deckLift: '2층 인양장치',
  deckFall: '2층 낙하방지',
  fallProtect: '추락방지',
  workPlan: '작업계획서',
  specialInspection: '특장점검',
  regularInspection: '정기검사',
};

export const SAFETY_CHECKS = ['deckLift', 'deckFall', 'fallProtect', 'workPlan', 'specialInspection', 'regularInspection'];
export const SAFETY_SCORE_CHECKS = ['deckFall', 'fallProtect', 'workPlan', 'specialInspection', 'regularInspection'];

const PENDING_RE = /확인\s*중|모름|미확인|자료\s*없|미조사/;
const NA_RE = /해당\s*없|고정축|가변축\s*없|미사용/;
const PLANNED_RE = /예정|작성\s*예정|교체\s*예정|교체예정/;
const NONE_RE = /^없음$|미설치|미장착|미부착/;

const norm = (v) => str(v).replace(/\s+/g, '').toLowerCase();

export function parseSafetyMonth(value, baseYear = new Date().getFullYear()) {
  const s = str(value);
  if (!s) return null;
  let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return { year: y, month: mo, date: new Date(y, mo - 1, 1) };
  }
  m = s.match(/(\d{2})\s*[.\-/년]\s*(\d{1,2})/);
  if (m) {
    const y = 2000 + Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return { year: y, month: mo, date: new Date(y, mo - 1, 1) };
  }
  m = s.match(/(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?/);
  if (m) {
    const mo = Number(m[1]);
    const day = Number(m[2] || 1);
    if (mo >= 1 && mo <= 12) return { year: baseYear, month: mo, date: new Date(baseYear, mo - 1, day) };
  }
  return null;
}

function monthEnd(parsed) {
  return ymd(new Date(parsed.year, parsed.month, 0));
}

function dateStatus(value, kind) {
  const raw = str(value);
  const parsed = parseSafetyMonth(raw);
  if (!parsed) return { code: 'ok', tone: 'gray', label: raw || '-', detail: raw };
  const end = monthEnd(parsed);
  const days = diffDays(todayStr(), end);
  const planned = PLANNED_RE.test(raw);
  if (planned && days < 0) return { code: 'overdue', tone: 'red', label: '예정일 경과', detail: `${raw} · ${Math.abs(days)}일 경과`, dueDays: days };
  if (planned) return { code: 'scheduled', tone: days <= 60 ? 'amber' : 'blue', label: days === 0 ? '이번 달' : `${days}일 후`, detail: raw, dueDays: days };
  if (kind === 'special' && days < -365) return { code: 'overdue', tone: 'red', label: '12개월 경과', detail: `${raw} · ${Math.abs(days)}일 경과`, dueDays: days };
  if (kind === 'special' && days < -300) return { code: 'due', tone: 'amber', label: '점검 임박', detail: raw, dueDays: days };
  return { code: 'ok', tone: 'gray', label: raw, detail: raw };
}

export function safetyItem(record, key) {
  const raw = str(record?.[key]);
  const base = { key, label: SAFETY_CHECK_LABELS[key], raw };
  if (!raw) return { ...base, code: 'missing', tone: 'amber', label: '미입력', detail: '자료 없음' };

  if (key === 'specialInspection' || key === 'regularInspection') {
    if (PENDING_RE.test(raw)) return { ...base, code: 'pending', tone: 'amber', label: '확인중', detail: raw };
    if (NA_RE.test(raw)) return { ...base, code: 'na', tone: 'gray', label: '해당없음', detail: raw };
    const ds = dateStatus(raw, key === 'specialInspection' ? 'special' : 'regular');
    return { ...base, ...ds };
  }

  if (PENDING_RE.test(raw)) return { ...base, code: 'pending', tone: 'amber', label: '확인중', detail: raw };
  if (NA_RE.test(raw)) return { ...base, code: 'na', tone: 'gray', label: '해당없음', detail: raw };
  if (key === 'fallProtect' && PLANNED_RE.test(raw)) return { ...base, code: 'planned', tone: 'amber', label: '설치 예정', detail: raw };
  if (key === 'workPlan' && PLANNED_RE.test(raw)) return { ...base, code: 'planned', tone: 'amber', label: '작성 예정', detail: raw };
  if (NONE_RE.test(raw)) return { ...base, code: key === 'deckLift' ? 'na' : 'risk', tone: key === 'deckLift' ? 'gray' : 'red', label: key === 'deckLift' ? '없음' : '미설치', detail: raw };
  return { ...base, code: 'ok', tone: 'gray', label: raw, detail: raw };
}

export function safetySummary(record) {
  const items = SAFETY_SCORE_CHECKS.map((key) => safetyItem(record, key));
  const all = SAFETY_CHECKS.map((key) => safetyItem(record, key));
  const risk = items.filter((i) => i.code === 'risk' || i.code === 'overdue').length;
  const pending = items.filter((i) => i.code === 'pending' || i.code === 'missing').length;
  const planned = items.filter((i) => i.code === 'planned' || i.code === 'due').length;
  const scheduled = items.filter((i) => i.code === 'scheduled');
  const done = items.filter((i) => i.code === 'ok' || i.code === 'na').length;
  const completion = Math.round((done / Math.max(1, items.length)) * 100);
  const dueSoon = scheduled.filter((i) => typeof i.dueDays === 'number' && i.dueDays <= 60);
  const status = risk ? 'risk' : pending ? 'pending' : planned ? 'planned' : 'ok';
  return {
    items, all, risk, pending, planned, scheduled, done, completion, dueSoon,
    action: risk + planned,
    attention: risk + planned + pending,
    status,
    label: risk ? `조치 ${risk}` : pending ? `확인 ${pending}` : planned ? `예정 ${planned}` : '정상',
  };
}

export function safetyForPlate(records, plate) {
  const p = norm(plate);
  if (!p) return [];
  return (records || []).filter((r) => norm(r.plateNo) === p);
}

export function safetySnapshot(records) {
  const rows = records || [];
  const active = rows.filter((r) => r.active !== false);
  const summaries = new Map(active.map((r) => [r.id, safetySummary(r)]));
  const list = (fn) => active.filter((r) => fn(summaries.get(r.id), r));
  const pending = list((s) => s.pending > 0);
  const action = list((s) => s.risk > 0 || s.planned > 0);
  const overdue = list((s) => s.risk > 0);
  const dueSoon = list((s) => s.dueSoon.length > 0);
  const attention = list((s) => s.attention > 0);
  const companies = {};
  const types = {};
  for (const r of active) {
    companies[r.company || '기타'] = (companies[r.company || '기타'] || 0) + 1;
    const t = String(r.bodyType || '기타').replace(/\s*\(.*?\)\s*/g, '');
    types[t] = (types[t] || 0) + 1;
  }
  const avgCompletion = active.length ? Math.round(active.reduce((s, r) => s + (summaries.get(r.id)?.completion || 0), 0) / active.length) : 0;
  return {
    total: rows.length,
    active: active.length,
    inactive: rows.length - active.length,
    pending: pending.length,
    action: action.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    attention: attention.length,
    avgCompletion,
    companies,
    types,
    summaries,
  };
}

/* ---------------- Excel parsing ---------------- */
const HEADER_ALIASES = {
  no: ['no.', 'no', '번호'],
  company: ['운송사', '회사'],
  ownership: ['소속여부', '소속'],
  bodyType: ['차체구조', '차체', '차종'],
  year: ['차량연식', '연식'],
  approvalYear: ['특장승인연도', '승인연도'],
  ageBand: ['연식구분', '연식대'],
  tonnage: ['승인톤수', '톤수'],
  capacity: ['최대적재수량', '최대적재', '적재수량'],
  plateNo: ['차량번호', '번호판'],
  upfitter: ['특장장비업체', '특장업체', '업체'],
  replacePlan: ['차량교체예정', '교체예정', '운행제외'],
  deckLift: ['2층데크인양장치', '인양장치'],
  deckFall: ['2층데크낙하방지', '낙하방지'],
  fallProtect: ['추락방지'],
  workPlan: ['작업계획서'],
  specialInspection: ['특장장비최근점검일', '특장점검', '최근점검일'],
  regularInspection: ['정기검사일', '정기검사', '가변축'],
  operating: ['운행여부', '운행'],
};

const cleanHeader = (v) => str(v).replace(/\s+/g, '').replace(/[()[\]{}·\-_/]/g, '').toLowerCase();

function findHeader(grid) {
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const row = grid[i] || [];
    const cells = row.map(cleanHeader);
    const hasPlate = cells.some((c) => c.includes('차량번호'));
    const hasCompany = cells.some((c) => c.includes('운송사'));
    const hasCarrier = cells.some((c) => c.includes('차체') || c.includes('차량연식'));
    if (hasPlate && (hasCompany || hasCarrier)) return i;
  }
  return -1;
}

function mapHeader(row) {
  const mapping = {};
  row.forEach((h, i) => {
    const c = cleanHeader(h);
    if (!c) return;
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (mapping[key] !== undefined) continue;
      if (aliases.some((a) => c.includes(cleanHeader(a)))) mapping[key] = i;
    }
  });
  return mapping;
}

export function normalizeSafetyRow(raw, index = 0, meta = {}) {
  const get = (key) => {
    const v = raw[key];
    if (v === null || v === undefined) return '';
    return typeof v === 'string' ? v.trim() : v;
  };
  const no = Number(get('no')) || index + 1;
  const plateNo = str(get('plateNo')).replace(/\s+/g, '');
  const operating = str(get('operating'));
  const row = {
    id: str(raw.id) || `saf_${no}_${plateNo || index}`,
    no,
    company: str(get('company')),
    ownership: str(get('ownership')),
    bodyType: str(get('bodyType')),
    year: Number(get('year')) || '',
    approvalYear: Number(get('approvalYear')) || '',
    ageBand: str(get('ageBand')),
    tonnage: num(get('tonnage')),
    capacity: num(get('capacity')),
    plateNo,
    upfitter: str(get('upfitter')),
    replacePlan: str(get('replacePlan')),
    deckLift: str(get('deckLift')),
    deckFall: str(get('deckFall')),
    fallProtect: str(get('fallProtect')),
    workPlan: str(get('workPlan')),
    specialInspection: str(get('specialInspection')),
    regularInspection: str(get('regularInspection')),
    operating,
    active: operating === '○' || /^운행|운행중|가동/.test(operating),
    memo: str(get('memo')),
    sourceFile: str(meta.fileName || raw.sourceFile),
    sourceDate: str(meta.sourceDate || raw.sourceDate || todayStr()),
    importedAt: meta.importedAt || new Date().toISOString(),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!row.plateNo) return null;
  return row;
}

export function parseSafetyWorkbook(buffer, fileName = '') {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  let best = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
    const headerIndex = findHeader(grid);
    if (headerIndex < 0) continue;
    const mapping = mapHeader(grid[headerIndex]);
    if (mapping.plateNo === undefined) continue;
    const body = grid.slice(headerIndex + 1).filter((r) => r.some((c) => str(c)));
    if (!best || body.length > best.body.length) best = { name, headerIndex, mapping, body, headers: grid[headerIndex] };
  }
  if (!best) throw new Error('차량번호·운송사 헤더를 찾지 못했습니다. Tesla 안전관리 원본 형식인지 확인하세요.');

  const rows = [];
  const warnings = [];
  const seen = new Map();
  best.body.forEach((cells, i) => {
    const raw = {};
    for (const [key, idx] of Object.entries(best.mapping)) raw[key] = cells[idx];
    const row = normalizeSafetyRow(raw, i, { fileName });
    if (!row) return;
    const key = `${row.no}|${row.plateNo}`;
    if (seen.has(key)) {
      warnings.push(`${row.plateNo} 중복 행 ${row.no} · 뒤 행을 유지했습니다.`);
      rows[seen.get(key)] = row;
      return;
    }
    seen.set(key, rows.length);
    rows.push(row);
  });

  const plates = new Map();
  for (const r of rows) plates.set(r.plateNo, (plates.get(r.plateNo) || 0) + 1);
  const dup = [...plates.entries()].filter(([, n]) => n > 1);
  if (dup.length) warnings.push(`차량번호 중복 ${dup.length}건: ${dup.slice(0, 4).map(([p, n]) => `${p}(${n})`).join(', ')}`);

  return {
    rows,
    sheetName: best.name,
    headerRow: best.headerIndex + 1,
    warnings,
    totals: {
      rows: rows.length,
      active: rows.filter((r) => r.active).length,
      companies: [...new Set(rows.map((r) => r.company).filter(Boolean))],
      duplicates: dup.length,
    },
  };
}

export const SAFETY_EXPORT_HEADERS = [
  'No.', '운송사', '소속여부', '차체 구조', '차량연식', '특장 승인연도', '연식구분', '승인톤수', '최대적재수량',
  '차량번호', '특장장비업체', '차량 교체 예정', '2층 데크 인양장치명', '2층 데크 낙하방지 시설', '추락방지 시설유무',
  '화물자동차 작업계획서', '특장장비 최근점검일', '화물자동차 정기검사일', '운행여부', '메모',
];

export function toSafetyExportRow(r) {
  return [
    r.no, r.company, r.ownership, r.bodyType, r.year, r.approvalYear, r.ageBand, r.tonnage, r.capacity,
    r.plateNo, r.upfitter, r.replacePlan, r.deckLift, r.deckFall, r.fallProtect, r.workPlan,
    r.specialInspection, r.regularInspection, r.operating, r.memo,
  ];
}

export function safetyAttentionLabel(summary) {
  if (!summary) return '미확인';
  if (summary.risk) return `조치 ${summary.risk}`;
  if (summary.planned) return `예정 ${summary.planned}`;
  if (summary.pending) return `확인 ${summary.pending}`;
  return '정상';
}

export function safetyItemSummary(record) {
  return SAFETY_CHECKS.map((key) => safetyItem(record, key));
}

export function newSafetyDraft(plateNo = '') {
  return {
    id: uid('saf'), no: '', company: '', ownership: '', bodyType: '카고형(Rigid Truck)',
    year: '', approvalYear: '', ageBand: '', tonnage: '', capacity: '', plateNo,
    upfitter: '', replacePlan: '', deckLift: '', deckFall: '', fallProtect: '', workPlan: '',
    specialInspection: '', regularInspection: '', operating: '○', active: true, memo: '',
    sourceFile: '직접 입력', sourceDate: todayStr(), importedAt: new Date().toISOString(),
  };
}
