/* Valkyr360 — schedule, log flight, squawks, costs, plans + forms */
(function(){
const {$,$$,esc,h1,money,fmtDate,fmtShort,todayISO,addDays,uid,I}=VA;
const S=()=>VA.state();const V=VA.views;const role=()=>S().role;
const H0=6,H1=22;
const acOpts=sel=>S().aircraft.map(a=>`<option value="${a.id}" ${a.id===sel?'selected':''}>${esc(a.tail)} — ${esc(a.short)} (demo)</option>`).join('');
const pilotOpts=sel=>S().people.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(p.name)} · ${esc(p.title)}</option>`).join('');

/* ================= SCHEDULE ================= */
function weekStart(off){const d=VA.parse(todayISO());const dow=(d.getDay()+6)%7;d.setDate(d.getDate()-dow+off*7);return VA.isoOf(d)}
V.schedule=function(el){
  const s=S(),ws=weekStart(s.weekOffset||0),days=[...Array(7)].map((_,i)=>addDays(ws,i)),t=todayISO();
  const wkAc=[...new Set(s.bookings.filter(b=>days.includes(b.date)).map(b=>b.ac))];const stripAc=s.aircraft.length<=12?s.aircraft:s.aircraft.filter(a=>wkAc.includes(a.id));
  const strip=stripAc.map(a=>{const st=VA.status(a.id);return `<div class="s"><span class="dot ${st.code==='ok'?'':st.code}"></span><span class="tl">${esc(a.tail)}</span><span class="muted">${esc(a.short)}</span><span class="spacer"></span><span class="pill ${st.code}">${st.label}</span></div>`}).join('');
  el.innerHTML=`<div class="row" style="margin-bottom:14px"><div class="row" style="gap:6px"><button class="btn sm" data-wk="-1" aria-label="Previous week">‹</button><button class="btn sm" data-wk="0">This week</button><button class="btn sm" data-wk="1" aria-label="Next week">›</button></div>
    <b style="font-size:15px">${fmtShort(days[0])} – ${fmtDate(days[6])}</b><span class="spacer"></span>
    <button class="btn primary" data-new>${I.cal} ${role()==='mechanic'?'Block for maintenance':'New booking'}</button></div>
  <div class="ac-status-strip">${strip}</div>${s.aircraft.length>stripAc.length?`<div class="small dim" style="margin:-6px 0 10px">Showing ${stripAc.length} of ${s.aircraft.length} aircraft booked this week · every booking still runs the airworthiness check.</div>`:''}
  <div class="legend" style="margin-bottom:10px">${stripAc.map(a=>`<span style="--c:${a.color}"><i></i>${esc(a.tail)}</span>`).join('')}<span style="--c:var(--warn)"><i style="background:repeating-linear-gradient(135deg,var(--warn) 0 3px,transparent 3px 6px)"></i>Maintenance</span><span class="dim">· Tap an empty slot to book. Grounded aircraft can only be blocked for maintenance.</span></div>
  <div class="cal-wrap" style="--hh:34px"><div class="cal">
    <div class="hd" style="border-left:0"></div>${days.map(d=>{const dt=VA.parse(d);return `<div class="hd ${d===t?'today':''}">${dt.toLocaleDateString(undefined,{weekday:'short'})}<b>${dt.getDate()}</b></div>`}).join('')}
    <div class="hours">${[...Array(H1-H0)].map((_,i)=>`<div>${String(H0+i).padStart(2,'0')}:00</div>`).join('')}</div>
    ${days.map(d=>`<div class="day ${d===t?'today':''}" data-day="${d}">${[...Array(H1-H0)].map((_,i)=>`<div class="slot" data-slot="${d}|${H0+i}"></div>`).join('')}
      ${s.bookings.filter(b=>b.date===d).map(b=>{const a=VA.ac(b.ac);const top=(Math.max(b.start,H0)-H0)*34,ht=Math.max(1,Math.min(b.start+b.dur,H1)-Math.max(b.start,H0))*34-3;
        return `<div class="bk ${b.purpose==='Maintenance'?'mx':''}" style="--c:${a.color};top:${top}px;height:${ht}px" data-bk="${b.id}"><b>${esc(a.tail)} · ${b.start}:00</b>${esc(b.purpose)} · ${esc(VA.person(b.pilot).name.split(' ')[0])}<br><span class="dim">${esc(b.route||'')}</span></div>`}).join('')}</div>`).join('')}
  </div></div>`;
  $$('[data-wk]',el).forEach(b=>b.onclick=()=>{const v=+b.dataset.wk;s.weekOffset=v?(s.weekOffset||0)+v:0;VA.save();VA.route()});
  $('[data-new]',el).onclick=()=>VA.bookingForm({purpose:role()==='mechanic'?'Maintenance':'Trip'});
  $$('[data-slot]',el).forEach(x=>x.onclick=()=>{const [d,h]=x.dataset.slot.split('|');VA.bookingForm({date:d,start:+h,purpose:role()==='mechanic'?'Maintenance':'Trip'})});
  $$('[data-bk]',el).forEach(x=>x.onclick=e=>{e.stopPropagation();bookingDetail(x.dataset.bk)});
  return {title:'Schedule'};
};
function bookingDetail(id){
  const b=S().bookings.find(x=>x.id===id),a=VA.ac(b.ac);
  VA.modal(`${esc(a.tail)} · ${esc(b.purpose)}`,`<div class="list"><div><span class="muted">When</span><br><b>${fmtDate(b.date)} · ${b.start}:00–${b.start+b.dur}:00</b></div><div><span class="muted">Crew</span><br><b>${esc(VA.person(b.pilot).name)}</b></div><div><span class="muted">Route / notes</span><br><b>${esc(b.route||'—')}</b></div></div>`,
   `<button class="btn danger" id="cancelBk">Cancel booking</button><button class="btn" data-close>Close</button>`,m=>{
    $('#cancelBk',m).onclick=()=>{S().bookings=S().bookings.filter(x=>x.id!==id);VA.save();VA.closeModal();VA.toast('Booking cancelled');VA.route()}});
}
VA.bookingForm=function(pre={}){
  const me=VA.me();
  const b={ac:pre.ac||S().aircraft[0].id,pilot:me.id,date:pre.date||todayISO(),start:pre.start||9,dur:2,purpose:pre.purpose||'Trip',route:''};
  if(b.date<todayISO())b.date=todayISO();
  const hrs=[...Array(H1-H0)].map((_,i)=>H0+i);
  VA.modal('New booking',`<form class="form" id="bkf" onsubmit="return false">
    <label class="f full">Aircraft<select name="ac">${acOpts(b.ac)}</select></label>
    <label class="f">Date<input type="date" name="date" value="${b.date}" min="${todayISO()}"></label>
    <label class="f">Purpose<select name="purpose">${['Trip','Owner flight','Training','Maintenance'].map(p=>`<option ${p===b.purpose?'selected':''}>${p}</option>`).join('')}</select></label>
    <label class="f">Start<select name="start">${hrs.map(h=>`<option value="${h}" ${h===b.start?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}</select></label>
    <label class="f">Duration<select name="dur">${[1,2,3,4,5,6,8,10].map(h=>`<option value="${h}" ${h===b.dur?'selected':''}>${h} h</option>`).join('')}</select></label>
    <label class="f full">Pilot / crew<select name="pilot">${pilotOpts(b.pilot)}</select></label>
    <label class="f full">Route / notes<input name="route" placeholder="KM02 → KBNA → KM02"></label>
  </form><div id="bkCheck"></div>`,
  `<button class="btn" data-close>Cancel</button><button class="btn primary" id="bkSave">Book aircraft</button>`,m=>{
    const f=$('#bkf',m);
    const read=()=>({ac:f.ac.value,date:f.date.value,start:+f.start.value,dur:+f.dur.value,purpose:f.purpose.value,pilot:f.pilot.value,route:f.route.value.trim()});
    const check=()=>{const v=read(),r=VA.checkBooking(v),a=VA.ac(v.ac),btn=$('#bkSave',m);
      let h;
      if(r.blocked){h=`<div class="check bad" data-blocked><strong>⛔ Booking blocked — ${esc(a.tail)} can't be scheduled</strong><ul>${r.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="small" style="margin-top:6px">${VA.status(v.ac).code==='bad'?'Fix: an A&P/IA must sign off the item(s) above. Mechanics can still block it for <b>Maintenance</b>.':'Pick another time or aircraft.'}</div></div>`;btn.disabled=true;btn.textContent='Blocked'}
      else{h=`<div class="check ${r.warnings.length?'warn':'ok'}">${r.warnings.length?`<b>Heads up</b><ul>${r.warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`✓ ${esc(a.tail)} is airworthy for ${fmtShort(v.date)} — no conflicts.`}</div>`;btn.disabled=false;btn.textContent='Book aircraft'}
      $('#bkCheck',m).innerHTML=h};
    f.addEventListener('input',check);f.addEventListener('change',check);check();
    $('#bkSave',m).onclick=()=>{const v=read(),r=VA.checkBooking(v);if(r.blocked){VA.toast('Booking blocked: '+esc(r.reasons[0]),'bad');return}
      S().bookings.push({...v,id:uid('b')});
      const wsOff=Math.floor(VA.daysBetween(weekStart(0),v.date)/7);S().weekOffset=wsOff;VA.save();VA.closeModal();
      VA.toast(`✓ ${esc(VA.ac(v.ac).tail)} booked ${fmtShort(v.date)} ${v.start}:00`,'ok');
      if(location.hash.startsWith('#/schedule'))VA.route();else VA.go('schedule')};
  });
};

/* ================= LOG FLIGHT ================= */
V.log=function(el){
  const s=S(),me=VA.me(),pre=VA.query.get('ac')||s.aircraft[0].id;
  el.innerHTML=`<div class="two-col">
   <div class="grid">
    <div class="ff-card"><div class="row"><div class="spacer"><h3>${I.sync.replace('<svg','<svg style="width:18px;height:18px;vertical-align:-3px;color:var(--accent)"')} Auto-import flights</h3><div class="muted small">ForeFlight &amp; Garmin Pilot <span class="demo-n">SIMULATED</span> · hours update every countdown instantly</div></div>
      <button class="btn primary" id="ffBtn">${s.pendingImports.length?`Import ${s.pendingImports.length} new flight${s.pendingImports.length>1?'s':''}`:'Check for new flights'}</button></div></div>
    <div class="card" id="fileImport"><h2>Import a file</h2>
      <div class="drop"><div class="row"><input type="file" id="impFile" accept=".csv,.txt,.jpi,text/csv" style="flex:1;min-width:200px"><span class="small muted">Auto-detects: <b>Garmin SD-card data log</b> (G1000 / NXi / Perspective / G3X CSV), flight-log CSV, due-items CSV, expenses CSV</span></div>
      <div class="row small" style="margin-top:10px;gap:14px"><span class="dim">Templates:</span><a href="javascript:void 0" data-tpl="flights">flights.csv</a><a href="javascript:void 0" data-tpl="due">due-items.csv</a><a href="javascript:void 0" data-tpl="expenses">expenses.csv</a></div></div>
      <div id="impPreview"></div></div>
    <div class="card"><h2>Quick entry</h2><form class="form" id="lf" onsubmit="return false">
      <label class="f">Aircraft<select name="ac">${acOpts(pre)}</select></label>
      <label class="f">Pilot<select name="pilot">${pilotOpts(me.role==='pilot'?me.id:'p_jake')}</select></label>
      <label class="f">Date<input type="date" name="date" value="${todayISO()}" max="${todayISO()}"></label>
      <label class="f">Flight time (h)<input name="hrs" type="number" step="0.1" min="0.1" max="20" placeholder="1.4" inputmode="decimal" required></label>
      <label class="f">From<input name="from" value="KM02" maxlength="4" style="text-transform:uppercase"></label>
      <label class="f">To<input name="to" placeholder="KBNA" maxlength="4" style="text-transform:uppercase"></label>
      <div class="full small muted" id="hobbs"></div>
      <div class="full"><button class="btn primary" id="lfSave" style="width:100%;justify-content:center">${I.log} Log flight</button></div>
    </form></div>
   </div>
   <div class="card"><h2>Recent flights</h2><div class="attn" id="recent"><div class="spinner"></div></div></div>
  </div>`;
  DAL.queryLogs({type:'Flight',limit:10}).then(({rows})=>{const r=$('#recent',el);if(!r)return;r.innerHTML=rows.map(f=>`<a href="#/aircraft/${f.ac}/logbook"><span class="t">${esc(VA.ac(f.ac)?.tail||'?')}</span><span class="n"><div>${esc(f.from)} → ${esc(f.to)}${f.eng?' <span class="chip" style="color:var(--accent)">engine data</span>':''}</div><div class="small dim">${fmtShort(f.date)} · ${esc(VA.person(f.pilot).name)} · ${esc(f.src||'Manual')}</div></span><span class="mono">${h1(f.hrs)} h</span></a>`).join('')||'<div class="empty">No flights yet.</div>'});
  const f=$('#lf',el);
  const hb=()=>{const a=VA.ac(f.ac.value),h=parseFloat(f.hrs.value)||0;$('#hobbs',el).innerHTML=`Total time <span class="mono">${h1(a.tt)}</span> → <span class="mono" style="color:var(--accent)">${h1(a.tt+h)} h</span> · fuel expense auto-created: <span class="mono">${h?money(h*a.gph*a.fuelPrice):'—'}</span>`};
  f.addEventListener('input',hb);hb();
  $('#lfSave',el).onclick=()=>{const h=parseFloat(f.hrs.value);if(!(h>0&&h<=20)){VA.invalid(f.hrs,'Enter flight time in hours, between 0.1 and 20 (e.g. 1.4)');return}
    const fl={ac:f.ac.value,pilot:f.pilot.value,date:f.date.value||todayISO(),from:(f.from.value||'KM02').toUpperCase(),to:(f.to.value||'KM02').toUpperCase(),hrs:Math.round(h*10)/10,src:'Manual'};
    const diff=VA.addFlight(fl);showDiff([{f:fl,diff}])};
  $('#ffBtn',el).onclick=()=>VA.importFlow();
  $$('[data-tpl]',el).forEach(a=>a.onclick=()=>VA.download(`valkyr-${a.dataset.tpl}-template.csv`,VA.TEMPLATES[a.dataset.tpl]));
  $('#impFile',el).onchange=e=>{const file=e.target.files[0];if(file)file.text().then(t=>VA.previewImport(t,file.name,$('#impPreview',el)))};
  if(VA.query.get('csv'))setTimeout(()=>$('#fileImport',el).scrollIntoView({block:'center'}),50);
  return {title:'Log flight'};
};
VA.previewImport=async function(text,name,box){
  const kind=VA.detectFormat(text,name);
  if(kind==='jpi'){box.innerHTML=`<div class="check warn">JPI .JPI files are a binary format (ASCII header + compressed records). Native parsing is planned for production; for now export the flight to CSV from EzTrends. <span class="dim">(Not imported.)</span></div>`;return}
  if(kind==='unknown'){box.innerHTML=`<div class="check bad"><strong>Couldn't detect the format.</strong> Use a template or a Garmin SD-card data log.</div>`;return}
  if(kind==='garmin'){
    let g;try{g=VA.parseGarmin(text)}catch(err){box.innerHTML=`<div class="check bad">${esc(err.message)}</div>`;return}
    const m=VA.mapGarminAircraft(g);
    box.innerHTML=`<div class="check ok" style="color:var(--text)"><b style="color:var(--ok)">Garmin data log detected</b> · ${esc(g.meta.airframe_name||'?')} · system_id <span class="mono">${esc(g.meta.system_id||'?')}</span> · ${g.rows.toLocaleString()} rows (1 Hz) · ${g.columns} columns
      <table class="brk" style="margin-top:8px"><tbody>
      <tr><td>Date · route</td><td>${esc(g.date)} · ${esc(g.from)} → ${esc(g.to)}</td></tr>
      <tr><td>Block out / in</td><td>${esc(g.blockOut||'—')} – ${esc(g.blockIn||'—')} (${h1(g.blockHrs)} h)</td></tr>
      <tr><td>Takeoff / landing</td><td>${esc(g.takeoff||'—')} – ${esc(g.landing||'—')}</td></tr>
      <tr><td>Flight time (airborne)</td><td>${h1(g.flightHrs)} h</td></tr>
      <tr><td>Hobbs-equivalent (engine running)</td><td>${h1(g.hobbs)} h</td></tr>
      ${g.tach!=null?`<tr><td>Tach-equivalent (RPM-weighted, 2700 rpm ref.)</td><td>${h1(g.tach)} h</td></tr>`:''}
      <tr><td>Fuel used (∫ fuel flow)</td><td>${h1(g.fuelGal)} gal</td></tr>
      <tr><td>Engine peaks</td><td class="small">${Object.entries(g.eng).filter(x=>x[1]!=null).map(([k,v])=>`${VA.PARAMS[k][0]} ${v}`).join(' · ')}</td></tr></tbody></table>
      ${g.unverified.length?`<div class="small warn-t" style="margin-top:6px">Unverified column names used: ${g.unverified.map(esc).join(', ')}</div>`:''}
      <div class="row" style="margin-top:10px"><label class="f" style="flex:1">Aircraft <span class="dim">(${esc(m.how)})</span><select id="gAc">${acOpts(m.ac||'')}</select></label></div></div>
      <div class="row" style="margin-top:10px"><span class="spacer small muted">Dedupes against ForeFlight / existing flights (same tail, date, route, ±0.3 h).</span><button class="btn primary" id="gGo">${I.sync} Import flight</button></div>`;
    $('#gGo',box).onclick=async()=>{const ac=$('#gAc',box).value;const r=await VA.importGarmin(g,ac);
      box.innerHTML=`<div class="check ${r.exceedances.length?'warn':'ok'}" data-result="${r.dup?'dup':'new'}">${r.dup?`<b>Duplicate detected</b> — matched an existing ${esc(VA.ac(ac).tail)} flight; engine data attached, no hours or fuel double-counted.`:`<b>Flight created</b> — ${esc(VA.ac(ac).tail)} +${h1(g.flightHrs||g.hobbs)} h, fuel expense ${money(g.fuelGal*VA.ac(ac).fuelPrice)} (${h1(g.fuelGal)} gal).`}
       ${r.exceedances.length?`<br><b class="warn-t">${r.exceedances.length} exceedance${r.exceedances.length>1?'s':''}</b>: ${r.exceedances.map(x=>`${VA.PARAMS[x.k][0]} ${x.v}`).join(', ')} → ${r.exceedances.some(x=>x.l.grounding)?'grounding squawk opened':'squawk draft created for mechanic review'}. <a href="#/squawks?f=draft">Review</a>`:''}</div>`;
      VA.toast(r.dup?'Garmin log matched existing flight (deduped)':'Garmin flight imported','ok');
      const rc=$('#recent');if(rc)DAL.queryLogs({type:'Flight',limit:10}).then(({rows})=>{rc.innerHTML=rows.map(f=>`<a href="#/aircraft/${f.ac}/logbook"><span class="t">${esc(VA.ac(f.ac)?.tail||'?')}</span><span class="n"><div>${esc(f.from)} → ${esc(f.to)}${f.eng?' <span class="chip" style="color:var(--accent)">engine data</span>':''}</div><div class="small dim">${fmtShort(f.date)} · ${esc(f.src||'')}</div></span><span class="mono">${h1(f.hrs)} h</span></a>`).join('')})};
    return;
  }
  const rows=VA.parseCSV(text);const v=VA.validate[kind](rows);
  const label={flights:'Flight log',due:'Due items',expenses:'Expenses'}[kind];
  box.innerHTML=`<div class="check ${v.errors.length?'warn':'ok'}" style="color:var(--text)"><b>${label} CSV</b> · ${v.ok.length.toLocaleString()} valid row${v.ok.length===1?'':'s'}${v.errors.length?` · <span class="warn-t">${v.errors.length} error${v.errors.length>1?'s':''}</span><ul class="small">${v.errors.slice(0,5).map(e=>`<li>${esc(e)}</li>`).join('')}${v.errors.length>5?`<li>…and ${v.errors.length-5} more</li>`:''}</ul>`:''}</div>
   <div class="row" style="margin-top:10px"><span class="spacer"></span><button class="btn primary" id="cGo" ${v.ok.length?'':'disabled'}>Import ${v.ok.length.toLocaleString()} rows</button></div>`;
  $('#cGo',box).onclick=async()=>{const b=$('#cGo',box);b.disabled=true;b.textContent='Importing…';const r=await VA.applyImport(kind,v.ok);VA.lastImport=r;
    box.innerHTML=`<div class="check ok" data-result="csv">✓ ${esc(r.msg)} · ${r.ms.toFixed(0)} ms</div>`;VA.toast('✓ '+esc(r.msg),'ok')};
};
function showDiff(res){
  const rows=res.flatMap(r=>r.diff.map(d=>({...d,tail:VA.ac(r.f.ac).tail})));
  // collapse per item (multiple flights same aircraft)
  const m={};rows.forEach(r=>{if(!m[r.id])m[r.id]={...r};else m[r.id].after=r.after});
  const list=Object.values(m).sort((a,b)=>a.after-b.after).slice(0,6);
  const tot=res.reduce((t,r)=>t+r.f.hrs,0);
  VA.route();
  VA.toast(`✓ ${res.length} flight${res.length>1?'s':''} logged · +${h1(tot)} h`,'ok');
  VA.modal('Countdowns updated',`<p class="muted" style="margin-top:0">${res.length} flight${res.length>1?'s':''} · ${h1(tot)} h added. Every hour-based item recalculated:</p>
   <div class="tbl"><table><tbody>${list.map(d=>`<tr><td class="mono" style="width:80px">${esc(d.tail)}</td><td>${esc(d.name)}</td><td class="diff" style="text-align:right;white-space:nowrap">${h1(d.rem)} <span class="arrow">→</span> <b class="${d.after<0?'bad-t':d.after<=30?'warn-t':''}">${h1(d.after)} h</b></td></tr>`).join('')}</tbody></table></div>`,
   `<button class="btn primary" data-close>Done</button>`);
}
VA.importFlow=function(){
  const s=S();
  VA.modal('Import from ForeFlight / Garmin',`<div id="ffBody"><div class="spinner"></div><p class="muted" style="text-align:center">Syncing logbooks… <span class="demo-n">SIMULATED</span></p></div>`,'',m=>{
    setTimeout(()=>{
      if(!s.pendingImports.length){const a=s.aircraft[Math.floor(Math.random()*3)];const dests=['KBNA','KMQY','KCHA','KSTL','KMEM','KATL','KTYS'];const to=dests[Math.floor(Math.random()*dests.length)];const hrs=Math.round((0.6+Math.random()*1.6)*10)/10;
        s.pendingImports.push({id:uid('i'),ac:a.id,pilot:'p_jake',date:todayISO(),from:'KM02',to,hrs,src:'ForeFlight'},{id:uid('i'),ac:a.id,pilot:'p_jake',date:todayISO(),from:to,to:'KM02',hrs:Math.round((hrs+0.1)*10)/10,src:'ForeFlight'});VA.save()}
      const body=$('#ffBody',m);if(!body)return;
      body.innerHTML=`<p class="muted" style="margin-top:0">Found <b style="color:var(--text)">${s.pendingImports.length} new flights</b> matched to your tail numbers:</p><div class="import-list">${s.pendingImports.map(f=>`<label><input type="checkbox" checked value="${f.id}"><span class="mono" style="font-weight:700;width:70px">${esc(VA.ac(f.ac).tail)}</span><span class="spacer">${esc(f.from)} → ${esc(f.to)}<div class="small dim">${fmtShort(f.date)} · ${esc(VA.person(f.pilot).name)} · ${esc(f.src)}</div></span><b class="mono">${h1(f.hrs)} h</b></label>`).join('')}</div>`;
      const ft=document.createElement('footer');ft.innerHTML=`<button class="btn" data-close>Cancel</button><button class="btn primary" id="ffImport">${I.sync} Import selected</button>`;m.appendChild(ft);
      $('#ffImport',m).onclick=()=>{const ids=$$('.import-list input:checked',m).map(x=>x.value);if(!ids.length){VA.toast('Select at least one flight','bad');return}
        const res=[];ids.forEach(id=>{const f=s.pendingImports.find(x=>x.id===id);res.push({f,diff:VA.addFlight({...f,id:uid('f')})})});
        s.pendingImports=s.pendingImports.filter(x=>!ids.includes(x.id));VA.save();VA.closeModal();showDiff(res)};
    },900);
  });
};

/* ================= SQUAWKS ================= */
VA.squawkItem=function(q){
  const a=VA.ac(q.ac),isMech=role()==='mechanic';
  const draft=q.status==='draft';
  return `<div class="li ${q.status==='open'&&q.grounding?'grounding':''}" data-sq="${q.id}"><div class="icon" style="color:${draft?'var(--accent)':q.status==='open'?(q.grounding?'var(--bad)':'var(--warn)'):q.status==='dismissed'?'var(--dim)':'var(--ok)'}">${draft?I.pulse:q.status==='open'?I.sq:I.check}</div>
   <div class="body"><div class="row" style="gap:8px"><span class="title">${esc(q.title)}</span>${q.grounding&&q.status==='open'?'<span class="pill bad">Grounding</span>':''}${q.status==='resolved'?'<span class="pill ok">Resolved</span>':''}${draft?'<span class="pill plain" style="color:var(--accent);background:var(--accent-soft)">Draft · needs review</span>':''}${q.status==='dismissed'?'<span class="chip">Dismissed</span>':''}</div>
   <div class="meta"><span class="mono">${esc(a?.tail||'?')}</span> · ${q.auto?'auto-detected by':'reported by'} ${esc(VA.person(q.by).name)} · ${fmtDate(q.date)}${q.photo?' · 📷 '+esc(q.photo):''}</div>${q.desc?`<div class="small" style="margin-top:6px">${esc(q.desc)}</div>`:''}
   ${q.status==='resolved'?`<div class="signoff">✓ ${esc(q.fix)}<br><span class="dim">Signed off by ${esc(q.signedBy)}, ${esc(q.cert)} · ${fmtDate(q.fixDate)}</span></div>`:''}</div>
   ${q.status==='open'&&isMech?`<button class="btn ok sm" data-resolve="${q.id}">${I.check} Resolve &amp; sign off</button>`:''}
   ${draft&&isMech?`<div class="row" style="gap:6px;flex-direction:column;align-items:stretch"><button class="btn sm" data-confirm="${q.id}">Confirm squawk</button><button class="btn sm danger" data-confirmg="${q.id}">Confirm + ground</button><button class="btn sm" data-dismiss="${q.id}">Dismiss</button></div>`:''}</div>`;
};
VA.bindSquawkActions=el=>{
  $$('[data-resolve]',el).forEach(b=>b.onclick=()=>resolveForm(b.dataset.resolve));
  const upd=(id,patch,msg,kind='ok')=>{Object.assign(S().squawks.find(x=>x.id===id),patch);VA.save();VA.toast(msg,kind);VA.route()};
  $$('[data-confirm]',el).forEach(b=>b.onclick=()=>upd(b.dataset.confirm,{status:'open',grounding:false,reviewedBy:VA.me().name},'Draft confirmed as open squawk'));
  $$('[data-confirmg]',el).forEach(b=>b.onclick=()=>upd(b.dataset.confirmg,{status:'open',grounding:true,reviewedBy:VA.me().name},'Confirmed — aircraft grounded pending inspection','bad'));
  $$('[data-dismiss]',el).forEach(b=>b.onclick=()=>upd(b.dataset.dismiss,{status:'dismissed',reviewedBy:VA.me().name},'Draft dismissed'));
};
VA.squawkList=function(host,id,data,showAc,tools,init){
  VA.list(host,{id,pageSize:20,placeholder:'Search squawks…',data,init,tools,
    search:(q,s)=>(q.title+' '+(q.desc||'')+' '+(VA.ac(q.ac)?.tail||'')+' '+VA.person(q.by).name).toLowerCase().includes(s),
    filters:[{id:'st',label:'Status',def:'open',opts:[['open','Open'],['draft','Drafts (auto-detected)'],['resolved','Resolved'],['dismissed','Dismissed'],['','All']],test:(q,v)=>q.status===v},
      {id:'g',label:'Grounding',opts:[['','Any severity'],['y','Grounding only'],['n','Non-grounding']],test:(q,v)=>v==='y'?q.grounding:!q.grounding},
      ...(showAc?[{id:'ac',label:'Aircraft',opts:[['','All aircraft'],...S().aircraft.map(a=>[a.id,a.tail])],test:(q,v)=>q.ac===v}]:[])],
    sorts:[['urg','Grounding first',(x,y)=>(y.grounding&&y.status==='open')-(x.grounding&&x.status==='open')||y.date.localeCompare(x.date)],['new','Newest',(x,y)=>y.date.localeCompare(x.date)],['old','Oldest',(x,y)=>x.date.localeCompare(y.date)]],
    render:rs=>`<div class="list">${rs.map(VA.squawkItem).join('')}</div>`,after:VA.bindSquawkActions,empty:'No squawks here. Nice.'});
};
V.squawks=function(el){
  const s=S(),drafts=s.squawks.filter(q=>q.status==='draft').length;
  el.innerHTML=`${role()!=='mechanic'?`<button class="btn primary" id="newSq" style="width:100%;justify-content:center;padding:16px;font-size:15px;margin-bottom:16px">${I.sq} Report a squawk</button>`:`<div class="card row" style="margin-bottom:16px">${I.wrench.replace('<svg','<svg style="width:22px;height:22px;color:var(--accent)"')}<span class="spacer">Resolve a squawk to sign it off. ${drafts?`<b style="color:var(--accent)">${drafts} auto-detected engine exceedance draft${drafts>1?'s':''}</b> await your review.`:''}</span></div>`}
  <div id="sqList"></div>`;
  const f=VA.query.get('f');if(f!=null){const st=VA.listState.squawks;if(st)st.f.st=f;}
  VA.squawkList($('#sqList',el),'squawks',()=>S().squawks,true,'',f!=null?{f:{st:f}}:null);
  const n=$('#newSq',el);if(n)n.onclick=()=>VA.squawkForm();
  if(VA.query.has('new')&&role()!=='mechanic'){history.replaceState(null,'','#/squawks');setTimeout(()=>VA.squawkForm(),50)}
  return {title:'Squawks'};
};
VA.squawkForm=function(acId){
  VA.modal('Report a squawk',`<form class="form" id="sqf" onsubmit="return false">
    <label class="f full">Aircraft<select name="ac">${acOpts(acId||S().aircraft[0].id)}</select></label>
    <label class="f full">What's wrong?<input name="title" placeholder="e.g. Oil on lower cowl after shutdown" maxlength="90"></label>
    <label class="f full">Details<textarea name="desc" placeholder="When, where, conditions…"></textarea></label>
    <label class="f full">Photo (optional)<input type="file" name="photo" accept="image/*" capture="environment"></label>
    <label class="toggle full"><input type="checkbox" name="grounding"><span><b class="bad-t">Grounding — unsafe to fly</b><div class="small muted">Grounds the aircraft and blocks all bookings until an A&amp;P/IA signs it off.</div></span></label>
  </form>`,`<button class="btn" data-close>Cancel</button><button class="btn primary" id="sqSave">Submit squawk</button>`,m=>{
    $('#sqSave',m).onclick=()=>{const f=$('#sqf',m),t=f.title.value.trim();if(!t){VA.invalid(f.title,'Describe the squawk in a few words');return}
      const q={id:uid('s'),ac:f.ac.value,title:t,desc:f.desc.value.trim(),by:VA.me().id,date:todayISO(),grounding:f.grounding.checked,status:'open',photo:f.photo.files[0]?f.photo.files[0].name:''};
      S().squawks.unshift(q);VA.save();VA.closeModal();
      const a=VA.ac(q.ac);
      VA.toast(q.grounding?`⛔ <b>${esc(a.tail)} grounded.</b> Bookings blocked; Dale (IA) notified.`:`Squawk logged on ${esc(a.tail)}. Dale (IA) notified.`,q.grounding?'bad':'ok');VA.route()};
  });
};
const costField=lbl=>`<label class="f" style="margin-top:12px">${lbl} <span class="dim">(optional — adds a line to the expense ledger)</span><input type="number" min="0" step="1" id="costIn" placeholder="$ e.g. 450" inputmode="decimal"></label>`;
function resolveForm(id){
  const q=S().squawks.find(x=>x.id===id),a=VA.ac(q.ac);
  VA.modal('Resolve & sign off',`<p style="margin-top:0"><span class="mono">${esc(a.tail)}</span> · <b>${esc(q.title)}</b></p>
   <form class="form" id="rf" onsubmit="return false"><label class="f full">Corrective action<textarea name="fix" placeholder="Describe work performed, parts, references…"></textarea></label>
   <label class="toggle full"><input type="checkbox" name="cert" style="accent-color:var(--ok)"><span class="small">I certify this work was performed IAW 14 CFR Part 43 and the aircraft is approved for return to service. <b>Dale Prentice, A&amp;P/IA #3412987 (demo)</b></span></label></form>${costField('Labor + parts cost')}`,
   `<button class="btn" data-close>Cancel</button><button class="btn ok" id="rfSave">${I.check} Sign off</button>`,m=>{
    $('#rfSave',m).onclick=()=>{const f=$('#rf',m);if(!f.fix.value.trim()){VA.toast('Enter the corrective action','bad');return}if(!f.cert.checked){VA.toast('Check the certification to sign','bad');return}
      const was=VA.status(q.ac).code;VA.resolveSquawk(id,f.fix.value.trim(),parseFloat($('#costIn',m).value)||0);VA.closeModal();
      const now=VA.status(q.ac);VA.toast(was==='bad'&&now.code!=='bad'?`✓ Signed off. <b>${esc(a.tail)} returned to service.</b>`:`✓ Signed off and logged to ${esc(a.tail)} logbook.`,'ok');VA.route()};
  });
}
VA.signOffForm=function(itemId){
  const it=S().items.find(x=>x.id===itemId),a=VA.ac(it.ac);
  VA.modal('Sign off maintenance item',`<p style="margin-top:0"><span class="mono">${esc(a.tail)}</span> · <b>${esc(it.name)}</b><br><span class="small muted">${esc(it.ref)} · at ${h1(a.tt)} h TT · ${fmtDate(todayISO())}</span></p>
   <label class="toggle"><input type="checkbox" id="soCert" style="accent-color:var(--ok)"><span class="small">Complied with and approved for return to service. Resets the countdown and writes a logbook entry. <b>Dale Prentice, A&amp;P/IA (demo)</b></span></label>${costField('Cost of this work')}`,
   `<button class="btn" data-close>Cancel</button><button class="btn ok" id="soSave">${I.check} Sign off</button>`,m=>{
    $('#soSave',m).onclick=()=>{if(!$('#soCert',m).checked){VA.toast('Check the certification to sign','bad');return}
      const was=VA.status(it.ac).code;VA.signOffItem(itemId,parseFloat($('#costIn',m).value)||0);VA.closeModal();const now=VA.status(it.ac).code;
      VA.toast(was==='bad'&&now!=='bad'?`✓ ${esc(it.name)} signed off. <b>${esc(a.tail)} returned to service.</b>`:`✓ ${esc(it.name)} signed off · countdown reset.`,'ok');VA.route();
      const row=document.querySelector(`[data-item="${itemId}"]`);row&&row.classList.add('flash')};
  });
};
/* ================= COSTS ================= */
function donut(c){const parts=[[c.fuel,'var(--c1)'],[c.mx,'var(--c2)'],[c.other,'#5b6878'],[c.fixed,'var(--c3)']];let off=0;const R=15.9155;
  return `<svg class="donut" viewBox="0 0 42 42"><circle cx="21" cy="21" r="${R}" fill="none" stroke="var(--line)" stroke-width="5"/>${parts.map(([v,col])=>{const p=c.total?v/c.total*100:0;const s=`<circle cx="21" cy="21" r="${R}" fill="none" stroke="${col}" stroke-width="5" stroke-dasharray="${p} ${100-p}" stroke-dashoffset="${25-off}"/>`;off+=p;return s}).join('')}<text x="21" y="20" text-anchor="middle" fill="var(--text)" font-size="6" font-family="ui-monospace,monospace" font-weight="600">${money(c.total)}</text><text x="21" y="26" text-anchor="middle" fill="var(--muted)" font-size="3.4">per hour</text></svg>`}
V.costs=function(el){
  const s=S(),cs=s.aircraft.map(a=>({a,c:VA.costs(a.id)})).sort((x,y)=>y.c.total-x.c.total),max=Math.max(...cs.map(x=>x.c.total),1);
  const tot=cs.reduce((t,x)=>t+x.c.annual,0),hrs=cs.reduce((t,x)=>t+x.c.hrs,0);
  if(VA.query.get('ac'))VA.costAc=VA.query.get('ac');const sel=VA.costAc||cs[0].a.id;const pick=cs.find(x=>x.a.id===sel)||cs[0];
  const seg=(v,t,cls,st)=>`<span class="${cls}" style="width:${t?v/t*100:0}%;${st||''}" title="${money(v)}/hr">${t&&v/t>.14?money(v):''}</span>`;
  el.innerHTML=`<div class="row" style="margin-bottom:14px"><span class="muted spacer">Trailing 12 months, straight from the <a href="#/costs/expenses">expense ledger</a> and logged flight hours.</span>
    <button class="switch ${s.includeDepr?'on':''}" id="deprT"><span class="tr"></span>Include depreciation</button><a class="btn sm" href="#/costs/report">Full cost report →</a></div>
  <div class="stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="stat"><div class="k">Fleet cost · 12 mo</div><div class="v">${money(tot)}</div></div>
    <div class="stat"><div class="k">Hours flown · 12 mo</div><div class="v">${h1(hrs)}</div></div>
    <div class="stat"><div class="k">Blended $/hr</div><div class="v">${money(hrs?tot/hrs:0)}</div></div></div>
  <div class="card"><div class="row" style="margin-bottom:16px"><h2 style="margin:0">True cost per flight hour</h2><span class="spacer"></span><div class="legend"><span style="--c:var(--c1)"><i></i>Fuel</span><span style="--c:var(--c2)"><i></i>Maintenance &amp; reserves</span><span style="--c:#5b6878"><i></i>Fees, catering, travel</span><span style="--c:var(--c3)"><i></i>Fixed</span></div></div>
   <div class="cost-chart" style="${cs.length>12?'max-height:520px;overflow:auto;padding-right:6px':''}">${cs.map(({a,c})=>`<div class="cost-row"><div class="lbl"><a href="#/costs?ac=${a.id}" style="color:var(--text)"><span class="mono" style="font-weight:700">${esc(a.tail)}</span> <span class="muted">${esc(a.short)}</span></a><b>${money(c.total)}/hr</b></div>
     <div class="stack" style="width:${c.total/max*100}%">${seg(c.fuel,c.total,'s-fuel')}${seg(c.mx,c.total,'s-mx')}${seg(c.other,c.total,'','background:#5b6878')}${seg(c.fixed,c.total,'s-fixed')}</div></div>`).join('')}</div></div>
  <div class="card" style="margin-top:16px"><div class="row"><div class="spacer"><div class="row"><span class="tail" style="font-size:18px">${esc(pick.a.tail)}</span>${VA.demoN()}${cs.length>1?`<select id="pickAc" style="width:auto;padding:6px 10px">${cs.map(x=>`<option value="${x.a.id}" ${x===pick?'selected':''}>${esc(x.a.tail)} — ${esc(x.a.short)}</option>`).join('')}</select>`:''}</div><div class="model">${esc(pick.a.short)} · ${h1(pick.c.hrs)} h / 12 mo · ${pick.c.trips} trip days</div></div>${donut(pick.c)}</div>
    <table class="brk" style="margin-top:12px"><tbody>${VA.CATS.filter(c=>pick.c.byCat[c[0]]&&(c[0]!=='depr'||s.includeDepr)).map(c=>`<tr><td><span class="chip">${c[2]==='F'?'Fixed':'Variable'}</span> ${esc(c[1])}</td><td>${money(pick.c.byCat[c[0]])}</td><td>${money(pick.c.byCat[c[0]]/Math.max(1,pick.c.hrs))}/hr</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td><b>${money(pick.c.annual)}</b></td><td><b>${money(pick.c.total)}/hr</b></td></tr></tbody></table></div>
  <p class="small dim" style="margin-top:14px">Demo figures. Every logged/imported flight adds hours and an auto fuel expense, so $/hr updates live.</p>`;
  $('#deprT',el).onclick=()=>{s.includeDepr=!s.includeDepr;VA.save();VA.route()};
  const p=$('#pickAc',el);if(p)p.onchange=()=>{VA.costAc=p.value;history.replaceState(null,'','#/costs');VA.route()};
  return {title:'Costs'};
};
/* ================= PLANS & BILLING ================= */
const TIERS=[
  {id:'heavyjet',name:'Midsize / heavy jets',ex:'Challenger 350, Citation Latitude, Gulfstream',price:399},
  {id:'lightjet',name:'Light jets',ex:'Citation CJ3+, Phenom 300, HondaJet',price:299},
  {id:'turboprop',name:'Turboprops',ex:'King Air 350, Pilatus PC-12, TBM 960',price:249},
  {id:'turbineheli',name:'Turbine helicopters',ex:'Bell 505, Airbus H125 (AS350B3), Bell 407',price:149},
  {id:'heavytwin',name:'Heavy piston twins',ex:'Baron G58, Navajo, Cessna 421',price:149},
  {id:'pistonheli',name:'Piston helicopters',ex:'Robinson R44 II, R22, Enstrom 280',price:49},
  {id:'lighttwin',name:'Light twins',ex:'Seneca, Seminole, DA42',price:49},
  {id:'single',name:'Single-engine pistons',ex:'Cirrus SR22, Bonanza, Cessna 182 · also gyroplanes, gliders, balloons',price:29},
  {id:'experimental',name:'Experimental & warbirds',ex:"$29 flat: homebuilt, racing, exhibition, Limited-category — any engine incl. jets (L-39, T-33, MiG, P-51, RV-10)",price:29}
];
VA.TIERS=TIERS;
VA.fleetPrice=()=>S().aircraft.reduce((t,a)=>t+(TIERS.find(x=>x.id===a.cls)||{price:0}).price,0);
V.plans=function(el){
  const s=S(),fleet=s.aircraft,monthly=VA.fleetPrice(),yearly=monthly*12;
  const calc={};TIERS.forEach(t=>calc[t.id]=fleet.filter(a=>a.cls===t.id).length);
  const lo=7000,hi=20700,scale=hi*1.05,ex3=(249*2+29)*12;
  const feat=['All features on every aircraft','Mechanics always free · unlimited pilots','No setup fees','Month-to-month, cancel anytime'];
  el.innerHTML=`<div class="row" style="margin-bottom:6px"><h2 style="margin:0;font-size:22px;letter-spacing:-.01em;text-transform:none;color:var(--text)">Simple per-aircraft pricing</h2></div>
  <div class="row muted" style="gap:18px;margin-bottom:18px">${feat.map(f=>`<span class="row" style="gap:6px">${I.check.replace('<svg','<svg style="width:15px;height:15px;color:var(--ok)"')}${f}</span>`).join('')}</div>
  <div class="two-col">
   <div class="tbl"><table><thead><tr><th>Aircraft class</th><th class="hide-m">Examples</th><th style="text-align:right">Per aircraft / mo</th></tr></thead><tbody>
     ${TIERS.map(t=>{const n=fleet.filter(a=>a.cls===t.id).length;return `<tr data-tier="${t.id}"><td><b>${t.name}</b>${n?` <span class="chip" style="color:var(--accent);border-color:rgba(0,225,255,.4);margin-left:6px">${n} in your fleet</span>`:''}</td><td class="hide-m small muted">${t.ex}</td><td style="text-align:right"><span class="mono" style="font-size:18px;font-weight:600">$${t.price}</span></td></tr>`}).join('')}
   </tbody></table></div>
   <div class="card" style="border-color:rgba(0,225,255,.45);background:linear-gradient(160deg,rgba(0,225,255,.10),var(--panel) 60%)">
     <h2 style="color:var(--accent)">Your fleet</h2>
     <div class="attn">${fleet.map(a=>{const t=TIERS.find(x=>x.id===a.cls);return `<a href="#/aircraft/${a.id}"><span class="t">${esc(a.tail)}</span><span class="n"><div>${esc(a.short)}</div><div class="small dim">${t.name}</div></span><span class="mono">$${t.price}</span></a>`}).join('')}</div>
     <div style="border-top:1px solid var(--line2);margin-top:6px;padding-top:12px" class="row"><span class="muted">Total</span><span class="spacer"></span><div style="text-align:right"><div><span class="big" id="fleetMo">$${monthly.toLocaleString()}</span><span class="muted">/mo</span></div><div class="small muted mono" id="fleetYr">$${yearly.toLocaleString()}/yr</div></div></div>
     <button class="btn primary" style="width:100%;justify-content:center;margin-top:14px;padding:12px" data-demo>Start month-to-month</button>
   </div>
  </div>
  <div class="two-col" style="margin-top:16px">
   <div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">Price calculator</h2><span class="spacer"></span><button class="btn sm" id="calcReset">Reset to my fleet</button></div>
     <div class="list" id="calc" style="gap:0">${TIERS.map(t=>`<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line);flex-wrap:nowrap"><span class="spacer">${t.name} <span class="dim small mono">$${t.price}</span></span>
       <button class="btn sm" data-dec="${t.id}" aria-label="Remove ${t.name}">−</button><b class="mono" style="width:28px;text-align:center" data-n="${t.id}">${calc[t.id]}</b><button class="btn sm" data-inc="${t.id}" aria-label="Add ${t.name}">+</button></div>`).join('')}</div>
     <div class="row" style="margin-top:14px"><span class="muted" id="calcCount"></span><span class="spacer"></span><div style="text-align:right"><span class="big" id="calcMo"></span><span class="muted">/mo</span><div class="small muted mono" id="calcYr"></div></div></div></div>
   <div class="card"><h2>vs. typical competitor stacks · 3 aircraft / yr</h2>
     <div class="cost-row"><div class="lbl"><span>Valkyr360 · 3 aircraft (2 turboprops + 1 single)</span><b class="ok-t">${money(ex3)}</b></div><div class="stack" style="width:${ex3/scale*100}%"><span class="s-fuel" style="width:100%"></span></div></div>
     <div class="cost-row" style="margin-top:12px"><div class="lbl"><span>Maintenance tracker + scheduling tool</span><b>${money(lo)}–${money(hi)}</b></div>
       <div class="stack" style="width:${hi/scale*100}%;background:transparent"><span style="width:${lo/hi*100}%;background:var(--dim)"></span><span style="width:${(1-lo/hi)*100}%;background:repeating-linear-gradient(135deg,var(--line2) 0 5px,var(--line) 5px 10px)"></span></div></div>
     <p class="small dim" style="margin:12px 0 0">Range from the competitive teardown (separate maintenance-tracking and scheduling subscriptions, often plus setup fees). Save up to ${money(hi-ex3)} a year, with nothing paid for mechanic seats.</p></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>Billing</h2><div class="row" style="gap:28px">
    <div><div class="small muted">Plan</div><b>Per aircraft, by class</b></div><div><div class="small muted">Aircraft</div><b>${fleet.length}</b></div><div><div class="small muted">Monthly</div><b class="mono">$${monthly.toLocaleString()}</b></div><div><div class="small muted">Users</div><b>${s.people.length} (mechanics free)</b></div><div><div class="small muted">Setup fee</div><b>$0</b></div><div><div class="small muted">Term</div><b>Month-to-month</b></div><span class="spacer"></span><span class="demo-n">DEMO · BILLING NOT CONNECTED</span></div></div>`;
  const upd=()=>{const mo=TIERS.reduce((t,x)=>t+calc[x.id]*x.price,0),n=Object.values(calc).reduce((a,b)=>a+b,0);
    TIERS.forEach(t=>$(`[data-n="${t.id}"]`,el).textContent=calc[t.id]);
    $('#calcMo',el).textContent='$'+mo.toLocaleString();$('#calcYr',el).textContent='$'+(mo*12).toLocaleString()+'/yr';$('#calcCount',el).textContent=n+' aircraft'};
  $$('[data-inc]',el).forEach(b=>b.onclick=()=>{calc[b.dataset.inc]++;upd()});
  $$('[data-dec]',el).forEach(b=>b.onclick=()=>{if(calc[b.dataset.dec]>0)calc[b.dataset.dec]--;upd()});
  $('#calcReset',el).onclick=()=>{TIERS.forEach(t=>calc[t.id]=fleet.filter(a=>a.cls===t.id).length);upd()};
  upd();
  $$('[data-demo]',el).forEach(b=>b.onclick=()=>VA.toast('Demo prototype — billing is not connected.'));
  return {title:'Plans & billing'};
};
})();
