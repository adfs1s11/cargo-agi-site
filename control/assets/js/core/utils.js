/* global XLSX */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = (prefix = '') => {
  const s = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  return prefix ? `${prefix}_${s}` : s;
};

export const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));
export const round = (n, d = 1) => {
  const p = 10 ** d;
  return Math.round((Number(n) || 0) * p) / p;
};
export const nf = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('ko-KR') : '0');
export const pct = (n, d = 0) => `${round(n, d)}%`;

export const won = (n) => {
  const v = Number(n) || 0;
  if (!v) return '0원';
  if (Math.abs(v) >= 100000000) return `${round(v / 100000000, 1)}억원`;
  if (Math.abs(v) >= 10000) return `${nf(round(v / 10000, v % 10000 ? 1 : 0))}만원`;
  return `${nf(v)}원`;
};

/* ---------------- Date helpers (local, no timezone drift) ---------------- */
export const pad2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
};
export const todayStr = () => ymd(new Date());
export const parseYmd = (s) => {
  if (!s) return null;
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const m = String(s).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
};
export const addDays = (s, n) => {
  const d = parseYmd(s) || new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const diffDays = (a, b) => {
  const x = parseYmd(a), y = parseYmd(b);
  if (!x || !y) return 0;
  return Math.round((y - x) / 86400000);
};
export const monthStr = (s) => (s ? String(s).slice(0, 7) : '');
export const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
export const dateLabel = (s, withYear = false) => {
  const d = parseYmd(s);
  if (!d) return '-';
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})`;
  return withYear ? `${d.getFullYear()}년 ${base}` : base;
};
export const shortDate = (s) => {
  const d = parseYmd(s);
  if (!d) return '-';
  return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
};
export const timeAgo = (iso) => {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '-';
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return ymd(new Date(t));
};
export const dday = (s) => {
  if (!s) return null;
  const n = diffDays(todayStr(), s);
  return n;
};
export const ddayLabel = (n) => (n === null ? '-' : n < 0 ? `D+${Math.abs(n)}` : n === 0 ? 'D-DAY' : `D-${n}`);

/* ---------------- Number / text ---------------- */
export const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/,/g, '').replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};
export const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
export const norm = (v) => str(v).replace(/\s+/g, '').toLowerCase();
export const normalizePlate = (v) =>
  str(v).replace(/\s+/g, '').replace(/[·.]/g, '').toUpperCase();
export const normalizeVin = (v) => str(v).toUpperCase().replace(/[^A-Z0-9]/g, '');

export const groupBy = (arr, fn) => {
  const map = new Map();
  for (const item of arr) {
    const k = fn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
};
export const sumBy = (arr, fn) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0);
export const unique = (arr) => Array.from(new Set(arr));
export const sortBy = (arr, fn, dir = 'asc') => {
  const d = dir === 'desc' ? -1 : 1;
  return [...arr].sort((a, b) => {
    const va = fn(a), vb = fn(b);
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return (typeof va === 'string' ? va.localeCompare(vb, 'ko') : va - vb) * d;
  });
};
export const debounce = (fn, ms = 220) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

/* ---------------- Region / brand inference ---------------- */
const SIDO = [
  ['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'], ['광주', '광주'],
  ['대전', '대전'], ['울산', '울산'], ['세종', '세종'], ['경기', '경기'], ['경기도', '경기'],
  ['강원', '강원'], ['강원도', '강원'], ['충북', '충청'], ['충청북도', '충청'], ['충남', '충청'],
  ['충청남도', '충청'], ['전북', '전라'], ['전라북도', '전라'], ['전남', '전라'], ['전라남도', '전라'],
  ['경북', '경상'], ['경상북도', '경상'], ['경남', '경상'], ['경상남도', '경상'], ['제주', '제주'],
];
const CITY_REGION = {
  수원: '경기', 성남: '경기', 용인: '경기', 고양: '경기', 부천: '경기', 안산: '경기', 안양: '경기',
  남양주: '경기', 화성: '경기', 평택: '경기', 의정부: '경기', 시흥: '경기', 파주: '경기', 김포: '경기',
  광명: '경기', 광주시: '경기', 군포: '경기', 하남: '경기', 오산: '경기', 이천: '경기', 안성: '경기',
  구리: '경기', 포천: '경기', 양주: '경기', 동두천: '경기', 과천: '경기', 여주: '경기', 양평: '경기',
  가평: '경기', 연천: '경기', 청담: '서울', 강남: '서울', 서초: '서울', 송파: '서울', 마포: '서울',
  용산: '서울', 영등포: '서울', 여의도: '서울', 구로: '서울', 강서: '서울', 강북: '서울', 노원: '서울',
  성동: '서울', 광진: '서울', 동대문: '서울', 중랑: '서울', 은평: '서울', 서대문: '서울', 종로: '서울',
  중구: '서울', 강동: '서울', 관악: '서울', 동작: '서울', 금천: '서울', 양천: '서울', 도봉: '서울',
  대구: '대구', 부산: '부산', 울산: '울산', 창원: '경상', 마산: '경상', 진주: '경상', 김해: '경상',
  구미: '경상', 안동: '경상', 포항: '경상', 경주: '경상', 거제: '경상', 양산: '경상', 밀양: '경상',
  통영: '경상', 사천: '경상', 김천: '경상', 영주: '경상', 상주: '경상', 문경: '경상', 칠곡: '경상',
  성서: '대구', 달서: '대구', 수성: '대구', 달성: '대구', 북구: '대구',
  청주: '충청', 충주: '충청', 제천: '충청', 천안: '충청', 아산: '충청', 서산: '충청', 당진: '충청',
  논산: '충청', 공주: '충청', 보령: '충청', 홍성: '충청', 예산: '충청', 태안: '충청', 음성: '충청',
  진천: '충청', 증평: '충청', 옥천: '충청', 영동: '충청', 세종: '충청', 대전: '대전',
  전주: '전라', 익산: '전라', 군산: '전라', 정읍: '전라', 남원: '전라', 김제: '전라', 완주: '전라',
  순천: '전라', 여수: '전라', 목포: '전라', 나주: '전라', 광양: '전라', 담양: '전라', 무안: '전라',
  해남: '전라', 강진: '전라', 장흥: '전라', 보성: '전라', 고흥: '전라', 광주: '광주',
  춘천: '강원', 원주: '강원', 강릉: '강원', 동해: '강원', 속초: '강원', 삼척: '강원', 태백: '강원',
  홍천: '강원', 횡성: '강원', 평창: '강원', 정선: '강원', 철원: '강원', 화천: '강원', 양구: '강원',
  인제: '강원', 고성: '강원', 양양: '강원', 제주: '제주', 서귀포: '제주',
};
export const regionOf = (destination) => {
  const s = str(destination);
  if (!s) return '기타';
  for (const [k, v] of SIDO) if (s.startsWith(k) || s.includes(`${k} `)) return v;
  for (const [k, v] of Object.entries(CITY_REGION)) if (s.includes(k)) return v;
  if (/광명|선광|김포|평택|안성|이천|여주|양평|하남|남양주|구리/.test(s)) return '경기';
  if (/딜리버리|DC|물류센터/.test(s)) return '경기';
  return '기타';
};
export const isCapital = (region) => ['서울', '경기', '인천'].includes(region);

export const BRANDS = ['테슬라', '벤츠', 'BMW', '볼보', 'BYD', '아우디', '포르쉐', '쉐보레', 'KG모빌리티', '혼다', '폴스타', '지커'];
export const brandOf = (row) => {
  const s = `${str(row?.customer)} ${str(row?.model)} ${str(row?.origin)}`.toLowerCase();
  if (/테슬라|model\s?[ys3x]|삼성sds/.test(s)) return '테슬라';
  if (/벤츠|mercedes|메르세데스|mbk|maybach|amg/.test(s)) return '벤츠';
  if (/bmw|비엠더블유|미니/.test(s)) return 'BMW';
  if (/볼보|volvo|폴스타|polestar/.test(s)) return /폴스타|polestar/.test(s) ? '폴스타' : '볼보';
  if (/byd|비와이디/.test(s)) return 'BYD';
  if (/아우디|audi/.test(s)) return '아우디';
  if (/포르쉐|porsche/.test(s)) return '포르쉐';
  if (/쉐보레|chevrolet|gms|트레일블레이저|explorer|포드/.test(s)) return '쉐보레';
  if (/kg모빌리티|쌍용|렉스턴|토레스/.test(s)) return 'KG모빌리티';
  if (/혼다|honda/.test(s)) return '혼다';
  if (/지커|zeekr/.test(s)) return '지커';
  return '기타';
};

/* ---------------- HTML / DOM ---------------- */
export const html = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (vals[i] ?? ''), '');
export const attr = (v) => esc(v).replace(/`/g, '&#96;');
export const optionList = (items, selected, placeholder = '') => {
  const opts = [];
  if (placeholder) opts.push(`<option value="">${esc(placeholder)}</option>`);
  for (const it of items) {
    const value = typeof it === 'string' ? it : it.value;
    const label = typeof it === 'string' ? it : it.label;
    opts.push(`<option value="${attr(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`);
  }
  return opts.join('');
};
export const emptyState = (iconName, title, desc, action = '') => `
  <div class="empty">
    <div class="icon">${icon(iconName)}</div>
    <h4>${esc(title)}</h4>
    <p>${desc}</p>
    ${action || ''}
  </div>`;

