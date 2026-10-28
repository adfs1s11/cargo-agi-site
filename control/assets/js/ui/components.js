import { esc, icon, nf, round, pct } from '../core/utils.js';

export const pageHead = (title, sub, actions = '') => `
  <div class="page-head">
    <div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;

export const kpi = ({ label, value, unit = '', foot = '', iconName = 'chart', tone = '' }) => `
  <div class="kpi ${tone}">
    <div class="kpi-label"><span class="kpi-icon">${icon(iconName)}</span>${esc(label)}</div>
    <div class="kpi-value">${value}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    <div class="kpi-foot">${foot}</div>
  </div>`;

export const sectionHead = (title, count = null, actions = '', hint = '') => `
  <div class="section-head">
    <h3>${esc(title)}${count !== null ? `<span class="count">${nf(count)}</span>` : ''}</h3>
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
    ${actions || ''}
  </div>`;

export const banner = (text, tone = 'info', actions = '') => `
  <div class="insight ${tone === 'warn' ? 'warn' : ''}" style="margin-bottom:14px">
    ${icon(tone === 'warn' ? 'warning' : 'info')}<div style="flex:1">${text}</div>${actions}
  </div>`;

export const field = (label, input, { help = '', full = false, req = false } = {}) => `
  <div class="field ${full ? 'full' : ''}">
    <label>${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label>
    ${input}
    ${help ? `<div class="help">${help}</div>` : ''}
  </div>`;

export const searchInput = (id, placeholder = '검색', value = '') => `
  <div class="search">${icon('search')}<input id="${id}" type="search" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="off"></div>`;

export function pager(container, total, page, pageSize, onPage) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(Math.max(1, page), pages);
  const nums = [];
  const push = (n) => nums.push(`<button class="${n === cur ? 'active' : ''}" data-page="${n}">${n}</button>`);
  if (pages <= 7) for (let i = 1; i <= pages; i++) push(i);
  else {
    push(1);
    if (cur > 3) nums.push('<span class="muted" style="padding:0 3px">…</span>');
    for (let i = Math.max(2, cur - 1); i <= Math.min(pages - 1, cur + 1); i++) push(i);
    if (cur < pages - 2) nums.push('<span class="muted" style="padding:0 3px">…</span>');
    push(pages);
  }
  container.innerHTML = `
    <div class="table-foot">
      <span class="small muted">총 <b class="num">${nf(total)}</b>건 · ${cur}/${pages}페이지</span>
      <div class="pager">
        <button data-page="${cur - 1}" ${cur <= 1 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
        ${nums.join('')}
        <button data-page="${cur + 1}" ${cur >= pages ? 'disabled' : ''}>${icon('chevronRight')}</button>
      </div>
    </div>`;
  container.querySelectorAll('[data-page]').forEach((b) => {
    b.onclick = () => { const n = Number(b.dataset.page); if (n >= 1 && n <= pages) onPage(n); };
  });
}

export function barChart(items, { height = 150, color = '#1487c9', unit = '' } = {}) {
  const w = 640, h = height, padB = 22, padT = 12;
  const max = Math.max(1, ...items.map((i) => i.value));
  const padL = Math.max(48, nf(Math.round(max)).length * 7 + 16);
  const bw = (w - padL) / Math.max(1, items.length);
  const y = (v) => padT + (h - padT - padB) * (1 - v / max);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const yy = padT + (h - padT - padB) * t;
    return `<line x1="${padL}" y1="${yy}" x2="${w}" y2="${yy}" stroke="#edf2f8" stroke-width="1"/><text x="${padL - 8}" y="${yy + 3}" text-anchor="end" font-size="10" fill="#52647c">${nf(Math.round(max * (1 - t)))}</text>`;
  }).join('');
  const bars = items.map((it, i) => {
    const x = padL + i * bw + bw * 0.18;
    const bwid = bw * 0.64;
    const yy = y(it.value);
    return `<g>
      <rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bwid.toFixed(1)}" height="${Math.max(2, h - padB - yy).toFixed(1)}" rx="3" fill="${it.color || color}" opacity="${it.dim ? 0.35 : 0.9}"/>
      <text x="${(x + bwid / 2).toFixed(1)}" y="${(h - padB + 11).toFixed(0)}" text-anchor="middle" font-size="8" fill="#93a1b4">${esc(it.label)}</text>
      ${it.showValue ? `<text x="${(x + bwid / 2).toFixed(1)}" y="${(yy - 4).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#324158">${nf(it.value)}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" style="width:100%;height:${h}px">${grid}${bars}</svg>`;
}

export function donutChart(segments, { size = 132, thickness = 15, center = '', centerSub = '' } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const rings = segments.map((s) => {
    const len = (s.value / total) * c;
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="butt"/>`;
    offset += len;
    return el;
  }).join('');
  return `<div class="donut-wrap">
    <div style="position:relative;width:${size}px;height:${size}px;flex:0 0 auto">
      <svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#eef2f8" stroke-width="${thickness}"/>
        ${rings}
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
        <strong style="font-size:22px;font-weight:800;letter-spacing:-.04em">${center}</strong>
        ${centerSub ? `<small style="font-size:9.5px;color:var(--muted);margin-top:2px">${esc(centerSub)}</small>` : ''}
      </div>
    </div>
    <div class="donut-legend">
      ${segments.map((s) => `<div class="legend-row"><span class="legend-swatch" style="background:${s.color}"></span>${esc(s.label)}<b>${nf(s.value)}${s.unit || ''}</b></div>`).join('')}
    </div>
  </div>`;
}

export function metricBars(subscores, weights, labels) {
  return Object.keys(weights).map((k) => {
    const val = subscores[k] || 0;
    const max = weights[k] || 1;
    const p = Math.min(100, (val / max) * 100);
    return `<div class="metric">
      <div class="metric-top"><span>${esc(labels[k] || k)}</span><b>${round(val, 1)} / ${max}</b></div>
      <div class="metric-bar"><span style="width:${p}%"></span></div>
    </div>`;
  }).join('');
}

export const gradePill = (grade, label = '') => `<span class="row" style="gap:5px"><span class="grade ${grade}">${grade}</span>${label ? `<span class="small muted">${esc(label)}</span>` : ''}</span>`;

export const companyMark = (size = 26) => `<img src="assets/logo.png" alt="M&M" style="height:${size}px;object-fit:contain">`;

export const fieldRow = (label, value, cls = '') => `<div class="row-between ${cls}" style="padding:5px 0;gap:14px"><span class="small muted">${esc(label)}</span><span class="small strong" style="text-align:right">${value ?? '-'}</span></div>`;

export const statTile = (label, value, sub = '', tone = '') => `
  <div style="padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;min-width:0">
    <div class="tiny muted">${esc(label)}</div>
    <div style="font-size:17px;font-weight:800;letter-spacing:-.03em;margin-top:3px" class="${tone}">${value}</div>
    ${sub ? `<div class="tiny muted" style="margin-top:2px">${sub}</div>` : ''}
  </div>`;

export const percentLabel = (a, b) => (b ? pct((a / b) * 100, 1) : '0%');
