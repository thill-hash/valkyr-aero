/* Valkyr Aero — Fleet, Aircraft detail, Maintenance (fleet-wide due list) */
(function(){
const {$,$$,esc,h1,money,fmtDate,fmtShort,todayISO,I}=VA;
const S=()=>VA.state();
const V=VA.views={};
const SIL='<svg class="ac-sil" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';
const role=()=>S().role;
const STRANK={bad:0,warn:1,ok:2};
const tierName=id=>(VA.TIERS||[]).find(t=>t.id===id)?.name||id;

function nextDueLine(st){const x=st.items[0];if(!x)return '—';return VA.remText(x.d)}
function dueMini(st,n=3){
  return st.items.slice(0,n).map(x=>`<div class="it"><span class="dot ${x.d.st==='overdue'?'bad':x.d.st==='soon'?'warn':''}"></span><span class="name">${esc(x.it.name)}</span><span class="rem ${x.d.st==='overdue'?'bad-t':x.d.st==='soon'?'warn-t':'muted'}">${VA.remText(x.d)}</span></div>`).join('');
}
function acCard(r){
  const {a,st,c,open}=r;
  const third=role()==='owner'?`<div><div class="k">Cost / hr</div><div class="v">${money(c.total)}</div></div>`:`<div><div class="k">Open squawks</div><div class="v ${open?'warn-t':''}">${open}</div></div>`;
  return `<a class="ac-card ${st.code}" href="#/aircraft/${a.id}" data-ac="${a.id}">${SIL}
    <div class="ac-top"><div><div class="tail">${esc(a.tail)}${VA.demoN()}</div><div class="model">${esc(a.model)} · ${a.year}</div></div><span class="pill ${st.code}">${st.label}</span></div>
    <div class="ac-metrics"><div><div class="k">Total time</div><div class="v" data-tt="${a.id}">${h1(a.tt)}</div></div><div><div class="k">Next due</div><div class="v ${st.items[0]&&st.items[0].d.st!=='ok'?(st.items[0].d.st==='overdue'?'bad-t':'warn-t'):''}" style="font-size:13px;white-space:nowrap">${nextDueLine(st)}</div></div>${third}</div>
    <div class="due-mini">${dueMini(st)}</div>
    ${st.reasons.length?`<div class="ground-reason"><b>Grounded:</b> ${esc(st.reasons[0].text)}${st.reasons.length>1?` +${st.reasons.length-1} more`:''}</div>`:''}
  </a>`;
}
function fleetTable(rows){
  return `<div class="tbl"><div class="tbl-scroll"><table><thead><tr><th>Tail</th><th class="hide-m">Aircraft</th><th>Status</th><th class="hide-m">Total time</th><th>Next due</th>${role()==='owner'?'<th class="hide-m">$/hr</th>':''}<th class="hide-m">Squawks</th></tr></thead><tbody>
  ${rows.map(({a,st,c,open})=>`<tr data-ac="${a.id}" style="cursor:pointer" onclick="location.hash='#/aircraft/${a.id}'"><td class="mono" style="font-weight:700">${esc(a.tail)}</td><td class="hide-m"><div>${esc(a.short)}</div><div class="small dim">${esc(tierName(a.cls))}</div></td><td><span class="pill ${st.code}">${st.label}</span></td><td class="hide-m mono">${h1(a.tt)}</td>
  <td><div class="small">${esc(st.items[0]?st.items[0].it.name:'—')}</div><div class="mono small ${st.items[0]&&st.items[0].d.st!=='ok'?(st.items[0].d.st==='overdue'?'bad-t':'warn-t'):'muted'}">${nextDueLine(st)}</div></td>${role()==='owner'?`<td class="hide-m mono">${money(c.total)}</td>`:''}<td class="hide-m mono">${open||''}</td></tr>`).join('')}</tbody></table></div></div>`;
}
VA.fleetRows=function(){
  const openBy={};S().squawks.forEach(q=>{if(q.status==='open')openBy[q.ac]=(openBy[q.ac]||0)+1});
  return S().aircraft.map(a=>({a,st:VA.status(a.id),c:VA.costs(a.id),open:openBy[a.id]||0}));
};

/* ================= FLEET ================= */
V.fleet=function(el){
  const s=S(),rows=VA.fleetRows(),acs=s.aircraft;
  const cnt=k=>rows.filter(x=>x.st.code===k).length;
  const open=s.squawks.filter(q=>q.status==='open');
  const me=VA.me();
  let hero='';
  if(role()==='pilot'){
    const nb=s.bookings.filter(b=>b.pilot===me.id&&b.date>=todayISO()).sort((a,b)=>(a.date+String(a.start).padStart(2,'0')).localeCompare(b.date+String(b.start).padStart(2,'0')))[0];
    hero=`<div class="card row" style="margin-bottom:18px">${I.plane.replace('<svg','<svg style="width:28px;height:28px;color:var(--accent)"')}<div class="spacer"><div class="small muted">Your next flight</div><div style="font-weight:650;font-size:16px">${nb?`${esc(VA.ac(nb.ac).tail)} · ${fmtShort(nb.date)} ${nb.start}:00 · ${esc(nb.route||nb.purpose)}`:'Nothing booked — grab an aircraft'}</div></div><a class="btn primary" href="#/schedule">Book</a><a class="btn" href="#/squawks?new">Report squawk</a></div>`;
  } else if(role()==='mechanic'){
    const due=rows.reduce((t,x)=>t+x.st.items.filter(i=>i.d.st!=='ok').length,0);
    hero=`<div class="card row" style="margin-bottom:18px">${I.wrench.replace('<svg','<svg style="width:28px;height:28px;color:var(--accent)"')}<div class="spacer"><div class="small muted">Work queue</div><div style="font-weight:650;font-size:16px">${due+open.length} items need you — ${open.length} open squawk${open.length===1?'':'s'}, ${due} due items</div></div><a class="btn" href="#/maintenance">Due list</a><a class="btn primary" href="#/squawks">Open squawks</a></div>`;
  }
  const attn=[];
  rows.forEach(({a,st})=>st.items.filter(x=>x.d.st!=='ok').forEach(x=>attn.push({a,u:VA.urg(x.d),st:x.d.st,name:x.it.name,sub:x.it.ref,rem:VA.remText(x.d),req:x.it.required})));
  open.forEach(q=>attn.push({a:VA.ac(q.ac),u:q.grounding?-999:40,st:q.grounding?'overdue':'soon',name:'Squawk: '+q.title,sub:'Reported by '+VA.person(q.by).name+' · '+fmtShort(q.date),rem:q.grounding?'GROUNDING':'open',href:'#/squawks',req:q.grounding}));
  const key=x=>(x.st==='overdue'&&x.req!==false?-1e6:0)+x.u;
  attn.sort((x,y)=>key(x)-key(y));
  const upcoming=s.bookings.filter(b=>b.date>=todayISO()).sort((a,b)=>(a.date+String(a.start).padStart(2,'0')).localeCompare(b.date+String(b.start).padStart(2,'0'))).slice(0,5);
  const fifth=role()==='owner'?['Fleet avg $/hr',money(rows.reduce((t,r)=>t+r.c.total,0)/rows.length)]:['Hours this month','<span id="mHrs">…</span>'];
  el.innerHTML=`${hero}
  <div class="stats">
    <div class="stat"><div class="k">Airworthy</div><div class="v ok-t">${cnt('ok')}<span class="dim" style="font-size:15px">/${acs.length}</span></div></div>
    <div class="stat"><div class="k">Due soon</div><div class="v warn-t">${cnt('warn')}</div></div>
    <div class="stat"><div class="k">Grounded</div><div class="v bad-t">${cnt('bad')}</div></div>
    <div class="stat"><div class="k">Open squawks</div><div class="v">${open.length}</div></div>
    <div class="stat"><div class="k">${fifth[0]}</div><div class="v">${fifth[1]}</div></div>
  </div>
  ${VA.faaBanner?VA.faaBanner():''}${role()==='owner'?`<div class="row" style="margin-bottom:10px"><span class="spacer"></span><a class="btn sm" href="#/addaircraft">+ Add aircraft (FAA lookup)</a></div>`:''}<div id="fleetList"></div>
  <div class="two-col" style="margin-top:22px">
    <div class="card"><h2>Needs attention <span class="dim" style="letter-spacing:0;text-transform:none">· ${attn.length}</span></h2><div class="attn">${attn.length?attn.slice(0,7).map(x=>`<a href="${x.href||'#/aircraft/'+x.a.id}"><span class="t">${esc(x.a.tail)}</span><span class="n"><div>${esc(x.name)}</div><div class="small dim">${esc(x.sub)}</div></span><span class="pill ${x.st==='overdue'?'bad':'warn'} plain mono">${esc(x.rem)}</span></a>`).join(''):'<div class="empty">All clear. Nothing due in the next 30 days.</div>'}</div>
      ${attn.length>7&&role()!=='pilot'?`<a class="btn sm" style="margin-top:10px" href="#/maintenance">View all ${attn.length} →</a>`:''}</div>
    <div class="card"><h2>Upcoming bookings</h2><div class="attn">${upcoming.length?upcoming.map(b=>`<a href="#/schedule"><span class="t">${esc(VA.ac(b.ac).tail)}</span><span class="n"><div>${esc(b.route||b.purpose)}</div><div class="small dim">${fmtShort(b.date)} · ${b.start}:00–${b.start+b.dur}:00 · ${esc(VA.person(b.pilot).name)}</div></span><span class="chip">${esc(b.purpose)}</span></a>`).join(''):'<div class="empty">No upcoming bookings.</div>'}</div>
    ${s.pendingImports.length&&role()!=='mechanic'?`<a class="btn primary" style="margin-top:14px;width:100%;justify-content:center" href="#/log">${I.sync} ${s.pendingImports.length} new flights ready to import</a>`:''}</div>
  </div>`;
  const view=(VA.listState.fleet&&VA.listState.fleet.view)||(acs.length>12?'table':'cards');
  const lc=VA.list($('#fleetList',el),{id:'fleet',pageSize:12,sizes:[12,24,48,96],placeholder:'Search tail, model, class…',
    data:()=>rows,
    search:(r,q)=>(r.a.tail+' '+r.a.model+' '+tierName(r.a.cls)).toLowerCase().includes(q),
    filters:[{id:'st',label:'Status',opts:[['','All statuses'],['bad','Grounded'],['warn','Due soon'],['ok','Airworthy']],test:(r,v)=>r.st.code===v},
             {id:'cls',label:'Class',opts:[['','All classes'],...(VA.TIERS||[]).map(t=>[t.id,t.name])],test:(r,v)=>r.a.cls===v}],
    sorts:[['urg','Most urgent',(x,y)=>STRANK[x.st.code]-STRANK[y.st.code]||(x.st.items[0]?VA.urg(x.st.items[0].d):1e9)-(y.st.items[0]?VA.urg(y.st.items[0].d):1e9)],
           ['tail','Tail number',(x,y)=>x.a.tail.localeCompare(y.a.tail)],['tt','Total time',(x,y)=>y.a.tt-x.a.tt],['cost','Cost / hr',(x,y)=>y.c.total-x.c.total]],
    tools:`<div class="seg" role="group" aria-label="View"><button data-v="cards" class="${view==='cards'?'on':''}">Cards</button><button data-v="table" class="${view==='table'?'on':''}">Table</button></div>`,
    render:rs=>(VA.listState.fleet.view||view)==='table'?fleetTable(rs):`<div class="fleet">${rs.map(acCard).join('')}</div>`});
  $$('[data-v]',el).forEach(b=>b.onclick=()=>{VA.listState.fleet.view=b.dataset.v;$$('[data-v]',el).forEach(x=>x.classList.toggle('on',x===b));lc.redraw()});
  if(role()!=='owner'){const d=new Date();DAL.sumHoursSince(todayISO().slice(0,8)+'01').then(r=>{const m=$('#mHrs');if(m)m.textContent=h1(r.hrs)})}
  return {title:'Fleet'};
};

/* ================= due table (shared) ================= */
function dueRows(rows,showTail){
  const isMech=role()==='mechanic';
  return `<div class="tbl"><div class="tbl-scroll"><table><thead><tr>${showTail?'<th>Tail</th>':''}<th>Item</th><th>Type</th><th class="hide-m">Interval</th><th class="hide-m">Next due</th><th>Remaining</th><th class="hide-m">Verified</th>${isMech?'<th></th>':''}</tr></thead><tbody>
    ${rows.map(({it:i,d})=>{const cls=VA.pillCls(d.st);
      const intv=[i.intHrs?i.intHrs+' h':null,i.intMo?i.intMo+' mo':null].filter(Boolean).join(' / ')||(i.complied?'One-time · complied':'One-time');
      const next=[d.dueHrs!=null?h1(d.dueHrs)+' h':null,d.dueDate?fmtDate(d.dueDate):null].filter(Boolean).join('<br>')||'—';
      return `<tr class="${d.st==='overdue'?'overdue':''}" data-item="${i.id}">${showTail?`<td class="mono" style="font-weight:700"><a href="#/aircraft/${i.ac}" style="color:var(--text)">${esc(VA.ac(i.ac).tail)}</a></td>`:''}<td><div style="font-weight:600">${esc(i.name)}${i.required?'':' <span class="dim small">(advisory)</span>'}</div><div class="small dim">${esc(i.ref)}</div></td><td><span class="chip ${i.cat}">${i.cat}</span></td><td class="hide-m mono small">${intv}</td><td class="hide-m mono small">${next}</td>
      <td class="rem-cell"><div class="r ${cls}-t">${i.complied?'Complied':VA.remText(d)}</div><div class="bar"><i class="${cls}" style="width:${i.complied?100:Math.max(3,d.pct*100)}%"></i></div></td><td class="hide-m">${VA.iaBadge(i.verified)}</td>
      ${isMech?`<td><button class="btn sm ${d.st!=='ok'?'ok':''}" data-signoff="${i.id}">${I.check} ${i.verified?'Sign off':'Verify'}</button></td>`:''}</tr>`}).join('')}
    </tbody></table></div></div>`;
}
const DUE_FILTERS=(withAc)=>[
  {id:'st',label:'Status',def:withAc?'attn':'',opts:[['','All statuses'],['attn','Overdue + due soon'],['overdue','Overdue'],['soon','Due soon'],['ok','OK']],test:(r,v)=>v==='attn'?r.d.st!=='ok':r.d.st===v},
  {id:'cat',label:'Type',opts:[['','All types'],['Inspection','Inspections'],['AD','ADs'],['SB','SBs'],['Life-limited','Life-limited'],['Calendar','Calendar']],test:(r,v)=>r.it.cat===v},
  {id:'ver',label:'Verification',opts:[['','Verified + unverified'],['y','IA verified'],['n','Needs IA review']],test:(r,v)=>v==='y'?!!r.it.verified:!r.it.verified},
  ...(withAc?[{id:'ac',label:'Aircraft',opts:[['','All aircraft'],...S().aircraft.map(a=>[a.id,a.tail])],test:(r,v)=>r.it.ac===v}]:[])];
const DUE_SORTS=withAc=>[['urg','Most urgent',(x,y)=>(x.d.st==='overdue'?-1e6:0)+VA.urg(x.d)-((y.d.st==='overdue'?-1e6:0)+VA.urg(y.d))],
  ['name','Item name',(x,y)=>x.it.name.localeCompare(y.it.name)],['cat','Type',(x,y)=>x.it.cat.localeCompare(y.it.cat)||VA.urg(x.d)-VA.urg(y.d)],
  ...(withAc?[['tail','Tail number',(x,y)=>VA.ac(x.it.ac).tail.localeCompare(VA.ac(y.it.ac).tail)||VA.urg(x.d)-VA.urg(y.d)]]:[])];
const dueSearch=(r,q)=>(r.it.name+' '+r.it.ref+' '+r.it.cat+' '+VA.ac(r.it.ac).tail).toLowerCase().includes(q);
const bindSign=body=>$$('[data-signoff]',body).forEach(b=>b.onclick=()=>VA.signOffForm(b.dataset.signoff));

/* ================= MAINTENANCE (fleet-wide) ================= */
V.maintenance=function(el){
  const all=S().items.map(it=>({it,d:VA.itemDue(it)}));
  const unver=all.filter(r=>!r.it.verified&&!r.it.complied).length;
  el.innerHTML=`<div class="row" style="margin-bottom:14px"><div class="muted spacer">Every inspection, AD, SB and life-limited item across the fleet. ${unver?`<b class="warn-t">${unver} imported item${unver>1?'s':''} awaiting IA review.</b>`:''}</div>${role()!=='pilot'?`<a class="btn sm" href="#/log?csv=due">Import due items (CSV)</a>`:''}</div><div id="mxList"></div>`;
  VA.list($('#mxList',el),{id:'mx',pageSize:25,sizes:[25,50,100],placeholder:'Search item, AD/SB number, tail…',data:()=>all,search:dueSearch,filters:DUE_FILTERS(true),sorts:DUE_SORTS(true),render:rs=>dueRows(rs,true),after:bindSign,empty:'Nothing matches — try "All statuses".'});
  return {title:'Maintenance'};
};

/* ================= AIRCRAFT DETAIL ================= */
V.aircraft=function(el,parts){
  const a=VA.ac(parts[0]);if(!a){location.hash='#/fleet';return}
  const tab=parts[1]||'due', s=S(), st=VA.status(a.id), c=VA.costs(a.id);
  const sq=s.squawks.filter(q=>q.ac===a.id), openSq=sq.filter(q=>q.status==='open');
  const docs=s.docs.filter(d=>d.ac===a.id);
  const isMech=role()==='mechanic';
  const tabs=[['due','Due list',st.items.length],['squawks','Squawks',openSq.length],['logbook','Logbook','<span id="logN">…</span>'],['docs','Documents',docs.length]];
  const bv=a.baselineVerified;
  el.innerHTML=`<a href="#/fleet" class="small muted">← Fleet</a>
  <div class="detail-head" style="margin-top:10px"><div><div class="row"><span class="tail">${esc(a.tail)}</span>${VA.demoN()}<span class="pill ${st.code}">${st.label}</span></div><div class="model" style="font-size:15px">${esc(a.model)} · ${a.year} · S/N ${esc(a.serial)}</div></div><span class="spacer"></span>
    <div class="row">${!isMech?`<button class="btn" data-book>${I.cal} Book</button><a class="btn" href="#/log?ac=${a.id}">${I.log} Log flight</a><button class="btn primary" data-newsq>${I.sq} Squawk</button>`:`<button class="btn" data-book>${I.cal} Block for maintenance</button>`}</div></div>
  ${st.reasons.length?`<div class="check bad" style="margin:0 0 16px"><strong>GROUNDED — not available for booking</strong><ul>${st.reasons.map(r=>`<li>${esc(r.text)} <span class="dim">· ${esc(r.ref)}</span></li>`).join('')}</ul></div>`:''}
  <div class="kv">
    <div class="stat"><div class="k">Total time</div><div class="v" data-tt="${a.id}">${h1(a.tt)} h</div></div>
    <div class="stat"><div class="k">Next due</div><div class="v" style="font-size:16px">${esc(st.items[0]?st.items[0].it.name:'—')}</div><div class="small ${st.items[0]&&st.items[0].d.st!=='ok'?(st.items[0].d.st==='overdue'?'bad-t':'warn-t'):'muted'} mono">${nextDueLine(st)}</div></div>
    <div class="stat"><div class="k">Open squawks</div><div class="v">${openSq.length}</div></div>
    ${role()==='owner'?`<div class="stat"><div class="k">Cost / hr</div><div class="v">${money(c.total)}</div></div>`:`<div class="stat"><div class="k">Engines</div><div class="v" style="font-size:15px">${esc(a.engines)}</div></div>`}
    <div class="stat"><div class="k">Base</div><div class="v" style="font-size:16px">${esc(a.base||'KM02')}</div><div class="small muted">${a.base&&a.base!=='KM02'?'Demo base':'Dickson County, TN'}</div></div>
  </div>
  ${bv?`<div class="verify-banner">${I.shield}<div><div style="font-weight:650">Baseline due list verified by ${esc(bv.by)}, IA</div><div class="small muted">${esc(bv.cert)} · reviewed against logbooks ${fmtDate(bv.date)} · every item below traces to a signed entry</div></div></div>`:''}
  <div class="tabs">${tabs.map(t=>`<button class="${tab===t[0]?'on':''}" data-tab="${t[0]}">${t[1]}<span class="count">${t[2]}</span></button>`).join('')}</div>
  <div id="tabBody"></div>`;
  const tb=$('#tabBody',el);
  DAL.countLogs({ac:a.id}).then(n=>{const x=$('#logN');if(x)x.textContent=n.toLocaleString()});
  if(tab==='due'){
    const rows=st.items;
    VA.list(tb,{id:'due_'+a.id,pageSize:25,placeholder:'Search items, AD/SB numbers…',data:()=>rows,search:dueSearch,filters:DUE_FILTERS(false),sorts:DUE_SORTS(false),render:rs=>dueRows(rs,false),after:bindSign});
  } else if(tab==='squawks'){
    VA.squawkList(tb,'sq_'+a.id,()=>S().squawks.filter(q=>q.ac===a.id),false,!isMech?`<button class="btn primary sm" data-newsq>${I.sq} Report squawk</button>`:'');
  } else if(tab==='logbook'){
    VA.list(tb,{id:'log_'+a.id,pageSize:25,sizes:[25,50,100],placeholder:'Search entries, airports, names…',
      filters:[{id:'type',label:'Type',opts:[['','All entries'],['Flight','Flights'],['Maintenance','Maintenance'],['Inspection','Inspections']]}],
      sorts:[['desc','Newest first'],['asc','Oldest first']],
      fetch:({q,f,sort,offset,limit})=>DAL.queryLogs({ac:a.id,type:f.type||undefined,q,sort,offset,limit}),
      render:rs=>`<div class="list">${rs.map(l=>`<div class="li"><div class="icon">${l.type==='Flight'?I.plane:I.wrench}</div><div class="body"><div class="title">${esc(l.text)}</div><div class="meta">${fmtDate(l.date)} · ${esc(l.type)} · ${esc(l.by)}${l.imported?' · CSV import':''}</div></div>${l.hrs?`<span class="mono">${h1(l.hrs)} h</span>`:''}</div>`).join('')}</div>`,
      empty:'No logbook entries match.'});
  } else {
    const DS=d=>{const dd=d.exp?VA.daysBetween(todayISO(),d.exp):null;return dd==null?'file':dd<0?'expired':dd<=45?'soon':'current'};
    VA.list(tb,{id:'docs_'+a.id,pageSize:20,placeholder:'Search documents…',data:()=>S().docs.filter(d=>d.ac===a.id),search:(d,q)=>(d.name+' '+d.kind).toLowerCase().includes(q),
      filters:[{id:'st',label:'Status',opts:[['','All documents'],['expired','Expired'],['soon','Expiring ≤45 days'],['current','Current'],['file','No expiration']],test:(d,v)=>DS(d)===v}],
      sorts:[['exp','Expiring first',(x,y)=>(x.exp||'9999').localeCompare(y.exp||'9999')],['name','Name',(x,y)=>x.name.localeCompare(y.name)]],
      render:rs=>`<div class="list">${rs.map(d=>{const dd=d.exp?VA.daysBetween(todayISO(),d.exp):null;const cls=dd==null?'':dd<0?'bad':dd<=45?'warn':'ok';
        return `<div class="li"><div class="icon">${I.doc}</div><div class="body"><div class="title">${esc(d.name)}</div><div class="meta">${esc(d.kind)}${d.exp?' · expires '+fmtDate(d.exp):' · no expiration'}</div></div>${d.exp?`<span class="pill ${cls}">${dd<0?'Expired':dd<=45?dd+' days':'Current'}</span>`:'<span class="pill ok">On file</span>'}</div>`}).join('')}</div><p class="small dim" style="margin-top:12px">Demo: documents are placeholders. In production, scanned PDFs/photos upload here (object storage + OCR).</p>`});
  }
  $$('[data-tab]',el).forEach(b=>b.onclick=()=>{history.replaceState(null,'','#/aircraft/'+a.id+'/'+b.dataset.tab);VA.route()});
  $$('[data-newsq]',el).forEach(b=>b.onclick=()=>VA.squawkForm(a.id));
  el.addEventListener('click',e=>{const b=e.target.closest('[data-newsq]');if(b&&tb.contains(b))VA.squawkForm(a.id)});
  $$('[data-book]',el).forEach(b=>b.onclick=()=>VA.bookingForm({ac:a.id,purpose:isMech?'Maintenance':'Trip'}));
  return {title:a.tail+' · '+a.short};
};
})();
