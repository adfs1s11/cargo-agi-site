import { norm } from './utils.js';
import { money, validateRate, RATE_FIELDS } from './settlement.js';

export const IMPORT_FIELDS = [
  ['side', '매출/매입', ['구분', '매출매입']], ['kind', '기본/추가', ['요금구분']], ['name', '단가명', ['요금명']],
  ['customer', '거래처', ['고객사']], ['driver', '기사', ['운전자', '기사명']], ['brand', '브랜드', []], ['model', '차종', ['모델']], ['cargoClass', '상품분류', ['차량분류']],
  ['origin', '출발지', ['상차지']], ['destination', '도착지', ['하차지']], ['transportType', '운송방식', ['장비유형']],
  ['basis', '단가기준', ['과금기준']], ['price', '단가', []], ['salePrice', '매출단가', ['청구단가']], ['purchasePrice', '매입단가', ['지급단가', '기사단가']],
  ['vatPercent', '부가세율', []], ['minKm', '최소거리', []], ['maxKm', '최대거리', []], ['priority', '우선순위', []], ['from', '적용시작', []], ['to', '적용종료', []],
  ['date', '운송일', ['배차일', '일자', '마감일']], ['vin', '차대번호', ['VIN']], ['saleAmount', '매출금액', ['청구', '청구금액', '매출공급가']], ['purchaseAmount', '매입금액', ['하불', '하불금액', '지급금액', '매입공급가']],
  ['saleVat', '매출부가세', []], ['purchaseVat', '매입부가세', []], ['distanceKm', '거리km', ['거리', '운송거리']],
];
export const RATE_IMPORT_KEYS = IMPORT_FIELDS.slice(0, 21).map(([key]) => key);
export const RESULT_IMPORT_KEYS = ['date', 'vin', 'customer', 'driver', 'origin', 'destination', 'saleAmount', 'purchaseAmount', 'saleVat', 'purchaseVat', 'distanceKm', 'transportType', 'cargoClass'];
export function guessMapping(headers) {
  return Object.fromEntries(IMPORT_FIELDS.map(([key, label, aliases]) => [key, headers.filter((h) => [label, ...aliases].some((name) => norm(h) === norm(name))).length === 1 ? headers.findIndex((h) => [label, ...aliases].some((name) => norm(h) === norm(name))) : -1]));
}
export function importDate(value) {
  if (typeof value === 'number' && value > 20000 && value < 90000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  const m = String(value ?? '').trim().match(/^(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (!m) throw Error('운송일은 연도·월·일을 포함해야 합니다.');
  const result = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if (new Date(result).toISOString().slice(0, 10) !== result) throw Error('날짜를 확인하세요.');
  return result;
}
const text = (v) => String(v ?? '').trim();
export function parseSettlementImport(rows, mapping, kind, { month, dispatch = [], defaultSide = 'sale', headerRow = 0 } = {}) {
  const valid = [], invalid = [], seenOrders = new Set();
  rows.slice(headerRow + 1).forEach((cells, index) => {
    if (!cells.some((v) => text(v))) return;
    const get = (key) => mapping[key] >= 0 ? cells[mapping[key]] : '';
    try {
      if (kind === 'rates') {
        const basis = ({ '대당': 'vehicle', '건당': 'trip', 'km당': 'km', '거리별': 'km', vehicle: 'vehicle', trip: 'trip', km: 'km' })[text(get('basis')) || '대당'];
        if (text(get('kind')) && !['기본', '기본요금', 'base', '추가', '추가요금', 'extra'].includes(text(get('kind')))) throw Error('불명확한 요금 구분은 제외합니다.');
        const common = Object.fromEntries(RATE_FIELDS.map((key) => [key, text(get(key))]));
        Object.assign(common, { name: text(get('name')) || '엑셀 단가', basis, kind: ['추가', '추가요금', 'extra'].includes(text(get('kind'))) ? 'extra' : 'base', minKm: text(get('minKm')), maxKm: text(get('maxKm')), vatPercent: text(get('vatPercent')) || 0, priority: text(get('priority')) || 0, from: text(get('from')) ? importDate(get('from')) : '', to: text(get('to')) ? importDate(get('to')) : '', active: true });
        if (!RATE_FIELDS.some((key) => common[key])) throw Error('적용 대상이 없는 단가는 제외합니다. 거래처·구간 등 확실한 조건이 필요합니다.');
        const pair = [['sale', get('salePrice')], ['purchase', get('purchasePrice')]].filter(([, value]) => text(value) !== '');
        if (!pair.length) pair.push([['매입', 'purchase'].includes(text(get('side'))) ? 'purchase' : ['매출', 'sale'].includes(text(get('side'))) ? 'sale' : defaultSide, get('price')]);
        const parsed = pair.map(([side, price]) => {
          const rate = validateRate({ ...common, side, price });
          const { price: ignoredPrice, vatPercent: ignoredVat, ...identity } = rate;
          return { ...rate, id: 'rate_import_' + encodeURIComponent(JSON.stringify(identity)), rowNumber: headerRow + index + 2 };
        });
        valid.push(...parsed);
      } else {
        const date = importDate(get('date')), vin = norm(get('vin'));
        if (!date.startsWith(month)) throw Error('선택한 정산 월과 다른 날짜입니다.');
        if (!vin) throw Error('차대번호가 필요합니다.');
        const found = dispatch.filter((r) => r.date === date && norm(r.vin) === vin && !['cancelled', 'notshipped', 'support'].includes(r.status) && ['customer', 'driver', 'origin', 'destination'].every((key) => !text(get(key)) || norm(r[key]) === norm(get(key))));
        if (found.length !== 1) throw Error(found.length ? '같은 차대번호 운송건이 여러 개입니다. 출발지·도착지 등을 매핑하세요.' : '일치하는 배차 원장이 없습니다.');
        if (seenOrders.has(found[0].id)) throw Error('파일에서 같은 운송건이 중복됩니다.');
        const saleAmount = money(get('saleAmount')), purchaseAmount = money(get('purchaseAmount'));
        const saleVat = text(get('saleVat')) ? money(get('saleVat')) : 0, purchaseVat = text(get('purchaseVat')) ? money(get('purchaseVat')) : 0;
        if ([saleAmount, purchaseAmount, saleVat, purchaseVat].some((v) => v < 0 || !Number.isInteger(v))) throw Error('공급가와 부가세는 0 이상의 정수 원 단위로 입력하세요.');
        seenOrders.add(found[0].id);
        const entry = { id: `stl_${found[0].id}`, orderId: found[0].id, date, source: 'import', taxBasis: 'exclusive', saleAmount, purchaseAmount, saleVat, purchaseVat, rowNumber: headerRow + index + 2 };
        for (const key of ['distanceKm', 'transportType', 'cargoClass']) if (text(get(key))) entry[key] = key === 'distanceKm' ? money(get(key)) : text(get(key));
        if (entry.distanceKm < 0) throw Error('거리는 0 이상이어야 합니다.');
        valid.push(entry);
      }
    } catch (error) { invalid.push({ row: headerRow + index + 2, reason: error.message }); }
  });
  return { valid, invalid };
}
