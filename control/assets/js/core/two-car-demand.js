import {norm} from './utils.js';
import {dispatchStatus,dispatchMemo} from './dispatch-metrics.js';
import {transportRouteKey} from './dispatch-identity.js';
import {validDate} from './schedule.js';
import {routePriority} from './route-packing.js';
import {productFamily} from './product-family.js';

export function cargoName(row){
  const f=productFamily(row);
  return f.held?(f.sourceModel||'차종 미확인'):[f.brand,f.model].join(' ');
}
// These names flag a dimensional review. They are never evidence of a loading limit.
const reviewModel=name=>/^(CADILLAC Escalade|LINCOLN Navigator|GMC Yukon|FORD Expedition)( |$)/i.test(name);
const unknown=value=>!norm(value)||/^(-+|미정|미상|미확인|미입력|없음|unknown|n\/a|\?+)$/i.test(norm(value));
function place(value){
  const label=String(value||'').normalize('NFKC').trim()
  .replace(/(?:담당자|연락처|전화번호|휴대폰번호|0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}).*$/s,'')
  .replace(/[\s/(·-]+$/,'').trim().replace(/^(경기도|서울특별시|인천광역시|부산광역시|대구광역시|대전광역시|울산광역시)\s/,(_,v)=>v.slice(0,2)+' ');
  // Compare explicit street addresses at building-number level. Never reduce to a road or city alone.
  const address=label.match(/^((?:[가-힣]+(?:시|도)|서울|경기|인천|대구|부산|대전|울산|광주)\s+(?:[가-힣0-9·.]+\s+){0,5}[가-힣0-9·.]+(?:로|길)\s+\d+(?:-\d+)?)(?=$|[\s,(])/);
  return address?address[1]:label;
}
const usable=r=>!['cancelled','notshipped','support','postponed'].includes(dispatchStatus(r)) &&
  dispatchMemo(r.driver)!=='배차 연기'&&!/^\[배차 연기\]/.test(String(r.note||'').trim());

// One physical demand per date, VIN and leg. The ledger wins over the reference copy,
// including cancellation and archived-only records. Hold disputed lots before sizing.
export function demandLots(data,month){
  const records=new Map(),lots=new Map(),blocked=new Set();
  let held=0;
  function lotKey(row){
    const o=place(row.origin),d=place(row.destination);
    return unknown(o)||unknown(d)?null:JSON.stringify([row.date,norm(o),norm(d)]);
  }
  for(const [source,rows] of [['ledger',data.dispatch],['history',data.transportHistory]]){
    for(const row of rows||[]){
      if(!validDate(row.date)||!row.date.startsWith(month+'-'))continue;
      const id=transportRouteKey({...row,origin:place(row.origin),destination:place(row.destination)}),key=lotKey(row);
      if(!id||!key){
        if(usable(row)&&!row.archivedAt&&!row.duplicateOf){held++;if(key)blocked.add(key);}
        continue;
      }
      let entry=records.get(id);
      if(!entry){entry={source,rows:[]};records.set(id,entry);}
      if(entry.source===source&&!row.archivedAt&&!row.duplicateOf)entry.rows.push(row);
    }
  }
  for(const {rows} of records.values()){
    if(!rows.length)continue;
    const row=rows[0],key=lotKey(row);
    const sig=r=>JSON.stringify([usable(r),Number(r.count),norm(r.model),norm(r.customer),String(r.arrivalDate||'')]);
    if(rows.some(r=>sig(r)!==sig(row))){blocked.add(key);held++;continue;}
    if(!usable(row))continue;
    const count=Number(row.count);
    if(!Number.isSafeInteger(count)||count<1){blocked.add(key);held++;continue;}
    if(!lots.has(key))lots.set(key,{date:row.date,origin:place(row.origin),destination:place(row.destination),models:new Map()});
    const m=lots.get(key).models,name=cargoName(row);
    m.set(name,(m.get(name)||0)+count);
  }
  for(const key of blocked)lots.delete(key);
  return {lots:[...lots.values()],held,blocked:blocked.size};
}

// A stop can belong to several approved neighborhoods. Find a maximum matching
// in that undirected graph so the order of the stop names cannot cost a pair.
function matchStops(stops,nearby){
  const size=stops.length,edges=Array.from({length:size},()=>[]);
  for(let i=0;i<size;i++)for(let j=i+1;j<size;j++){
    if(routePriority(stops[i],stops[j],nearby)!==2)continue;
    edges[i].push(j);edges[j].push(i);
  }
  const mate=Array(size).fill(-1);
  function augment(root){
    const parent=Array(size).fill(-1),base=Array.from({length:size},(_,i)=>i);
    const queue=[root],seen=new Set(queue);
    function commonBase(a,b){
      const path=new Set();
      for(;;){a=base[a];path.add(a);if(mate[a]===-1)break;a=parent[mate[a]];}
      while(!path.has(base[b]))b=parent[mate[base[b]]];
      return base[b];
    }
    function markCycle(node,ancestor,child,cycle){
      while(base[node]!==ancestor){
        cycle.add(base[node]);cycle.add(base[mate[node]]);
        parent[node]=child;child=mate[node];node=parent[child];
      }
    }
    for(let head=0;head<queue.length;head++){
      const node=queue[head];
      for(const next of edges[node]){
        if(base[node]===base[next]||mate[node]===next)continue;
        if(next===root||(mate[next]!==-1&&parent[mate[next]]!==-1)){
          const ancestor=commonBase(node,next),cycle=new Set();
          markCycle(node,ancestor,next,cycle);markCycle(next,ancestor,node,cycle);
          for(let i=0;i<size;i++)if(cycle.has(base[i])){
            base[i]=ancestor;if(!seen.has(i)){seen.add(i);queue.push(i);}
          }
        }else if(parent[next]===-1){
          parent[next]=node;
          if(mate[next]===-1){
            let end=next;
            while(end!==-1){
              const previous=parent[end],tail=mate[previous];
              mate[end]=previous;mate[previous]=end;end=tail;
            }
            return;
          }
          const partner=mate[next];seen.add(partner);queue.push(partner);
        }
      }
    }
  }
  for(let i=0;i<size;i++)if(mate[i]===-1&&edges[i].length)augment(i);
  return mate;
}

export function reviewDemand(lots,{nearby=[],solo=new Set()}={}){
  const totals={same:0,near:0,solo:0,large:0,largeLots:0,review:0,open:0,pending:0,units:0};
  const models=new Map(),routes=new Map(),singles=new Map(),days=new Map();
  function record(kind,entries){
    for(const [name,count] of entries){
      if(!models.has(name))models.set(name,{});
      const m=models.get(name);m[kind]=(m[kind]||0)+count;
    }
  }
  function lane(kind,lot,destination){
    const key=JSON.stringify([kind,lot.origin,destination]);
    routes.set(key,(routes.get(key)||0)+1);
    days.set(lot.date,(days.get(lot.date)||0)+1);
  }
  for(const lot of lots){
    const ordinary=[];let volume=0,suspect=0;
    for(const [name,count] of lot.models){
      totals.units+=count;
      if(solo.has(norm(name))){totals.solo+=count;record('solo',[[name,count]]);days.set(lot.date,(days.get(lot.date)||0)+count);}
      else if(reviewModel(name)||name==='차종 미확인'){suspect+=count;totals.review+=count;record('review',[[name,count]]);}
      else{ordinary.push([name,count]);volume+=count;}
    }
    if(volume>=3){totals.large+=volume;totals.largeLots++;record('large',ordinary);}
    else if(!volume)continue;
    else if(suspect){totals.pending+=volume;record('pending',ordinary);}
    else if(volume===2){totals.same++;record('same',ordinary);lane('동일 2대',lot,lot.destination);}
    else{
      const key=JSON.stringify([lot.date,norm(lot.origin)]);
      if(!singles.has(key))singles.set(key,[]);
      singles.get(key).push({...lot,ordinary});
    }
  }
  for(const stops of singles.values()){
    stops.sort((a,b)=>a.destination.localeCompare(b.destination,'ko'));
    const mates=matchStops(stops,nearby);
    for(const [i,a] of stops.entries()){
      const j=mates[i];
      if(j<0){totals.open++;record('open',a.ordinary);continue;}
      if(j<i)continue;
      totals.near++;
      record('near',[...a.ordinary,...stops[j].ordinary]);
      lane('인접 1+1',a,a.destination+' / '+stops[j].destination);
    }
  }
  return {totals,models,routes,days};
}