export const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  board: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 13h3M8 17h6"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3h-4a3 3 0 0 1-3-3V6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/>',
  truck: '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
  car: '<path d="M5 17h14M4 17l2-6 2-3h8l2 3 2 6M6 17v2M18 17v2"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
  mobile: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.91Z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  edit: '<path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/>',
  sync: '<path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  cloud: '<path d="M17.5 19H6a4 4 0 0 1-.5-8A6 6 0 0 1 17 9.5a4.8 4.8 0 0 1 .5 9.5Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  flag: '<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  rows: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="11" width="18" height="4" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  weight: '<path d="M12 3v3M8 6h8l3 15H5L8 6Z"/><path d="M10 12h4"/>',
};
export const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;

/* ---------------- Toast ---------------- */
export function toast(message, type = '', ms = 3200) {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'success' ? 'check' : type === 'error' ? 'warning' : type === 'warn' ? 'warning' : 'info')}<span>${esc(message)}</span><button class="x" aria-label="닫기">×</button>`;
  root.appendChild(el);
  const close = () => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 180);
  };
  el.querySelector('.x').onclick = close;
  setTimeout(close, ms);
}

/* ---------------- Modal ---------------- */
export function openModal({ title = '', sub = '', body = '', foot = '', size = '', onMount, onClose } = {}) {
  const root = $('#modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div class="t"><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
        <button class="icon-btn" data-close aria-label="닫기">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </div>`;
  root.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  if (onMount) onMount(overlay, close);
  return { el: overlay, close };
}

