import { todayStr, addDays } from './utils.js';

/* Entirely synthetic examples: no real names, contact numbers, plates or source workbooks. */
export function buildDemo() {
  const today = todayStr(), now = new Date().toISOString();
  const regions = ['서울', '경기', '인천', '충청', '경상', '전라'];
  const drivers = Array.from({ length: 12 }, (_, i) => ({
    id: `drv_seed_${i + 1}`, name: `샘플기사 ${String(i + 1).padStart(2, '0')}`,
    phone: '', vehicleNo: `샘플차량${String(i + 1).padStart(2, '0')}`, type: i % 3 ? '개별' : '협력',
    status: 'active', preferred: [regions[i % regions.length]], avoid: [], aliases: [],
    joinedAt: addDays(today, -365 - i * 20), memo: '기능 확인용 가상 자료', createdAt: now, updatedAt: now,
  }));
  const equipment = drivers.map((d, i) => ({ id: `eqp_seed_${i + 1}`, plateNo: d.vehicleNo, driverId: d.id, driverName: d.name,
    type: '카캐리어', model: '샘플 운송차량', capacity: 6, insuranceExpiry: addDays(today, 90 + i), inspectionExpiry: addDays(today, 120 + i), status: i === 11 ? 'maintenance' : 'active', memo: '가상 차량', createdAt: now, updatedAt: now }));
  const products = ['세단', 'SUV', '전기차', '승합차'].map((model, i) => ({ id: `prd_seed_${i + 1}`, brand: '샘플 브랜드', model: `샘플 ${model}`, trim: '기본형', price: 30000000 + i * 5000000, dealer: '샘플 판매처', region: regions[i], updatedAt: today, sourceUrl: '', note: '실제 시세가 아닌 예시', createdAt: now }));
  const dispatch = [];
  for (let day = 119; day >= 0; day--) {
    const date = addDays(today, -day);
    for (let n = 0; n < 36 + day % 13; n++) {
      const d = drivers[(n + day) % drivers.length];
      const status = n === 0 ? 'cancelled' : n === 1 && day % 3 === 0 ? 'notshipped' : n === 2 && day % 4 === 0 ? 'support' : 'normal';
      const unassigned = day === 0 && n % 4 === 0;
      const region = regions[(n + day) % regions.length];
      dispatch.push({ id: `demo_${date}_${n}`, date, departTime: `${String(8 + n % 10).padStart(2, '0')}:00`,
        customer: `샘플 거래처 ${String.fromCharCode(65 + n % 4)}`, origin: '샘플 출고센터', destination: `${region} 샘플 인도센터 ${n % 5 + 1}`,
        vin: `DEMO${date.replaceAll('-', '')}${String(n).padStart(5, '0')}`, color: ['화이트', '블랙', '그레이'][n % 3], position: region,
        model: products[n % products.length].model, brand: '샘플 브랜드', region,
        driver: status === 'support' ? '지원' : status === 'cancelled' ? '취소' : unassigned ? '' : d.name,
        vehicleNo: unassigned ? '' : d.vehicleNo, driverPhone: '', count: n % 9 === 0 ? 2 : 1, turn: 1 + n % 2,
        code: '', note: '기능 확인용 샘플', billed: status === 'normal' ? 180000 + n % 5 * 10000 : 0, unpaid: 0,
        unloadName: '', unloadPhone: '', customerName: '', customerPhone: '', status, supportAmount: status === 'support' ? 100000 : 0,
        sourceFile: '샘플 데이터', tab: 'demo', rowNumber: n + 2, dedupeKey: `${date}|demo|${n}`, createdAt: now });
    }
  }
  const incidents = ['클레임', '지연', '사고'].map((type, i) => ({ id: `inc_seed_${i + 1}`, date: addDays(today, -i - 1),
    type, severity: ['하', '중', '하'][i], driverId: drivers[i].id, driverName: drivers[i].name, vehicleNo: drivers[i].vehicleNo,
    description: ['인도 일정 확인 요청 · 샘플', '출고 대기 지연 · 샘플', '차량 상태 확인 · 샘플'][i], cost: i * 50000,
    status: i === 2 ? 'closed' : 'open', photos: [], request: '가상 사례', vin: '', customer: '샘플 거래처 A', destination: '', createdBy: '샘플', createdAt: now, updatedAt: now }));
  return { drivers, equipment, products, dispatch, incidents };
}
