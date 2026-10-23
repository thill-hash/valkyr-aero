/* Valkyr360 — Hill Systems platform admin console (DEMO).
   Platform-admin session only (role 'platform'; not an operator role). Reads every local operator account
   (auth store + its own IndexedDB fleet + billing record), the demo operator, and seeded DEMO operators.
   Every action has a confirm step and is written to the audit log. Production: ARCHITECTURE.md §17. */
(function(){
const {$,$$,esc}=VA;const A=VA.auth,B=VA.billing;
const KEY='va.admin';
const tierOf=id=>B.tierOf(id);
const ABBR={heavyjet:'HJ',lightjet:'LJ',turboprop:'TP',turbineheli:'TH',heavytwin:'HT',pistonheli:'PH',lighttwin:'LT',single:'SE',experimental:'EX'};
const today=()=>VA.todayISO();const fmt=s=>s?B.fmtDate(String(s).slice(0,10)):'—';
const money0=n=>'$'+Math.round(n).toLocaleString('en-US');const money2=B.money2;
const store=()=>{let s;try{s=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}if(!s||!s.ops){s={ops:seed(),audit:[]};localStorage.setItem(KEY,JSON.stringify(s))}return s};
const saveStore=s=>localStorage.setItem(KEY,JSON.stringify(s));
const isAdmin=()=>{const s=A.session();return !!(s&&s.platform&&VA.state()&&VA.state().role==='platform')};

/* ---------- seeded DEMO operators (fictitious; tails from the verified-unassigned DEMO pool) ---------- */
function seed(){const pool=((window.DEMO_TAILS||{}).pool||[]).slice(40);let k=0;const t=today();
  const MODEL={heavyjet:'Challenger 350',lightjet:'Citation CJ3+',turboprop:'King Air 250',turbineheli:'Bell 505',heavytwin:'Baron G58',pistonheli:'Robinson R44 II',lighttwin:'Seneca V',single:'Cessna 182T',experimental:'Vans RV-8'};
  const D=[['Blue Ridge Air Charter','active',{turboprop:2,lightjet:1},-420,-1],['Cumberland Flying Club','active',{single:6,lighttwin:1},-700,0],['Mesa Heli Tours','past_due',{pistonheli:3,turbineheli:1},-260,-3],
    ['Prairie Ag Services','trial',{single:2,experimental:1},-5,-1],['Harbor Seaplanes','suspended',{single:2},-380,-40],['Sierra Executive','active',{heavyjet:1,lightjet:2},-190,0],
    ['Warbird Heritage Group','active',{experimental:4},-520,-6],['Northline Medical Air','canceled',{turboprop:2},-610,-75],['Lakeside Aero Club','trial',{single:3,lighttwin:1,heavytwin:1},-9,0]];
  return D.map(([name,status,mix,signup,last],i)=>{const slug=name.toLowerCase().replace(/[^a-z]+/g,'-');const fleet=[];
    Object.entries(mix).forEach(([tier,n])=>{for(let j=0;j<n;j++)fleet.push({tail:pool[k++]||('N'+(900+k)+'DM'),model:MODEL[tier],tier})});
    const signupD=B.addD(t,signup),mo=fleet.reduce((s,a)=>s+tierOf(a.tier).price,0);const inv=[];
    if(status!=='trial'){let d=B.addD(signupD,14),n=1;const end=status==='canceled'?B.addD(t,-75):t;while(d<=end){inv.unshift({id:`VA-DEMO-${d.replace(/-/g,'')}-${String(n++).padStart(3,'0')}`,date:d,amount:mo,status:'paid'});d=B.addM(d,1)}
      if(status==='past_due'&&inv[0])inv[0].status='failed'}
    return {id:'seed-'+slug,kind:'seed',name:name+' (DEMO)',owner:'Demo owner',email:`owner@${slug}.demo`,status,fleet,signup:signupD,lastActive:B.addD(t,last),trialEnds:status==='trial'?B.addD(signupD,14):B.addD(signupD,14),invoices:inv,adjustments:[]}})}

/* ---------- read a local operator's fleet from its own IndexedDB scope ---------- */
async function readState(dbName){
  if(indexedDB.databases){const dbs=await indexedDB.databases();if(!dbs.some(d=>d.name===dbName))return null}
  return new Promise(res=>{const r=indexedDB.open(dbName);r.onerror=()=>res(null);r.onsuccess=()=>{const db=r.result;
    if(!db.objectStoreNames.contains('kv')){db.close();return res(null)}const g=db.transaction('kv').objectStore('kv').get('state');g.onsuccess=()=>{db.close();res(g.result||null)};g.onerror=()=>{db.close();res(null)}}})}
const statusOf=sub=>{if(!sub)return 'none';if(sub.status==='suspended')return 'suspended';if(sub.status==='canceled')return 'canceled';if(today()<sub.trialEnds&&sub.status!=='canceling')return 'trial';return 'active'};
async function load(){const st=store();const subs=B.all();const ops=[];
  /* demo operator = the shared demo database */
  const demoState=VA.state();let dsub=subs.demo;if(!dsub){dsub=B.demoSub();B.put('demo',dsub)}
  ops.push({id:'demo',kind:'demo',uid:'demo',name:'Valkyr360 Demo Flight Dept (DEMO)',owner:'Trevor Hill',email:'demo@valkyr-aero.demo',status:statusOf(dsub),ends:dsub.cancelAt,
    fleet:(demoState.aircraft||[]).map(a=>({tail:a.tail,model:a.model,tier:a.cls})),signup:dsub.created,lastActive:today(),trialEnds:dsub.trialEnds,invoices:dsub.invoices||[],adjustments:dsub.adjustments||[]});
  for(const a of A.accounts()){const s=await readState('valkyr-aero-'+a.id);const sub=subs[a.id];
    ops.push({id:a.id,kind:'account',uid:a.id,name:a.org,owner:a.name,email:a.email,status:statusOf(sub),ends:sub&&sub.cancelAt,
      fleet:s?(s.aircraft||[]).map(x=>({tail:x.tail,model:x.model,tier:x.cls})):((sub&&sub.signup)||[]).map(x=>({tail:x.tail,model:x.model,tier:x.tier})),
      signup:a.created,lastActive:a.lastActive||a.created,trialEnds:sub&&sub.trialEnds,invoices:(sub&&sub.invoices)||[],adjustments:(sub&&sub.adjustments)||[]})}
  st.ops.forEach(o=>ops.push(o));
  ops.forEach(o=>{o.monthly=o.fleet.reduce((s,a)=>s+tierOf(a.tier).price,0);o.n=o.fleet.length});
  VA.adminOps=ops;return ops}
VA.adminLoad=()=>load();
const mix=f=>{const c={};f.forEach(a=>c[a.tier]=(c[a.tier]||0)+1);return VA.TIERS.filter(t=>c[t.id]).map(t=>`${c[t.id]} ${ABBR[t.id]}`).join(' · ')||'—'};
const LABEL={trial:'Trial',active:'Active',past_due:'Past due',canceled:'Canceled',suspended:'Suspended',none:'No plan'};
const CHIP={trial:'',active:'ok',past_due:'warn',canceled:'',suspended:'bad',none:''};
const chip=o=>`<span class="chip ${CHIP[o.status]}">${LABEL[o.status]}${o.ends&&o.status==='active'?' · ends '+fmt(o.ends):''}</span>`;
const isMRR=o=>o.status==='active'||o.status==='past_due';

/* ---------- actions (confirm → apply → audit) ---------- */
function audit(o,action,detail){const st=store();st.audit.unshift({at:new Date().toISOString(),admin:A.session().email,op:o.id,opName:o.name,action,detail});saveStore(st)}
function mutate(o,fn){/* seeded ops live in the admin store; real operators in their billing record */
  if(o.kind==='seed'){const st=store();const x=st.ops.find(y=>y.id===o.id);fn(x,'seed');saveStore(st);return}
  const subs=B.all();let sub=subs[o.uid];if(!sub&&o.uid==='demo')sub=B.demoSub();if(!sub){const t=today();sub={uid:o.uid,status:'active',created:t,trialEnds:t,anchor:t,payment:{label:'Demo payment method',updated:t},invoices:[],adjustments:[]}}
  fn(sub,'sub');B.put(o.uid,sub)}
function confirmDo(title,body,btn,apply){VA.modal(title,body,`<button class="btn" data-close>Cancel</button><button class="btn ${/Suspend/.test(btn)?'danger':'primary'}" id="admGo">${btn}</button>`,m=>{$('#admGo',m.parentElement).onclick=()=>{const r=apply(m.parentElement);if(r===false)return;VA.closeModal();VA.route()}})}
const ACT={
  suspend:o=>confirmDo(`Suspend ${o.name}?`,'<p style="margin-top:0">The account becomes read-only. Data stays exportable.</p>','Suspend',()=>{mutate(o,(x,k)=>{x.prevStatus=x.status;x.status='suspended'});audit(o,'Suspend','read-only');VA.toast('Suspended','ok')}),
  restore:o=>confirmDo(`Restore ${o.name}?`,'<p style="margin-top:0">Full access returns.</p>','Restore',()=>{mutate(o,(x,k)=>{x.status=x.prevStatus&&x.prevStatus!=='suspended'?x.prevStatus:'active';delete x.prevStatus});audit(o,'Restore','');VA.toast('Restored','ok')}),
  trial:o=>confirmDo(`Extend trial · ${o.name}`,`<label class="f">Days<select id="admDays"><option>7</option><option selected>14</option><option>30</option></select></label>`,'Extend trial',m=>{const n=+$('#admDays',m).value;let to;
    mutate(o,(x,k)=>{const base=x.trialEnds&&x.trialEnds>today()?x.trialEnds:today();x.trialEnds=B.addD(base,n);to=x.trialEnds;if(k==='sub'){x.anchor=x.trialEnds}else if(x.status==='active'||x.status==='past_due')x.status='trial'});audit(o,'Extend trial',`+${n} days → ${to}`);VA.toast(`Trial until ${fmt(to)}`,'ok')}),
  credit:o=>confirmDo(`Credit · ${o.name}`,`<div class="form"><label class="f">Amount ($)<input id="admAmt" type="number" min="0.01" step="0.01" value="${o.monthly}"></label><label class="f">Note<input id="admNote" value="1 month comp"></label></div>`,'Apply credit',m=>{const amt=Math.round(parseFloat($('#admAmt',m).value)*100)/100;const note=$('#admNote',m).value.trim()||'Credit';
    if(!(amt>0)){VA.invalid($('#admAmt',m),'Enter an amount over $0');return false}
    mutate(o,x=>{(x.adjustments=x.adjustments||[]).push({date:today(),desc:`Credit (admin): ${note}`,amount:-amt})});audit(o,'Credit',`${money2(amt)} · ${note}`);VA.toast(`Credit ${money2(amt)} applied`,'ok')}),
  view:o=>confirmDo(`Open ${o.name} read-only?`,'<p style="margin-top:0">You’ll see the operator’s app, bannered and read-only.</p>','Open read-only',()=>{audit(o,'View as operator','read-only');setTimeout(()=>A.impersonate(o),50)})
};

/* ---------- views ---------- */
const auditTable=(rows,id)=>rows.length?`<div class="tbl"><div class="tbl-scroll"><table class="bill-t" id="${id}"><thead><tr><th>When</th><th>Admin</th><th>Operator</th><th>Action</th><th>Detail</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="small">${esc(r.at.slice(0,16).replace('T',' '))}</td><td class="small">${esc(r.admin)}</td><td>${esc(r.opName)}</td><td><b>${esc(r.action)}</b></td><td class="small">${esc(r.detail||'')}</td></tr>`).join('')}</tbody></table></div></div>`:'<div class="empty small">No actions yet.</div>';
VA.views.admin=function(el,args){
  if(!isAdmin()){location.hash='#/'+VA.home();return {title:'Admin'}}
  el.innerHTML='<div class="spinner"></div>';const my=VA.adminSeq=(VA.adminSeq||0)+1;
  load().then(ops=>{if(my!==VA.adminSeq||!document.contains(el))return;(args&&args[0]==='op')?detail(el,ops,decodeURIComponent(args[1]||'')):list(el,ops)});
  return {title:args&&args[0]==='op'?'Admin · Operator':'Admin'};
};
function list(el,ops){const ac=ops.reduce((s,o)=>s+o.n,0),mrr=ops.filter(isMRR).reduce((s,o)=>s+o.monthly,0),trials=ops.filter(o=>o.status==='trial').length;
  el.innerHTML=`<div class="stats s4">
    <div class="stat"><div class="l">Operators</div><div class="v" id="admOps">${ops.length}</div></div>
    <div class="stat"><div class="l">Aircraft</div><div class="v" id="admAc">${ac}</div></div>
    <div class="stat"><div class="l">MRR</div><div class="v" id="admMrr">${money0(mrr)}</div></div>
    <div class="stat"><div class="l">Trials</div><div class="v" id="admTrials">${trials}</div></div></div>
  <div class="card" style="margin-top:16px"><h2>Operators</h2><div id="admList"></div></div>
  <div class="card" style="margin-top:16px"><h2>Audit log</h2>${auditTable(store().audit,'admAudit')}</div>`;
  VA.list($('#admList',el),{id:'admin',pageSize:25,placeholder:'Search operator, email…',data:()=>ops,search:(o,q)=>(o.name+' '+o.email+' '+o.owner+' '+LABEL[o.status]+' '+o.fleet.map(a=>a.tail).join(' ')).toLowerCase().includes(q),
    filters:[{id:'st',label:'Status',opts:[['','All statuses'],...Object.entries(LABEL).filter(x=>x[0]!=='none').map(([k,v])=>[k,v])],test:(o,v)=>o.status===v}],
    sorts:[['name','Name',(a,b)=>a.name.localeCompare(b.name)],['mrr','Monthly ↓',(a,b)=>b.monthly-a.monthly],['ac','Aircraft ↓',(a,b)=>b.n-a.n],['signup','Newest',(a,b)=>String(b.signup).localeCompare(String(a.signup))],['last','Last active',(a,b)=>String(b.lastActive).localeCompare(String(a.lastActive))]],
    empty:'No operators.',
    render:rs=>`<div class="tbl"><div class="tbl-scroll"><table class="bill-t adm-t"><thead><tr><th>Operator</th><th>Owner email</th><th>Status</th><th>Aircraft</th><th class="num">Monthly</th><th>Signup</th><th>Last active</th></tr></thead><tbody>${rs.map(o=>`<tr data-op="${esc(o.id)}" tabindex="0"><td><a href="#/admin/op/${encodeURIComponent(o.id)}"><b>${esc(o.name)}</b></a></td><td class="small">${esc(o.email)}</td><td>${chip(o)}</td><td class="small">${o.n} <span class="dim">${esc(mix(o.fleet))}</span></td><td class="num">${money0(o.monthly)}</td><td class="small">${fmt(o.signup)}</td><td class="small">${fmt(o.lastActive)}</td></tr>`).join('')}</tbody></table></div></div>`,
    after:b=>$$('tr[data-op]',b).forEach(r=>{r.onkeydown=e=>{if(e.key==='Enter')location.hash='#/admin/op/'+encodeURIComponent(r.dataset.op)}})});
}
function detail(el,ops,id){const o=ops.find(x=>x.id===id);if(!o){el.innerHTML='<div class="empty">Operator not found. <a href="#/admin">Admin</a></div>';return}
  const susp=o.status==='suspended',canView=o.kind!=='seed';
  const hist=[...o.invoices.map(v=>({date:v.date,desc:v.id,amount:v.amount,st:v.status})),...o.adjustments.map(a=>({date:a.date,desc:a.desc,amount:a.amount,st:'adjustment'}))].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  el.innerHTML=`<a href="#/admin" class="small muted">← Admin</a>
  <div class="row" style="margin:10px 0 14px"><h2 style="margin:0;font-size:22px;text-transform:none;color:var(--text)" id="admName">${esc(o.name)}</h2>${chip(o)}</div>
  <div class="stats s4"><div class="stat"><div class="l">Owner</div><div class="v" style="font-size:15px">${esc(o.owner)}</div><div class="s">${esc(o.email)}</div></div>
    <div class="stat"><div class="l">Monthly</div><div class="v" id="admMonthly">${money0(o.monthly)}</div><div class="s">${o.n} aircraft</div></div>
    <div class="stat"><div class="l">Signup</div><div class="v" style="font-size:15px">${fmt(o.signup)}</div><div class="s">Last active ${fmt(o.lastActive)}</div></div>
    <div class="stat"><div class="l">Trial ends</div><div class="v" style="font-size:15px" id="admTrialEnds">${fmt(o.trialEnds)}</div></div></div>
  <div class="row" style="margin:16px 0" id="admActions">${susp?'<button class="btn" data-act="restore">Restore</button>':'<button class="btn danger" data-act="suspend">Suspend</button>'}<button class="btn" data-act="trial">Extend trial</button><button class="btn" data-act="credit">Credit / comp</button><button class="btn primary" data-act="view" ${canView?'':'disabled title="Seeded demo operator: no stored data"'}>View as operator</button></div>
  <div class="two-col"><div class="card"><h2>Fleet · ${o.n}</h2>${o.n?`<div class="tbl"><div class="tbl-scroll"><table class="bill-t" id="admFleet"><thead><tr><th>Tail</th><th>Aircraft</th><th>Tier</th><th class="num">/mo</th></tr></thead><tbody>${o.fleet.map(a=>`<tr><td class="mono"><b>${esc(a.tail)}</b></td><td>${esc(a.model||'')}</td><td>${esc(tierOf(a.tier).name)}</td><td class="num">$${tierOf(a.tier).price}</td></tr>`).join('')}</tbody></table></div></div>`:'<div class="empty small">No aircraft.</div>'}</div>
  <div class="card"><h2>Billing history</h2>${hist.length?`<div class="tbl"><div class="tbl-scroll"><table class="bill-t" id="admHist"><tbody>${hist.map(h=>`<tr><td class="small">${fmt(h.date)}</td><td class="small">${esc(h.desc)}</td><td class="num">${h.amount<0?'−':''}${money2(Math.abs(h.amount))}</td><td>${h.st==='failed'?'<span class="chip warn">Failed</span>':h.st==='paid'?'<span class="chip ok">Paid</span>':'<span class="chip">Adj.</span>'}</td></tr>`).join('')}</tbody></table></div></div>`:'<div class="empty small">None yet.</div>'}</div></div>
  <div class="card" style="margin-top:16px"><h2>Audit</h2>${auditTable(store().audit.filter(a=>a.op===o.id),'admOpAudit')}</div>`;
  $$('[data-act]',el).forEach(b=>b.onclick=()=>ACT[b.dataset.act](o));
}
})();
