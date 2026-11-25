export const metricDefaults = {volume:25,continuity:20,efficiency:20,destVariety:20,customerVariety:10,systemUse:5};

export function evaluationWeights(saved={}) {
  return Object.fromEntries(Object.entries(metricDefaults).map(([key,fallback])=>{
    const value=saved[key]??(key==='systemUse'?saved.brand:undefined);
    return [key,Number.isFinite(value)&&value>=0&&value<=100?value:fallback];
  }));
}

export function usageInPeriod(days,from,to) {
  let used=0,unused=0;
  for(const [day,value] of Object.entries(days||{})){
    if(day<from||day>to)continue;
    if(value==='used')used++;
    if(value==='unused')unused++;
  }
  return {used,unused,checked:used+unused};
}

export function incidentEstimate(records,points={}) {
  const defaults={상:8,중:4,하:1};
  let total=0;
  for(const event of records) {
    if(!['사고','클레임'].includes(event.type)||!Object.hasOwn(defaults,event.severity))continue;
    total+=Math.max(0,Number(points[event.severity]??defaults[event.severity])||0);
  }
  return Math.min(10,total);
}
