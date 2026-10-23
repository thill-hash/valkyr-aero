/* Valkyr360 — data-access layer over IndexedDB.
   Stores: kv (app state blob: aircraft, due items, squawks, docs, bookings, people),
           logbook (append-only entries incl. flights; indexed for paged queries). */
(function(){
const NAME0='valkyr-aero',VER=2;let NAME=NAME0; /* one database per data scope: 'valkyr-aero' (demo) or 'valkyr-aero-<accountId>' */
let db=null;
const req2p=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const txDone=t=>new Promise((res,rej)=>{t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)});
const LO='',HI='\uffff';
function rangeFor({ac,type}){
  if(ac&&type)return {idx:'ac_type_date',range:IDBKeyRange.bound([ac,type,LO],[ac,type,HI])};
  if(ac)return {idx:'ac_date',range:IDBKeyRange.bound([ac,LO],[ac,HI])};
  if(type)return {idx:'type_date',range:IDBKeyRange.bound([type,LO],[type,HI])};
  return {idx:'date',range:null};
}
/* batched full-store read: getAll in primary-key chunks is ~5–10× faster than a cursor over 250k rows */
async function readAll(storeName,chunk=25000){const out=[];let last=null;
  for(;;){const st=db.transaction(storeName).objectStore(storeName);const rng=last==null?null:IDBKeyRange.lowerBound(last,true);
    const part=await req2p(st.getAll(rng,chunk));for(const v of part)out.push(v);if(part.length<chunk)break;last=part[part.length-1][st.keyPath]}
  return out}
const CACHE={ver:{logbook:0,expenses:0},expenses:null,logbook:null};
const bump=n=>{CACHE.ver[n]++;CACHE[n]=null};
async function allCached(n){if(CACHE[n]&&CACHE[n].ver===CACHE.ver[n])return CACHE[n].rows;const v=CACHE.ver[n];const rows=await readAll(n);if(v===CACHE.ver[n])CACHE[n]={ver:v,rows};return rows}
const cmpDate=(dir)=>dir==='next'?(a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.id<b.id?-1:a.id>b.id?1:0):(a,b)=>a.date<b.date?1:a.date>b.date?-1:(a.id<b.id?1:a.id>b.id?-1:0);
const DAL=window.DAL={
  _cache:CACHE,
  get name(){return NAME},
  async init(name){if(name)NAME=name;
    const r=indexedDB.open(NAME,VER);
    r.onupgradeneeded=()=>{const d=r.result;
      if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');
      if(!d.objectStoreNames.contains('logbook')){const s=d.createObjectStore('logbook',{keyPath:'id'});
        s.createIndex('date','date');s.createIndex('ac_date',['ac','date']);s.createIndex('type_date',['type','date']);s.createIndex('ac_type_date',['ac','type','date'])}
      if(!d.objectStoreNames.contains('expenses')){const e=d.createObjectStore('expenses',{keyPath:'id'});
        e.createIndex('date','date');e.createIndex('ac_date',['ac','date']);e.createIndex('ref','ref')}
    };
    db=await req2p(r);return DAL;
  },
  async getState(){return req2p(db.transaction('kv').objectStore('kv').get('state'))},
  async getKV(k){return req2p(db.transaction('kv').objectStore('kv').get(k))},
  async putKV(k,v){const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);return txDone(t)},
  async putState(s){const t=db.transaction('kv','readwrite');t.objectStore('kv').put(s,'state');return txDone(t)},
  async addLogs(entries,chunk=5000,onProgress){bump('logbook');
    for(let i=0;i<entries.length;i+=chunk){const t=db.transaction('logbook','readwrite'),st=t.objectStore('logbook');
      for(const e of entries.slice(i,i+chunk))st.put(e);await txDone(t);onProgress&&onProgress(Math.min(entries.length,i+chunk))}
  },
  async clearAll(){bump('logbook');bump('expenses');const t=db.transaction(['logbook','expenses'],'readwrite');t.objectStore('logbook').clear();t.objectStore('expenses').clear();return txDone(t)},
  /* ---- expenses ledger ---- */
  async putExpenses(rows,chunk=5000){bump('expenses');for(let i=0;i<rows.length;i+=chunk){const t=db.transaction('expenses','readwrite'),st=t.objectStore('expenses');rows.slice(i,i+chunk).forEach(r=>st.put(r));await txDone(t)}},
  async deleteExpense(id){bump('expenses');const t=db.transaction('expenses','readwrite');t.objectStore('expenses').delete(id);return txDone(t)},
  async getExpense(id){return req2p(db.transaction('expenses').objectStore('expenses').get(id))},
  async countExpenses(){return req2p(db.transaction('expenses').objectStore('expenses').count())},
  /* Scan one index range (aircraft+dates or dates), filter in the cursor; returns a page + filtered total + filtered sum. */
  async queryExpenses({ac,cat,from,to,q,sort='date_desc',offset=0,limit=25}={}){
    const lo=from||'',hi=(to||'9999')+'\uffff';const st=db.transaction('expenses').objectStore('expenses');
    const cand=ac?await req2p(st.index('ac_date').getAll(IDBKeyRange.bound([ac,lo],[ac,hi]))):await allCached('expenses');
    const ql=q&&q.toLowerCase();const cats=cat?String(cat).split('|'):null;
    let sum=0;const hit=[];
    for(const v of cand){if(!ac&&(v.date<lo||v.date>hi))continue;if(cats&&!cats.includes(v.cat))continue;
      if(ql&&!(v.vendor+' '+v.desc+' '+v.cat+' '+(v.notes||'')+' '+(v.paidBy||'')).toLowerCase().includes(ql))continue;sum+=v.amount;hit.push(v)}
    hit.sort(sort==='amount_asc'?(a,b)=>a.amount-b.amount:sort==='amount_desc'?(a,b)=>b.amount-a.amount:cmpDate(sort==='date_asc'?'next':'prev'));
    return {rows:hit.slice(offset,offset+limit),total:hit.length,sum};
  },

  async scanExpenses({ac,from,to}){const r=await DAL.queryExpenses({ac,from,to,sort:'date_asc',limit:1e9});return r.rows},
  async flightsIn({ac,from,to}){const st=db.transaction('logbook').objectStore('logbook');const out=[];
    const idx=ac?st.index('ac_type_date'):st.index('type_date');
    const range=ac?IDBKeyRange.bound([ac,'Flight',from],[ac,'Flight',to+'\uffff']):IDBKeyRange.bound(['Flight',from],['Flight',to+'\uffff']);
    const rows=await req2p(idx.getAll(range));for(const v of rows)out.push(v);
    return out;
  },
  async getLog(id){return req2p(db.transaction('logbook').objectStore('logbook').get(id))},
  async putLog(e){bump('logbook');const t=db.transaction('logbook','readwrite');t.objectStore('logbook').put(e);return txDone(t)},
  async clearLogs(){bump('logbook');const t=db.transaction('logbook','readwrite');t.objectStore('logbook').clear();return txDone(t)},
  async countLogs(f={}){const {idx,range}=rangeFor(f);return req2p(db.transaction('logbook').objectStore('logbook').index(idx).count(range))},
  /* Paged query. Without text search: index range + count + cursor.advance (no full scan).
     With text search: scans only the index range (one aircraft / one type), keeps one page. */
  async queryLogs({ac,type,q,sort='desc',offset=0,limit=25}={}){
    const {idx,range}=rangeFor({ac,type});
    const dir=sort==='asc'?'next':'prev';
    const rows=[];
    if(!q){
      const total=range?await req2p(db.transaction('logbook').objectStore('logbook').index(idx).count(range)):await req2p(db.transaction('logbook').objectStore('logbook').count());
      // new transaction after the await: the count's transaction has auto-committed by now
      const store=db.transaction('logbook').objectStore('logbook').index(idx);
      await new Promise((res,rej)=>{let skipped=!offset;const c=store.openCursor(range,dir);
        c.onerror=()=>rej(c.error);
        c.onsuccess=()=>{const cur=c.result;if(!cur)return res();if(!skipped){skipped=true;cur.advance(offset);return}
          rows.push(cur.value);if(rows.length>=limit)return res();cur.continue()}});
      return {rows,total};
    }
    const ql=q.toLowerCase();
    const cand=range?await req2p(db.transaction('logbook').objectStore('logbook').index(idx).getAll(range)):await allCached('logbook');
    const hit=[];for(const v of cand){if((v.text+' '+(v.by||'')+' '+(v.from||'')+' '+(v.to||'')).toLowerCase().includes(ql))hit.push(v)}
    hit.sort(cmpDate(dir));rows.push(...hit.slice(offset,offset+limit));const total=hit.length;
    return {rows,total};
  },
  async sumHoursSince(date){let s=0,n=0;const rows=await req2p(db.transaction('logbook').objectStore('logbook').index('date').getAll(IDBKeyRange.lowerBound(date)));
    for(const v of rows)if(v.hrs){s+=v.hrs;n++}return {hrs:s,flights:n};
  }
};
})();
