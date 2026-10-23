/* Valkyr Aero — Settings › Data sources (FAA registry versioning, updates, change review, unmapped types, AD feed, audit log) */
(function(){
const {esc,todayISO}=VA;const V=VA.views;const $=(s,el)=>(el||document).querySelector(s);const $$=(s,el)=>[...(el||document).querySelectorAll(s)];
const S=()=>VA.state();
const when=s=>s?new Date(s).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}):'—';
const loadScript=src=>new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Could not load '+src));document.head.appendChild(s)});
V.settings=function(el){
  const F=VA.faa,M=F.manifest,f=F.st();f.reviews.sort((a,b)=>(a.status==='open'?0:1)-(b.status==='open'?0:1)||(a.kind==='registry'?0:1)-(b.kind==='registry'?0:1));const open=F.openReviews();const pend=f.unmapped.filter(u=>u.status==='pending');
  el.innerHTML=`<div class="row" style="margin-bottom:6px"><h2 style="margin:0;font-size:22px;text-transform:none;color:var(--text)">Data sources</h2><span class="demo-n">DEMO</span></div>
  <p class="muted" style="margin-top:4px">Reference data Valkyr keeps in sync. Your own aircraft data is never overwritten — registry changes to fleet aircraft come to you as reviews.</p>
  <div class="two-col">
   <div class="card" id="dsFaa"><div class="row"><b style="font-size:15px" class="spacer">FAA Aircraft Registry</b><span class="pill ${open.length?'warn':'ok'}">${open.length?open.length+' to review':'Up to date'}</span></div>
    <table class="brk" style="margin-top:10px"><tbody>
     <tr><td>Dataset version</td><td class="mono" id="dsVer">${esc(f.version)}${f.version!==M.version?` <span class="small dim">(bundled ${esc(M.version)})</span>`:''}</td></tr>
     <tr><td>Source file hash</td><td class="mono small" title="${esc(f.zipSha256||'')}">${esc((f.zipSha256||'—').slice(0,16))}…</td></tr>
     <tr><td>Last synced</td><td id="dsSync">${when(f.lastSync)}</td></tr><tr><td>Last checked</td><td id="dsCheck">${when(f.lastCheck)}</td></tr>
     <tr><td>Records</td><td>${(M.counts.types||0).toLocaleString()} types · ${(M.counts.engines||0).toLocaleString()} engines · ${(M.counts.registrations||0).toLocaleString()} registrations</td></tr>
     <tr><td>Record keys</td><td class="small">ACFTREF: MFR-MDL-SERIES code · MASTER: N-number + serial</td></tr>
     <tr><td>Refresh</td><td class="small">FAA publishes daily · production syncs nightly server-side</td></tr>
     <tr><td>Source</td><td class="small"><span class="mono">registry.faa.gov/database/ReleasableAircraft.zip</span></td></tr></tbody></table>
    <div class="row" style="margin-top:12px;flex-wrap:wrap;gap:8px"><button class="btn primary" id="faaCheck">Check for updates</button>
     <label class="btn" style="cursor:pointer">Load update file<input type="file" id="faaFile" accept=".json,.zip" hidden></label>
     <button class="btn" id="faaSample">Apply sample update <span class="chip">SIMULATED</span></button>
     <button class="btn ghost" id="faaRollback" ${f.history.length?'':'disabled'}>Roll back last update</button></div>
    <div id="faaMsg" class="small" style="margin-top:10px"></div></div>
   <div class="card"><div class="row"><b style="font-size:15px" class="spacer">Airworthiness Directives feed</b><span class="pill plain" style="color:var(--muted)">Simulated in prototype</span></div>
    <p class="small muted">Production: FAA Dynamic Regulatory System (DRS) AD collection + Federal Register AD rules, ingested nightly. New, revised and superseding ADs are matched to each aircraft's make/model/serial, engines, propellers and appliances and become <b>“New AD applicability — review”</b> items for the IA. Compliance is never auto-marked.</p>
    <table class="brk"><tbody><tr><td>Last AD sync</td><td>${when(f.adSync)}</td></tr><tr><td>Open AD reviews</td><td>${open.filter(r=>r.kind==='ad').length}</td></tr></tbody></table></div>
  </div>
  <h3 class="section-h">Change review <span class="muted small">${open.length} open</span></h3>
  <div id="revList">${f.reviews.length?`<div class="tbl"><div class="tbl-scroll"><table><thead><tr><th>Aircraft</th><th>Change</th><th class="hide-m">Version</th><th>Status</th><th></th></tr></thead><tbody>${f.reviews.slice(0,60).map(r=>`<tr><td class="mono">${esc(r.tail)}</td><td>${esc(r.title)}${r.flags.length?`<div class="small ${r.kind==='ad'?'muted':'warn-t'}">${esc(r.flags[0])}</div>`:''}</td><td class="hide-m mono small">${esc(r.version||'')}${r.simulated?' <span class="chip">SIMULATED</span>':''}</td><td><span class="pill ${r.status==='open'?'warn':r.status==='accepted'?'ok':'plain'}">${r.status}</span></td><td><button class="btn sm" data-rev="${r.id}">${r.status==='open'?'Review':'View'}</button></td></tr>`).join('')}</tbody></table></div></div>`:'<div class="empty">No registry changes to review.</div>'}</div>
  <h3 class="section-h">Unmapped aircraft types <span class="muted small">${pend.length} pending admin review</span></h3>
  <div id="unmList">${f.unmapped.length?`<div class="tbl"><div class="tbl-scroll"><table id="unmT"><thead><tr><th>Code</th><th>Make / model</th><th>Best-guess tier</th><th></th></tr></thead><tbody>${f.unmapped.map(u=>`<tr><td class="mono">${esc(u.code)}</td><td>${esc(u.mfr)} ${esc(u.model)}${u.flags&&u.flags.length?`<div class="small dim">${esc(u.flags[0])}</div>`:''}</td><td>${u.status==='pending'?`<select data-tier="${u.code}">${VA.TIERS.map(t=>`<option value="${t.id}" ${t.id===u.guess?'selected':''}>${esc(t.name)} · $${t.price}${t.id===u.guess?' (guess)':''}</option>`).join('')}</select>`:`<span class="pill ok">${esc((VA.TIERS.find(t=>t.id===u.tier)||{}).name||u.tier)}</span>`}</td><td>${u.status==='pending'?`<button class="btn sm" data-map="${u.code}">Confirm</button>`:''}</td></tr>`).join('')}</tbody></table></div></div>`:'<div class="empty">New FAA model codes land here with a best-guess tier. Existing mappings stay pinned.</div>'}</div>
  <h3 class="section-h">Change log & audit</h3>
  <div id="faaLog" class="card small mono" style="max-height:260px;overflow:auto">${f.log.length?f.log.slice(0,80).map(l=>`<div style="padding:3px 0;border-bottom:1px solid var(--line)"><span class="dim">${esc(l.at.replace('T',' ').slice(0,19))}</span> · <b>${esc(l.kind)}</b> · ${esc(l.text)}</div>`).join(''):'<span class="dim">No changes yet. Bundled version '+esc(M.version)+'.</span>'}</div>`;
  const msg=(t,cls)=>{$('#faaMsg',el).innerHTML=`<div class="check ${cls||''}" style="color:var(--text)">${t}</div>`};
  const after=r=>{VA.lastFaaResult=r;VA.route();setTimeout(()=>{const m=document.getElementById('faaMsg');if(m)m.innerHTML=`<div class="check ${r.ok===false?'warn':'ok'}" style="color:var(--text)">${esc(r.msg||'')}${r.res&&r.res.reviews?` · ${r.res.reviews.length} review(s) created`:''}</div>`},30)};
  $('#faaCheck',el).onclick=async()=>{msg('<div class="spinner"></div> Contacting registry.faa.gov…');const r=await F.checkOnline();VA.lastFaaCheck=r;after(r)};
  $('#faaFile',el).onchange=async e=>{const file=e.target.files[0];if(!file)return;msg('<div class="spinner"></div> Reading '+esc(file.name)+'…');try{after(await F.loadFile(file))}catch(err){msg('Could not apply: '+esc(err.message),'bad')}};
  $('#faaSample',el).onclick=async()=>{try{if(!window.FAA_SAMPLE_UPDATE)await loadScript('data/faa-update-SIMULATED.js');const res=await F.applyDelta(window.FAA_SAMPLE_UPDATE,{source:'SIMULATED sample update'});
      after({ok:!res.skipped,res,msg:res.skipped?res.reason:`Applied SIMULATED update ${res.version}: ${res.types.added} new / ${res.types.changed} changed types, ${res.master.changed+res.master.removed} registration change(s), ${res.ads.matched} AD applicability item(s).`});
      if(!res.skipped)VA.toast(`${res.reviews.length} FAA change(s) need review`,'warn')}catch(err){msg('Could not apply: '+esc(err.message),'bad')}};
  $('#faaRollback',el).onclick=async()=>{if(!confirm('Roll back the most recent FAA update?'))return;const h=await F.rollback();after({ok:true,msg:h?`Rolled back ${h.version} → ${h.prevVersion}.`:'Nothing to roll back.'})};
  $$('[data-rev]',el).forEach(b=>b.onclick=()=>VA.reviewModal(b.dataset.rev));
  $$('[data-map]',el).forEach(b=>b.onclick=()=>{const code=b.dataset.map;F.mapType(code,$(`select[data-tier="${code}"]`,el).value);VA.toast('Mapping saved','ok');VA.route()});
  if(VA.query&&VA.query.get('review'))VA.reviewModal(VA.query.get('review'));
};
VA.reviewModal=function(id){const F=VA.faa;const rv=F.st().reviews.find(r=>r.id===id);if(!rv)return;const a=VA.ac(rv.ac)||{};const ad=rv.kind==='ad';
  VA.modal(rv.title,`${rv.simulated?'<div class="small" style="margin-bottom:8px"><span class="chip">SIMULATED</span> sample update — not real FAA data</div>':''}
   ${rv.flags.map(x=>`<div class="check ${ad?'':'warn'}" style="color:var(--text);margin-bottom:6px">${esc(x)}</div>`).join('')}
   <div class="tbl" id="revDiff"><div class="tbl-scroll"><table><thead><tr><th>Field</th><th>${ad?'Was':'Your record (current)'}</th><th>${ad?'AD feed':'FAA registry (new)'}</th></tr></thead><tbody>
   ${rv.fields.map(z=>`<tr><td>${esc(z.label)}</td><td class="mono" style="color:var(--muted)${ad?'':';text-decoration:line-through'}">${esc(ad?z.old||'—':F.fmtField(z.k,z.old))}</td><td class="mono" style="color:var(--accent)">${esc(ad?z.new:F.fmtField(z.k,z.new))}</td></tr>`).join('')}</tbody></table></div></div>
   ${ad?'':`<p class="small muted" style="margin-top:10px">Accept copies these FAA-sourced fields into ${esc(a.tail||'')}'s registry snapshot. Your entered model name, serial, year, hours, tier and inspection template are not changed.</p>`}
   ${rv.status!=='open'?`<p class="small">Decision: <b>${esc(rv.status)}</b> ${rv.decidedAt?'· '+esc(new Date(rv.decidedAt).toLocaleString()):''}</p>`:''}`,
   rv.status==='open'?`<button class="btn" data-close>Later</button><button class="btn" id="revIgnore">${ad?'Not applicable':'Ignore'}</button><button class="btn primary" id="revAccept">${ad?'Acknowledge — IA to review':'Accept FAA change'}</button>`:'<button class="btn" data-close>Close</button>',
   m=>{const a2=$('#revAccept',m),i2=$('#revIgnore',m);const done=acc=>{F.decide(id,acc);VA.closeModal();VA.toast(acc?'Change accepted':'Change ignored','ok');VA.route()};if(a2)a2.onclick=()=>done(true);if(i2)i2.onclick=()=>done(false)})};
VA.faaBanner=()=>{const s0=S();if(!VA.faa||!s0||!['owner','mechanic'].includes(s0.role))return '';const n=VA.faa.openReviews().length;return n?`<a class="check warn" href="#/settings" style="display:block;color:var(--text);margin-bottom:12px;text-decoration:none"><b>${n} FAA registry / AD change${n>1?'s':''} need review</b> — open Settings › Data sources</a>`:''};
})();
