import {esc,nf} from '../core/utils.js';
export function performancePanel(p,label='회전별 운송 지표'){
 const items=[['기록상 배차',`${nf(p?.tripCount||0)}건`],['운송',`${nf(p?.units||0)}대`],['회전당 운송',p?.avgPerTrip==null?'확인 불가':`${p.avgPerTrip}대`],['회전 확인률',`${p?.coverage||0}%`],['적재율',p?.utilization==null?'한도 기록 없음':`${p.utilization}%`],['편성 정보 미확인',`${nf(p?.unclassifiedRecords||0)}건 · ${nf(p?.unclassifiedUnits||0)}대`]];
 return `<section class="card card-pad" style="margin:12px 0"><h3 style="font-size:15px;margin-bottom:10px">${esc(label)}</h3><div class="grid grid-3" style="gap:10px">${items.map(([k,v])=>`<div><div class="small muted">${k}</div><b>${esc(v)}</b></div>`).join('')}</div><p class="small muted" style="margin-top:10px;line-height:1.7">같은 일자·기사·차량·회전을 1건으로 집계합니다. 회전당 운송은 회전이 확인된 운송만 기준으로 계산합니다. 적재율은 확정 시 기록한 한도가 있는 편성 ${nf(p?.recordedCapacityTrips||0)}건만 반영하며, 과거 차량 한도를 현재 제원으로 추정하지 않습니다.</p></section>`;
}
