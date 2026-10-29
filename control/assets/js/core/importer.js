/* 배차판(XLSX/CSV/ODS) 파서 — 실제 M&M 배차판 열 구조 기준 */
import { ymd, pad2, parseYmd, num, str, norm, normalizePlate, normalizeVin, regionOf, brandOf, todayStr } from './utils.js';

export const FIELD_DEFS = [
  { key: 'distanceKm', label: '거리km', aliases: ['운송거리', '거리', 'km'] },
  { key: 'transportType', label: '운송방식', aliases: ['장비유형', '필요장비'] },
  { key: 'cargoClass', label: '상품분류', aliases: ['차량분류'] },
  { key: 'minSkill', label: '최소숙련도', aliases: ['필요숙련도'] },
  { key: 'customer', label: '거래처', aliases: ['거래처', '고객사', '화주', '거래처명', '브랜드사', '법인'] },
  { key: 'date', label: '배차일자', aliases: ['출발시간', '출발일', '배차일', '배차일자', '도착일자', '날짜', '일자', '출고일자', '운송일'] },
  { key: 'origin', label: '출발지', aliases: ['출발지', '상차지', '출고지', '출발'] },
  { key: 'destination', label: '도착지', aliases: ['도착지', '하차지', '배송지', '도착처', '도착'] },
  { key: 'vin', label: '차대번호', aliases: ['차대번호', 'vin', '차대', 'vin번호', '차대no'] },
  { key: 'color', label: '색상', aliases: ['색상', '컬러', '색'] },
  { key: 'position', label: '권역/위치', aliases: ['위치', '권역', '지역', '행선지', '구분'] },
  { key: 'model', label: '차종', aliases: ['차종', '차명', '모델', '모델명'] },
  { key: 'driver', label: '운전자', aliases: ['운전자', '기사', '기사명', '운전자명', '배차기사', '담당기사'] },
  { key: 'count', label: '댓수', aliases: ['댓수', '대수', '수량', '운송대수', '대'] },
  { key: 'turn', label: '회전', aliases: ['회전', '회전수'] },
  { key: 'code', label: '코드', aliases: ['코드', '구분코드', '코드번호'] },
  { key: 'note', label: '비고', aliases: ['비고', '메모', '특이사항', '참고', '비고란'] },
  { key: 'billed', label: '청구', aliases: ['청구', '청구금액', '청구액'] },
  { key: 'unpaid', label: '하불', aliases: ['하불', '미불', '미수', '미수금'] },
  { key: 'unloadName', label: '하차담당자', aliases: ['하차담당자', '인수자', '하차담당'] },
  { key: 'unloadPhone', label: '하차 연락처', aliases: ['연락처', '전화', '휴대폰'] },
  { key: 'customerName', label: '고객', aliases: ['고객', '고객명', '수하인'] },
  { key: 'customerPhone', label: '고객 연락처', aliases: ['연락처.1', '연락처2', '고객연락처'] },
  { key: 'vehicleNo', label: '차량번호', aliases: ['차량번호', '차번', '번호판'] },
  { key: 'driverPhone', label: '기사연락처', aliases: ['기사연락처', '기사번호', '기사전화', '핸드폰'] },
];

const normHeader = (v) => norm(v).replace(/[()（）\[\]{}:：]/g, '').replace(/_/g, '');
const headerKey = (v) => normHeader(v).replace(/\.\d+$/, '');

const DATE_RE = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/;
const MD_RE = /^(\d{1,2})[-./](\d{1,2})$/;

