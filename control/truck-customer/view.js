// Shared presentation only. Authorization and vehicle scope remain server-enforced.
export const STAGES = ['입항','하역','검수','운송','도착'];
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function stageOf(row, name) {
  const value = Array.isArray(row.stages) ? row.stages.find(s => s.name === name) : row.stages?.[name];
  const status = !value ? '대기' : Array.isArray(row.stages) ? value.status : value.skipped ? '생략' : '완료';
  return {name, date: value?.date || '', status: ['완료','생략','대기'].includes(status) ? status : '대기'};
}
export function currentStage(row) {
  const last = STAGES.filter(s => stageOf(row,s).status !== '대기').at(-1);
  return last ? `${last}${stageOf(row,last).status === '생략' ? ' 생략' : ' 완료'}` : '입항 예정';
}
export function filterRows(rows, {q='',brand='',customer='',stage='',from='',to=''} = {}) {
  q=q.trim().toLowerCase();
  return rows.filter(r => (!brand || r.brand===brand) && (!customer || r.customer===customer) && (!stage || currentStage(r)===stage)
    && (!from || String(r.eta||'')>=from) && (!to || (!!r.eta && String(r.eta)<=to))
    && (!q || ['vin','bl','contract','model','vessel','voyage','origin','destination','customer'].some(k => String(r[k]||'').toLowerCase().includes(q))));
}
export function dashboard(rows) {
  const current={};rows.forEach(r=>{const label=currentStage(r);current[label]=(current[label]||0)+1;});
  const cards=[['조회 차량',rows.length],['입항 예정',current['입항 예정']||0],...STAGES.map(s=>[s+' 완료',current[s+' 완료']||0])];
  const skipped=Object.entries(current).filter(([s])=>s.endsWith(' 생략')).reduce((n,[,v])=>n+v,0);
  if(skipped)cards.push(['현재 단계 생략',skipped]);
  return `<div class="truck-kpis">${cards.map(([label,n])=>`<article><span>${esc(label)}</span><strong>${n.toLocaleString('ko-KR')}<small>대</small></strong></article>`).join('')}</div><p class="truck-muted">현재 단계 기준 · 차량당 한 번 집계합니다. 아래 단계별 처리 현황은 누적입니다.</p><div class="truck-progress">${STAGES.map(s=>{const counts={완료:0,생략:0,대기:0};rows.forEach(r=>counts[stageOf(r,s).status]++);return `<article><b>${s}</b><div>완료 <strong>${counts.완료}</strong> · 생략 ${counts.생략} · 대기 ${counts.대기}</div><progress max="${rows.length||1}" value="${counts.완료}" aria-label="${s} 완료 ${counts.완료}대"></progress></article>`;}).join('')}</div>`;
}
export function table(rows, {selectable=false,selected=new Set()}={}) {
  return `<div class="truck-scroll"><table class="truck-data"><thead><tr>${selectable?'<th class="truck-no-print">선택</th>':''}<th>브랜드 / VIN / 차종</th><th>거래처 / B/L / 계약</th><th>선박 / 입항예정</th><th>출발 → 도착</th><th>현재 단계</th>${STAGES.map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${selectable?`<td class="truck-no-print"><input type="checkbox" data-truck-select="${esc(r.id)}" aria-label="${esc(r.vin)} 선택" ${selected.has(r.id)?'checked':''}></td>`:''}<td><b>${esc(r.brand)}</b><br>${esc(r.vin)}<br>${esc(r.model)}</td><td>${esc(r.customer)}<br>${esc(r.bl)}<br>${esc(r.contract)}</td><td>${esc(r.vessel)} ${esc(r.voyage)}<br>${esc(r.eta||'미입력')}</td><td>${esc(r.origin)} → ${esc(r.destination)}</td><td>${esc(currentStage(r))}</td>${STAGES.map(s=>{const v=stageOf(r,s);return `<td><span class="truck-badge ${v.status==='완료'?'done':v.status==='생략'?'skip':''}">${v.status}</span><br>${esc(v.date)}</td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${selectable?11:10}">조회 조건에 해당하는 차량이 없습니다.</td></tr>`}</tbody></table></div>`;
}
export function stageOptions(){return ['입항 예정',...STAGES.flatMap(s=>[s+' 완료',s+' 생략'])].map(s=>`<option>${s}</option>`).join('');}
export function printReport(rows, title, subtitle='') {
  const frame=document.createElement('iframe');frame.title='상용트럭 인쇄 문서';frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;left:0;border:0';
  const css=new URL('view.css',import.meta.url).href;
  frame.onload=()=>{const win=frame.contentWindow;win.addEventListener('afterprint',()=>frame.remove(),{once:true});win.focus();win.print();setTimeout(()=>frame.remove(),120000);};
  frame.srcdoc=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="${esc(css)}"></head><body class="truck-report"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${dashboard(rows)}${table(rows)}</body></html>`;
  document.body.append(frame);
}