/* ---------------- Drawer ---------------- */
export function openDrawer({ title = '', sub = '', body = '', foot = '', wide = false, onMount, onClose } = {}) {
  const root = $('#modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `
    <aside class="drawer ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div class="t"><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
        <button class="icon-btn" data-close aria-label="닫기">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
    </aside>`;
  root.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) close();
  });
  if (onMount) onMount(overlay, close);
  return { el: overlay, close };
}

export function confirmBox(message, { title = '확인', ok = '확인', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let closeFn = () => {};
    const finish = (value) => {
      if (settled) return;
      settled = true;
      closeFn();
      resolve(value);
    };
    const { close } = openModal({
      title,
      body: `<p style="font-size:13px;line-height:1.65;color:var(--ink-2)">${esc(message)}</p>`,
      foot: `<button class="btn btn-ghost" data-cancel>취소</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>`,
      onMount(el, closeModal) {
        closeFn = closeModal;
        el.querySelector('[data-cancel]').onclick = () => finish(false);
        el.querySelector('[data-ok]').onclick = () => finish(true);
      },
      onClose: () => { if (!settled) { settled = true; resolve(false); } },
    });
    closeFn = close;
  });
}

/* ---------------- Files ---------------- */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function downloadJson(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}
export function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}
export function exportXlsx(sheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = (rows[0] || []).map((h, i) => ({ wch: Math.min(28, Math.max(9, String(h ?? '').length + 4, ...rows.slice(0, 40).map((r) => String(r[i] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
export const readFile = (file, as = 'arrayBuffer') => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  if (as === 'text') r.readAsText(file, 'utf-8');
  else if (as === 'dataUrl') r.readAsDataURL(file);
  else r.readAsArrayBuffer(file);
});
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('클립보드에 복사했습니다.', 'success');
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('클립보드에 복사했습니다.', 'success');
    return true;
  }
}

/* ---------------- Misc UI ---------------- */
export const statusMeta = {
  normal: { label: '정상', cls: 'gray' },
  cancelled: { label: '취소', cls: 'red' },
  support: { label: '지원', cls: 'amber' },
  return: { label: '회송', cls: 'purple' },
  notshipped: { label: '미출고', cls: 'red' },
  accident: { label: '사고', cls: 'red' },
  changed: { label: '변경', cls: 'blue' },
  extra: { label: '용차', cls: 'purple' },
};
export const statusBadge = (s) => {
  const m = statusMeta[s] || statusMeta.normal;
  return `<span class="badge ${m.cls}">${m.label}</span>`;
};
export const gradeOf = (score) => (score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 50 ? 'D' : 'F');
export const gradeColor = { S: '#d8920a', A: '#0f6fae', B: '#0b8261', C: '#c48215', D: '#cf5a28', F: '#6b7a90' };

export function sparkbar(values, { width = 120, height = 28, color = '#1487c9' } = {}) {
  const max = Math.max(1, ...values);
  const bw = width / Math.max(1, values.length);
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" style="width:${width}px;height:${height}px">${
    values.map((v, i) => {
      const h = Math.max(1, (v / max) * (height - 3));
      return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(height - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}" opacity="${0.35 + 0.65 * (v / max)}"/>`;
    }).join('')
  }</svg>`;
}