export function excelSerialToYmd(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return '';
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return ymd(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function inferYearFromName(name) {
  const s = str(name);
  const m = s.match(/(20\d{2})/);
  if (m) return Number(m[1]);
  const m2 = s.match(/(^|[^\d])(2[0-9])(0[1-9]|1[0-2])([^\d]|$)/);
  if (m2) return 2000 + Number(m2[2]);
  return null;
}

export function dateFromTab(tabName, fileYear = null) {
  const s = str(tabName).replace(/\s/g, '');
  if (!s) return '';
  let m = s.match(/^(20\d{2})[.\-/]?(\d{1,2})[.\-/]?(\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/(\d{1,2})월(\d{1,2})일/);
  if (m) {
    const year = fileYear || autoYear(Number(m[1]));
    return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  }
  m = s.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) {
    const year = fileYear || autoYear(Number(m[1]));
    return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  }
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
  if (m) {
    const year = fileYear || autoYear(Number(m[1]));
    return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  }
  return '';
}

function autoYear(month) {
  const now = new Date();
  const y = now.getFullYear();
  return month > now.getMonth() + 2 ? y - 1 : y;
}

export function parseDateValue(v, { tabDate = '', fileYear = null, fallback = '' } = {}) {
  if (v === null || v === undefined || v === '') return tabDate || fallback;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return ymd(v);
  if (typeof v === 'number') return excelSerialToYmd(v) || tabDate || fallback;
  const s = str(v);
  if (!s) return tabDate || fallback;
  let m = s.match(DATE_RE);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(MD_RE);
  if (m) {
    const year = fileYear || autoYear(Number(m[1]));
    return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  }
  m = s.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m) {
    const year = fileYear || autoYear(Number(m[1]));
    return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  }
  // "2026 / Model Y" 같은 값은 날짜가 아님
  return tabDate || fallback;
}

const STATUS_WORDS = ['취소', '미출고', '사고', '지원', '회송', '변경', '용차'];
const STATUS_PRIORITY = [
  ['취소', 'cancelled'],
  ['미출고', 'notshipped'],
  ['사고', 'accident'],
  ['지원', 'support'],
  ['회송', 'return'],
  ['변경', 'changed'],
  ['용차', 'extra'],
];

export function detectStatus(row) {
  const strong = `${str(row.driver)} ${str(row.note)} ${str(row.code)}`;
  const weak = `${str(row.position)} ${str(row.color)}`;
  for (const [word, status] of STATUS_PRIORITY) {
    if (strong.includes(word)) return { status, word, reason: 'strong' };
  }
  for (const [word, status] of STATUS_PRIORITY) {
    if (weak.includes(word)) return { status, word, reason: 'weak' };
  }
  if (row.driver && STATUS_WORDS.includes(str(row.driver))) return { status: 'support', word: row.driver, reason: 'driver' };
  return { status: 'normal', word: '', reason: '' };
}

export function parseAmount(text) {
  const s = str(text).replace(/,/g, '');
  let total = 0;
  const man = s.match(/(\d+(?:\.\d+)?)\s*만\s*원/);
  if (man) total += Number(man[1]) * 10000;
  if (!man) {
    const won = s.match(/(\d{3,})\s*원/);
    if (won) total += Number(won[1]);
  }
  return Math.round(total);
}

function mappingFor(headers) {
  const used = new Set();
  const mapping = {};
  const lower = headers.map((h) => headerKey(h));
  for (const def of FIELD_DEFS) {
    for (const alias of def.aliases) {
      const a = normHeader(alias);
      const idx = lower.findIndex((h, i) => !used.has(i) && h && (h === a || h.startsWith(a)));
      if (idx >= 0) {
        mapping[def.key] = idx;
        used.add(idx);
        break;
      }
    }
  }
  // 중복 '연락처' 헤더: 두 번째는 고객 연락처로
  if (mapping.unloadPhone !== undefined && mapping.customerPhone === undefined) {
    const second = lower.findIndex((h, i) => i !== mapping.unloadPhone && !used.has(i) && (h === '연락처' || h.startsWith('연락처')));
    if (second >= 0) mapping.customerPhone = second;
  }
  return mapping;
}

function headerScore(row) {
  if (!row) return 0;
  const keys = new Set(row.map(headerKey));
  let score = 0;
  for (const def of FIELD_DEFS) {
    if (def.aliases.some((a) => keys.has(normHeader(a)))) score++;
  }
  return score;
}

function findHeaderRow(rows) {
  let best = { idx: -1, score: 0 };
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    const score = headerScore(rows[i]);
    if (score > best.score) best = { idx: i, score };
  }
  if (best.score < 3) return -1;
  const header = rows[best.idx] || [];
  const hasDest = header.some((h) => ['도착지', '하차지', '도착처'].includes(headerKey(h)));
  const hasVin = header.some((h) => ['차대번호', 'vin', '차대'].includes(headerKey(h)));
  if (!hasDest && !hasVin) return -1;
  return best.idx;
}

const IGNORE_SHEETS = /^(피벗|graph|daily|도착지구분|회전구분|예약판|오기입|복사본|수입차|SC주차|테슬라\s*D-3|외부셀프|루티|센터장|운전자정보|공휴일|신규도착지|벤츠출고|mbk 출고|raw|통합)/i;

