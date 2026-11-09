// Shared presentation only. Authorization and vehicle scope remain server-enforced.
export const STAGES = ['입항·하역','검수','운송','도착'];
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rawStageOf(row, name) {
  const value = Array.isArray(row.stages) ? row.stages.find(s => s.name === name) : row.stages?.[name];
  const status = !value ? '대기' : Array.isArray(row.stages) ? value.status : value.skipped ? '생략' : '완료';
  return {name, date: value?.date || '', status: ['완료','생략','대기'].includes(status) ? status : '대기'};
}
export function stageOf(row,name){
 if(name!=='입항·하역')return rawStageOf(row,name);
 const a=rawStageOf(row,'입항'),b=rawStageOf(row,'하역');
 if(a.status==='대기'||b.status==='대기')return {name,date:'',status:'대기',partial:a.status!=='대기'?'입항 확인·하역 대기':''};
 return {name,date:b.date,status:a.status==='생략'||b.status==='생략'?'생략':'완료'};
}
export function currentStage(row) {
  const last = STAGES.filter(s => stageOf(row,s).status !== '대기').at(-1);
  return last ? `${last}${stageOf(row,last).status === '생략' ? ' 생략' : ' 완료'}` : '입항·하역 대기';
}
export function filterRows(rows, {q='',brand='',customer='',stage='',from='',to=''} = {}) {
  q=q.trim().toLowerCase();
  return rows.filter(r => (!brand || r.brand===brand) && (!customer || r.customer===customer) && (!stage || currentStage(r)===stage)
    && (!from || String(r.eta||'')>=from) && (!to || (!!r.eta && String(r.eta)<=to))
    && (!q || ['vin','bl','contract','model','vessel','voyage','origin','destination','customer'].some(k => String(r[k]||'').toLowerCase().includes(q))));
}
export function stageCounts(rows){return STAGES.map(name=>{const counts={name,완료:0,생략:0,대기:0};rows.forEach(r=>counts[stageOf(r,name).status]++);return counts;});}
export function vesselGroups(rows){const groups=new Map();for(const row of rows){const key=JSON.stringify([row.vessel||'',row.voyage||'']);if(!groups.has(key))groups.set(key,{vessel:row.vessel||'선박 미입력',voyage:row.voyage||'항차 미입력',rows:[]});groups.get(key).rows.push(row);}return [...groups.values()];}
export function dashboard(rows) {
 const counts=stageCounts(rows),cards=[['조회 차량',rows.length],['입항·하역 대기',counts[0].대기],...counts.map(c=>[c.name+' 누적 완료',c.완료])];
 return `<div class="truck-kpis">${cards.map(([label,n])=>`<article><span>${esc(label)}</span><strong>${n.toLocaleString('ko-KR')}<small>대</small></strong></article>`).join('')}</div><p class="truck-muted">조회 차량 ${rows.length}대 기준 · 각 단계의 누적 완료 대수입니다. 다음 단계로 진행해도 이전 단계 완료에 포함하며, 단계별 숫자를 합산하지 않습니다. 입항·하역은 사전 확인, 검수부터 운송사 관리 단계입니다. 생략은 완료에서 제외합니다.</p><div class="truck-progress">${counts.map(c=>{const percent=rows.length?Math.round(c.완료/rows.length*100):0;return `<article><b>${c.name}</b><div>완료 <strong>${c.완료}</strong> · 생략 ${c.생략} · 대기 ${c.대기}</div><div>전체 ${rows.length}대 중 ${c.완료}대 완료 · ${percent}%</div><progress max="${rows.length||1}" value="${c.완료}" aria-label="${c.name} 누적 완료 ${c.완료}대 / 전체 ${rows.length}대, ${percent}%"></progress></article>`;}).join('')}</div><section class="truck-section"><h3>선박·항차별 누적 진행 현황</h3><p class="truck-muted">현재 조회 조건에 포함된 차량 기준입니다. 같은 선박이라도 항차가 다르면 별도로 집계합니다. 항차 미입력 건은 같은 선박으로 묶입니다.</p><div class="truck-scroll"><table class="truck-data"><thead><tr><th>선박 / 항차</th><th>전체 대수</th>${STAGES.map(s=>`<th>${s} 누적 완료</th>`).join('')}</tr></thead><tbody>${vesselGroups(rows).map(g=>`<tr><td>${esc(g.vessel)}<br>${esc(g.voyage)}</td><td>${g.rows.length}대</td>${stageCounts(g.rows).map(c=>`<td><b>${c.완료} / ${g.rows.length}대</b><br><span class="truck-muted">생략 ${c.생략} · 대기 ${c.대기}</span><progress style="width:100%;accent-color:#2d6999" max="${g.rows.length}" value="${c.완료}" aria-label="${esc(g.vessel)} ${c.name} 완료 ${c.완료}대"></progress></td>`).join('')}</tr>`).join('')||'<tr><td colspan="6">조회 차량이 없습니다.</td></tr>'}</tbody></table></div></section>`;
}
export function table(rows, {selectable=false,selected=new Set()}={}) {
  return `<div class="truck-scroll"><table class="truck-data"><thead><tr>${selectable?'<th class="truck-no-print">선택</th>':''}<th>브랜드 / VIN / 차종</th><th>거래처 / B/L / 계약</th><th>선박 / 입항예정</th><th>출발 → 도착</th><th>현재 단계</th>${STAGES.map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${selectable?`<td class="truck-no-print"><input type="checkbox" data-truck-select="${esc(r.id)}" aria-label="${esc(r.vin)} 선택" ${selected.has(r.id)?'checked':''}></td>`:''}<td><b>${esc(r.brand)}</b><br>${esc(r.vin)}<br>${esc(r.model)}</td><td>${esc(r.customer)}<br>${esc(r.bl)}<br>${esc(r.contract)}</td><td>${esc(r.vessel)} ${esc(r.voyage)}<br>${esc(r.eta||'미입력')}</td><td>${esc(r.origin)} → ${esc(r.destination)}</td><td>${esc(currentStage(r))}</td>${STAGES.map(s=>{const v=stageOf(r,s);return `<td><span class="truck-badge ${v.status==='완료'?'done':v.status==='생략'?'skip':''}">${v.status}</span><br>${esc(v.date)}</td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${selectable?10:9}">조회 조건에 해당하는 차량이 없습니다.</td></tr>`}</tbody></table></div>`;
}
export function stageOptions(){return ['입항·하역 대기',...STAGES.flatMap(s=>[s+' 완료',s+' 생략'])].map(s=>`<option>${s}</option>`).join('');}
export function printReport(rows, title, subtitle='') {
  const frame=document.createElement('iframe');frame.title='상용트럭 인쇄 문서';frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;left:0;border:0';
  const css=new URL('view.css',import.meta.url).href;
  frame.onload=()=>{const win=frame.contentWindow;win.addEventListener('afterprint',()=>frame.remove(),{once:true});win.focus();win.print();setTimeout(()=>frame.remove(),120000);};
  frame.srcdoc=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><link rel="stylesheet" href="${esc(css)}"></head><body class="truck-report"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p>${dashboard(rows)}${table(rows)}</body></html>`;
  document.body.append(frame);
}