export function parseWorkbook(buffer, fileName, { monthFilter = null, mappingOverrides = {}, includeAux = false, strictHistory = false } = {}) {
  if (!window.XLSX) throw new Error('엑셀 라이브러리를 불러오지 못했습니다.');
  const wb = window.XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
  const fileYear = inferYearFromName(fileName);
  const sheets = [];
  const warnings = [];
  const dates = new Set();
  let totalRows = 0;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const matrix = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
    if (matrix.length < 2) continue;
    const headerIdx = findHeaderRow(matrix);
    if (headerIdx < 0) {
      if (!IGNORE_SHEETS.test(name)) warnings.push(`'${name}' 시트는 배차판 헤더를 찾지 못해 건너뛰었습니다.`);
      continue;
    }
    const headers = matrix[headerIdx].map((h) => str(h));
    const detected = mappingFor(headers);
    const mapping = { ...detected, ...(mappingOverrides[name] || {}) };
    const tabDate = dateFromTab(name, fileYear);
    if (!mapping.destination && !mapping.vin) continue;

    const rows = [];
    let skipped = 0;
    const seen = new Set();
    const fallbackDateIdx = headers.findIndex((h, hi) => hi !== mapping.date && ['배송도착일자', '도착일자', '배송일자', '도착일'].includes(headerKey(h)));
    const sourceSheetIdx = headers.findIndex((h, hi) => hi !== mapping.date && ['원본시트', '원본시트명', '출발시트'].includes(headerKey(h)));
    for (let i = headerIdx + 1; i < matrix.length; i++) {
      const src = matrix[i];
      if (!src || !src.length) continue;
      const get = (key) => {
        const idx = mapping[key];
        return idx === undefined ? '' : src[idx];
      };
      const raw = {
        customer: str(get('customer')),
        origin: str(get('origin')),
        destination: str(get('destination')),
        vin: normalizeVin(get('vin')),
        color: str(get('color')),
        position: str(get('position')),
        model: str(get('model')),
        driver: str(get('driver')),
        code: str(get('code')),
        note: str(get('note')),
        unloadName: str(get('unloadName')),
        unloadPhone: str(get('unloadPhone')),
        customerName: str(get('customerName')),
        customerPhone: str(get('customerPhone')),
        vehicleNo: normalizePlate(get('vehicleNo')),
        driverPhone: str(get('driverPhone')),
      };
      const keyCount = [raw.customer, raw.destination, raw.vin, raw.model, raw.driver].filter(Boolean).length;
      const meaningful = raw.vin || (raw.customer && raw.destination);
      if (keyCount < 2 || !meaningful) { skipped++; continue; }
      if (/^(합계|소계|총계|계)$/.test(raw.customer) || /^(합계|소계|총계)$/.test(raw.destination)) { skipped++; continue; }

      const rawDate=get('date');
      let date = strictHistory ? ((typeof rawDate==='number' || /^20\d{2}[-./]\d{1,2}[-./]\d{1,2}/.test(str(rawDate))) ? parseDateValue(rawDate) : '') : parseDateValue(rawDate, { tabDate, fileYear });
      if (!strictHistory && !date && fallbackDateIdx >= 0) date = parseDateValue(src[fallbackDateIdx], { tabDate, fileYear });
      if (!strictHistory && !date && sourceSheetIdx >= 0) date = dateFromTab(str(src[sourceSheetIdx]), fileYear) || '';
      if (!strictHistory && date && tabDate) {
        const dd = Math.abs((new Date(date) - new Date(tabDate)) / 86400000);
        if (dd > 366) date = tabDate;
      }
      if (monthFilter && date && !date.startsWith(monthFilter)) { skipped++; continue; }
      const count = strictHistory ? Number(str(get('count')).replace(/,/g,'')) : num(get('count')) || 1;
      const turnRaw=str(get('turn')),turnValue=Number(turnRaw.replace(/,/g,''));
      const turn=turnRaw&&Number.isInteger(turnValue)&&turnValue>0?turnValue:'';
      const turnBasis=turnRaw?(turn?'explicit':'invalid'):'missing';
      const { status, word } = detectStatus(raw);
      const note = raw.note || (word && word !== status ? word : '');
      let driver = raw.driver;
      if (['지원', '취소', '미출고', '회송', '변경', '사고'].includes(driver)) driver = '';
      const vehicleNo = driver ? raw.vehicleNo : raw.vehicleNo;
      const supportAmount = status === 'support' ? parseAmount(note) : 0;
      const key = [date, raw.vin, str(get('date')), raw.destination, driver].join('|');
      const dup = seen.has(key);
      seen.add(key);
      const row = {
        date,
        departTime: str(get('date')) && !DATE_RE.test(str(get('date'))) ? str(get('date')) : '',
        customer: raw.customer,
        origin: raw.origin,
        destination: raw.destination,
        vin: raw.vin,
        color: raw.color,
        position: raw.position,
        model: raw.model,
        driver,
        count,
        turn,turnRaw,turnBasis,
        code: raw.code,
        note,
        billed: num(get('billed')),
        unpaid: num(get('unpaid')),
        unloadName: raw.unloadName,
        unloadPhone: raw.unloadPhone,
        customerName: raw.customerName,
        customerPhone: raw.customerPhone,
        vehicleNo,
        driverPhone: raw.driverPhone,
        distanceKm: str(get('distanceKm')) ? num(get('distanceKm')) : '',
        transportType: str(get('transportType')), cargoClass: str(get('cargoClass')), minSkill: str(get('minSkill')) ? num(get('minSkill')) : '',
        status,
        statusWord: word,
        supportAmount,
        brand: brandOf(raw),
        region: regionOf(raw.destination),
        sourceFile: fileName,
        sheet: name,
        tab: name,
        rowNumber: i + 1,
        duplicateInFile: dup,
        computedKey: key,
      };
      rows.push(row);
    }
    if (!rows.length) continue;
    totalRows += rows.length;
    rows.forEach((r) => { if (r.date) dates.add(r.date); });
    sheets.push({
      name,
      headerRow: headerIdx + 1,
      headers,
      mapping,
      detectedMapping: detected,
      tabDate,
      rows,
      rowCount: rows.length,
      skipped,
      hasDate: !!mapping.date,
    });
  }

  const dateSheets = sheets.filter((sh) => sh.tabDate);
  const usedSheets = (!includeAux && dateSheets.length) ? dateSheets : sheets;
  const auxCount = sheets.length - usedSheets.length;
  if (auxCount > 0) warnings.unshift(`날짜 탭 ${usedSheets.length}개만 가져옵니다. 보조 시트 ${auxCount}개는 제외했습니다.`);

  // 시트 간 완전 중복(통합본에 원본 시트를 복제한 경우) 제거
  const seenSig = new Map();
  let crossDup = 0;
  for (const sh of usedSheets) {
    const before = sh.rows.length;
    sh.rows = sh.rows.filter((r) => {
      const sig = [r.date, r.customer, r.origin, r.destination, r.vin, r.model, r.driver, r.count, r.turn, r.note].join('|');
      const first = seenSig.get(sig);
      if (first && first !== sh.name) { crossDup++; return false; }
      if (!first) seenSig.set(sig, sh.name);
      return true;
    });
    sh.rowCount = sh.rows.length;
    if (before !== sh.rowCount) sh.skipped += before - sh.rowCount;
  }
  if (crossDup) warnings.unshift(`시트 간 중복 ${crossDup}건을 제외했습니다.`);

  const usedRows = usedSheets.flatMap((sh) => sh.rows);
  const usedDates = [...new Set(usedRows.map((r) => r.date).filter(Boolean))].sort();
  const missingDate = usedRows.filter((r) => !r.date).length;
  const missingDriver = usedRows.filter((r) => !r.driver).length;
  if (missingDate) warnings.push(`${missingDate}건은 배차일자를 확인할 수 없어 제외 대상입니다.`);
  if (missingDriver) warnings.push(`${missingDriver}건은 운전자가 비어 있습니다(미배차/가배차 대상).`);

  return {
    fileName,
    fileYear,
    sheets: usedSheets,
    skippedSheets: auxCount,
    totals: {
      sheets: usedSheets.length,
      rows: usedRows.length,
      dates: usedDates,
      dateFrom: usedDates[0] || '',
      dateTo: usedDates.slice(-1)[0] || '',
      missingDate,
      missingDriver,
      duplicates: usedSheets.reduce((s, sh) => s + sh.rows.filter((r) => r.duplicateInFile).length, 0),
    },
    warnings,
    workbook: wb,
  };
}

/* 내보내기용 표준 열 (기존 배차판에 붙여넣기 가능) */
export const EXPORT_HEADERS = ['거래처', '출발시간', '출발지', '도착지', '차대번호', '색상', '위치', '차종', '운전자', '댓수', '회전', '코드', '비고', '청구', '하불', '하차담당자', '연락처', '고객', '연락처', '차량번호', '기사연락처'];

export function toExportRow(r) {
  return [
    r.customer || '', r.date || '', r.origin || '', r.destination || '', r.vin || '', r.color || '',
    r.position || '', r.model || '', r.driver || '', num(r.count) || 1, Number.isInteger(Number(r.turn))&&Number(r.turn)>0?Number(r.turn):'', r.code || '',
    r.note || '', num(r.billed) || '', num(r.unpaid) || '', r.unloadName || '', r.unloadPhone || '',
    r.customerName || '', r.customerPhone || '', r.vehicleNo || '', r.driverPhone || '',
  ];
}

export function buildTemplateRows() {
  return [
    EXPORT_HEADERS,
    ["거래처 예시", todayStr(), "출발지 예시", "도착지 예시", "", "", "", "차종 예시", "", 1, 1, "", "", "", "", "", "", "", "", "", ""],
  ];
}
