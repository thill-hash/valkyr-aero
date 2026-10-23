/* Valkyr360 — DEMO billing (processor-neutral) + per-account fleets.
   The fleet IS the plan: billing lines are derived from the active aircraft in the account's own IndexedDB scope.
   Adding an aircraft anywhere (sign-up, Add aircraft, Billing) adds it to the fleet and the bill; archiving removes it
   from both with a proration note. No card data is collected. Production: ARCHITECTURE.md §16. */
(function(){
const {$,$$,esc}=VA;const A=VA.auth;
const CONFIG=VA.BILLING_CONFIG={trialDays:14,currency:'USD',invoicePrefix:'VA-DEMO-',termsVersion:'2026-10-23'}; /* placeholders */
const KEY='va.billing';
const tiers=()=>VA.TIERS;
const tierOf=id=>tiers().find(t=>t.id===id)||tiers().find(t=>t.id==='single');
const TURBINE=new Set(['heavyjet','lightjet','turboprop','turbineheli']);
const money2=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const money0=n=>'$'+Math.round(n).toLocaleString('en-US');
const iso=d=>d.toISOString().slice(0,10);
const addD=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const addM=(s,n)=>{const d=new Date(s+'T12:00:00Z');const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return iso(d)};
const today=()=>VA.todayISO();
const days=(a,b)=>Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/864e5);
const fmtDate=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const all=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return {}}};
const put=(uid,sub)=>{const a=all();a[uid]=sub;localStorage.setItem(KEY,JSON.stringify(a))};
/* billing lines = active fleet (no cap on count) */
const lines=()=>{const S=VA.state();return S?S.aircraft.map(a=>({id:a.id,tail:a.tail,model:a.model||a.short||'',tier:a.cls})):[]};
const total=()=>lines().reduce((t,i)=>t+tierOf(i.tier).price,0);
VA.isAccount=()=>!!(A&&A.scope()!=='valkyr-aero');

function invoiceFor(n,date,items){const ls=items.map(i=>({desc:`${i.tail} · ${tierOf(i.tier).name}`,amount:tierOf(i.tier).price}));
  return {id:CONFIG.invoicePrefix+date.replace(/-/g,'')+'-'+String(n).padStart(3,'0'),date,period:`${fmtDate(date)} – ${fmtDate(addD(addM(date,1),-1))}`,lines:ls,amount:ls.reduce((t,l)=>t+l.amount,0),status:'paid'}}
function demoSub(){const t=today();const start=addM(t,-6);
  const sub={uid:'demo',status:'active',created:start,trialEnds:addD(start,CONFIG.trialDays),anchor:addD(start,CONFIG.trialDays),payment:{label:'Demo payment method',updated:start},invoices:[],adjustments:[],demo:true};
  let d=sub.anchor,n=1;const items=lines();while(d<=t){sub.invoices.unshift(invoiceFor(n++,d,items));d=addM(d,1)}return sub}
function cycle(sub){const t=today();if(t<sub.trialEnds)return {start:sub.created,next:sub.trialEnds,trial:true};
  let d=sub.anchor;while(addM(d,1)<=t)d=addM(d,1);return {start:d,next:addM(d,1),trial:false}}
function prorate(sub,price){const c=cycle(sub);const left=days(today(),c.next),len=days(c.start,c.next);
  return c.trial?{trial:true,amount:0,left,cycleDays:len}:{trial:false,amount:Math.round(price*left/len*100)/100,left,cycleDays:len}}
const B=VA.billing={CONFIG,tierOf,total,lines,cycle,prorate,money2,demoSub,all,put,fmtDate,addD,addM,
  get(){const s=A.session();if(!s)return null;const a=all();let sub=a[s.uid];if(!sub&&s.demo){sub=demoSub();put('demo',sub)}
    if(sub&&sub.status==='canceling'&&today()>=sub.cancelAt){sub.status='canceled';put(sub.uid,sub)}return sub||null},
  save(sub){put(sub.uid,sub)},
  start(uid,items){const t=today();const sub={uid,status:'active',created:t,trialEnds:addD(t,CONFIG.trialDays),anchor:addD(t,CONFIG.trialDays),
    signup:items,payment:{label:'Demo payment method',updated:t},invoices:[],adjustments:[],checkout:{ref:'DEMO-CHK-'+Date.now().toString(36).toUpperCase(),at:new Date().toISOString(),charged:0}};put(uid,sub);return sub},
  /* proration notes for fleet changes */
  noteAdd(a){const sub=B.get();if(!sub)return '';const p=prorate(sub,tierOf(a.cls).price);
    if(p.trial)return `${a.tail} added · new total ${money0(total())}/mo · no proration during trial`;
    sub.adjustments.push({date:today(),desc:`${a.tail} added (${p.left}/${p.cycleDays} days)`,amount:p.amount});B.save(sub);
    return `${a.tail} added · new total ${money0(total())}/mo · prorated ${money2(p.amount)} on next invoice`},
  noteRemove(a){const sub=B.get();if(!sub)return '';const p=prorate(sub,tierOf(a.cls).price);
    if(p.trial)return `${a.tail} removed · new total ${money0(total())}/mo · no proration during trial`;
    sub.adjustments.push({date:today(),desc:`${a.tail} removed (${p.left}/${p.cycleDays} days unused)`,amount:-p.amount});B.save(sub);
    return `${a.tail} removed · new total ${money0(total())}/mo · prorated credit ${money2(p.amount)} on next invoice`},
  previewRemove(a){const sub=B.get();if(!sub)return '';const p=prorate(sub,tierOf(a.cls).price);return p.trial?'No proration during trial.':`Prorated credit: ${money2(p.amount)} (${p.left} unused days) on next invoice.`},
  readOnly(){const ss=A.session();if(ss&&ss.impersonatedBy)return true;const s=B.get();return !!(s&&(s.status==='canceled'||s.status==='suspended'))},
  async lookup(n){const r=await VA.types.lookupN(n);if(r.error)return {error:r.error};if(r.notFound)return {notFound:true,tail:r.n};
    if(!r.type)return {notFound:true,tail:r.n};
    const c=VA.types.classify(r.type,r);return {item:{tail:r.n,model:`${r.type.mfr} ${r.type.model}`.trim(),year:r.year||'',tier:c.tier,code:r.code,flags:c.flags||[]},type:r.type,reg:r}}
};

/* ---------- one way to add / archive aircraft (fleet + billing) ---------- */
function manualType(model,tier){const tb=TURBINE.has(tier);return {code:'',mfr:'',model:model||'Aircraft',typeAcft:/heli/.test(tier)?'6':'4',typeEng:tb?(tier==='turboprop'||tier==='turbineheli'?'5':'4'):'1',noEng:/twin/.test(tier)?2:1,seats:4,wclass:'1',cert:'0'}}
VA.addAircraft=function({type,reg,tail,tier,model,year,serial,tt=0}){
  const S=VA.state();tail=String(tail||'').toUpperCase().trim();
  if(!/^N[1-9][0-9A-Z]{0,4}$/.test(tail))return {error:'Enter a US N-number like N172SP'};
  if(S.aircraft.some(a=>a.tail===tail))return {error:`${tail} is already in your fleet`};
  if(!type)type=manualType(model,tier);if(reg&&reg.notFound)reg=null;
  const c=VA.types.classify(type,reg);if(tier&&!type.code)c.tier=tier;if(!c.kind||!type.code)c.kind=TURBINE.has(c.tier)?'turbine':'piston';
  const av=VA.types.avionicsGuess?VA.types.avionicsGuess(type,reg&&reg.year):{suite:''};const id=VA.uid('ac');
  const a={id,tail,cls:c.tier,kind:c.kind,model:model||`${type.mfr} ${type.model}`.trim(),short:type.model,year:+(year||reg&&reg.year)||'',serial:serial||(reg&&reg.serial)||'',
    engines:reg&&reg.eng?`${type.noEng} × ${reg.eng.mfr} ${reg.eng.model}`:`${type.noEng} engine${type.noEng>1?'s':''}`,color:`hsl(${Math.floor(Math.random()*360)} 85% 62%)`,
    tt:+tt||0,hrs12:0,fuel:c.kind==='turbine'?'Jet A':'100LL',gph:c.kind==='turbine'?60:12,fuelPrice:c.kind==='turbine'?6.10:6.75,fixedAnnual:{},base:'',
    faa:{code:type.code,mfr:type.mfr,model:type.model,engCode:reg&&reg.engCode,modeSHex:reg&&reg.modeSHex},avionics:av.suite,baselineVerified:null,
    reg:reg?{n:reg.n,serial:reg.serial,code:reg.code,engCode:reg.engCode,year:reg.year,status:reg.status,certIssue:VA.types.fmtYMD(reg.certIssue)||reg.certIssue,expiration:VA.types.fmtYMD(reg.expiration)||reg.expiration,registrantType:reg.registrantType,certification:reg.certification,modeSHex:reg.modeSHex,src:'FAA registry '+((VA.faa&&VA.faa.st().version)||'')}:null};
  if(VA.faa&&type.code&&!VA.faa.st().tierMap[type.code])VA.faa.st().tierMap[type.code]={tier:c.tier,by:'pinned when added',at:today()};
  S.aircraft.push(a);
  (c.program||[]).forEach(p=>S.items.push({id:VA.uid('m'),ac:id,cat:p.cat,name:p.name,ref:p.ref,intHrs:p.intHrs||null,intMo:p.intMo||null,lastHrs:p.intHrs?a.tt:null,lastDate:p.intMo?today():null,required:p.required!==false,verified:null,template:true}));
  if(a.reg&&a.reg.expiration){const it=S.items.find(i=>i.ac===id&&i.name==='Aircraft registration renewal');if(it){it.lastDate=null;it.targetDate=a.reg.expiration;it.intMo=null;it.required=true}
    if(VA.faa)try{VA.faa.regItem(a,{expiration:a.reg.expiration,version:VA.faa.st().version})}catch(e){}}
  VA.dirty();VA.save();return {a,program:c.program||[],note:B.noteAdd(a)};
};
/* archive = remove from fleet + billing; history (logbook, expenses, items, docs) is kept in S.archived */
VA.archiveAircraft=function(id,opts={}){const S=VA.state();const a=S.aircraft.find(x=>x.id===id);if(!a)return {};
  if(S.aircraft.length<=1)return {error:'Keep at least one aircraft. To stop billing, cancel the subscription.'};
  const pick=k=>{const keep=[],out=[];(S[k]||[]).forEach(x=>(x.ac===id?out:keep).push(x));S[k]=keep;return out};
  const bundle={aircraft:{...a,archived:today()},items:pick('items'),squawks:pick('squawks'),bookings:pick('bookings'),docs:pick('docs')};
  S.aircraft=S.aircraft.filter(x=>x!==a);(S.archived=S.archived||[]).push(bundle);VA.dirty();VA.save();return {note:B.noteRemove(a)}};
VA.confirmArchive=function(id,after){const a=VA.ac(id);if(!a)return;const S=VA.state();
  if(S.aircraft.length<=1){VA.toast('Keep at least one aircraft. To stop billing, cancel the subscription.','bad');return}
  VA.modal(`Archive ${a.tail}?`,`<p style="margin-top:0">Removes ${esc(a.tail)} from the fleet and billing (−$${tierOf(a.cls).price}/mo). Records are kept.</p><p class="small dim">${esc(B.previewRemove(a))}</p>`,
    `<button class="btn" data-close>Cancel</button><button class="btn danger" id="arcGo">Archive</button>`,m=>{$('#arcGo',m.parentElement).onclick=()=>{const r=VA.archiveAircraft(id);VA.closeModal();if(r.error)return VA.toast(esc(r.error),'bad');B.lastNote=r.note;VA.toast(esc(r.note),'ok');after?after(r):VA.route()}})};

/* ---------- account scope: seed own fleet from sign-up ---------- */
VA.seedAccount=async function(){const s=A.session()||{};const sub=all()[s.uid]||{};
  const S={v:2,account:true,org:s.org||'',avionics:[],deviceMap:{},limits:{},seeded:today(),role:s.role||'owner',
    people:[{id:'p_owner',name:s.name||'Owner',role:'owner',title:'Owner',initials:s.initials||'O'},{id:'p_pilot',name:'Pilot (invite)',role:'pilot',title:'Pilot',initials:'P'},{id:'p_mech',name:'Mechanic (invite)',role:'mechanic',title:'A&P / IA',initials:'M'}],
    aircraft:[],items:[],squawks:[],flights:[],pendingImports:[],docs:[],mxSpend:{},bookings:[],weekOffset:0,archived:[]};
  VA.setState(S);await DAL.clearAll();
  for(const it of (sub.signup||[])){let type=null,reg=null;
    if(!it.manual){try{const r=await VA.types.lookupN(it.tail);if(r&&r.type){type=r.type;reg=r}}catch(e){}}
    VA.addAircraft({type,reg,tail:it.tail,tier:it.tier,model:type?null:it.model});}
  await VA.flush();
};
VA.syncSide=function(){const acct=VA.isAccount();const f=$('.side-foot');if(!f)return;const ss=A.session()||{};const noDemoTools=acct||ss.platform||ss.impersonatedBy;
  f.querySelector('p').textContent=acct?(VA.state().org||''):'Fictitious aircraft, N-numbers, ADs and people. Base: KM02 Dickson County, TN.';
  f.querySelector('.demo-tag').textContent=acct?'DEMO ACCOUNT':'DEMO DATA';$('#largeBtn').style.display=noDemoTools?'none':'';$('#resetBtn').style.display=noDemoTools?'none':''};

/* ---------- read-only after cancellation ---------- */
const RO_OK='a[href],[data-ro-ok],[data-lc],[data-tab],[data-close],#roles button,#whoBtn,.um-item,.tabs a,#moreTab,select,input[type=search]';
document.addEventListener('click',e=>{if(!VA.ready||!B.readOnly())return;const t=e.target.closest('button,label.btn,[data-book],input[type=checkbox],input[type=file]');if(!t||!t.closest('#view,#modalRoot,.side-foot'))return;if(t.closest(RO_OK))return;
  e.preventDefault();e.stopImmediatePropagation();VA.toast('Read-only: subscription ended. <a href="#/settings">Settings</a>','bad')},true);
document.addEventListener('submit',e=>{if(VA.ready&&B.readOnly()&&e.target.closest('#view,#modalRoot')){e.preventDefault();e.stopImmediatePropagation();VA.toast('Read-only: subscription ended','bad')}},true);
VA.afterRoute=function(v,view){const ss=A.session();VA.syncSide&&VA.syncSide();
  if(ss&&ss.impersonatedBy){v.insertAdjacentHTML('afterbegin',`<div class="ro-banner imp no-print" role="status" id="impBanner"><b>Operator view · read-only</b> · ${esc(ss.org||'')} · as ${esc(ss.impersonatedBy)}<span class="spacer"></span><button class="btn sm" data-ro-ok id="impExit">Exit</button></div>`);$('#impExit',v).onclick=()=>A.exitImpersonation();return}
  const sub=ss&&!ss.platform&&B.get();if(!sub)return;
  if(sub.status==='suspended'){v.insertAdjacentHTML('afterbegin',`<div class="ro-banner no-print" role="status" id="roBanner"><b>Read-only</b> · account suspended <span class="spacer"></span><button class="btn sm" data-ro-ok data-export>Export data</button></div>`);const ex=v.querySelector('[data-export]');if(ex)ex.onclick=()=>VA.exportAll();return}
  if(sub.status==='canceled')v.insertAdjacentHTML('afterbegin',`<div class="ro-banner no-print" role="status" id="roBanner"><b>Read-only</b> · subscription ended ${fmtDate(sub.cancelAt)} <span class="spacer"></span><button class="btn sm" data-ro-ok data-export>Export data</button>${S_owner()?'<a class="btn sm" href="#/settings">Settings</a>':''}</div>`);
  else if(sub.status==='canceling'&&view!=='settings')v.insertAdjacentHTML('afterbegin',`<div class="ro-banner warn no-print" role="status">Subscription ends ${fmtDate(sub.cancelAt)} <span class="spacer"></span>${S_owner()?'<a class="btn sm" href="#/settings">Settings</a>':''}</div>`);
  const ex=v.querySelector('[data-export]');if(ex)ex.onclick=()=>VA.exportAll()};
const S_owner=()=>VA.state().role==='owner';
VA.exportAll=async function(){const S=VA.state();const logs=(await DAL.queryLogs({offset:0,limit:1e7})).rows;const exp=(await DAL.queryExpenses({offset:0,limit:1e7})).rows;
  const data={exported:new Date().toISOString(),org:S.org||'DEMO',state:S,logbook:logs,expenses:exp};const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  VA.lastExport={bytes:blob.size,logs:logs.length,expenses:exp.length};const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`valkyr360-export-${today()}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);VA.toast('Export downloaded','ok')};

/* ---------- shared N-number adder ---------- */
const tierSel=(name,sel)=>`<select name="${name}" aria-label="Tier">${tiers().map(t=>`<option value="${t.id}" ${t.id===sel?'selected':''}>${esc(t.name)} · $${t.price}</option>`).join('')}</select>`;
function adder(host,onAdd){
  host.innerHTML=`<form class="bill-add" novalidate><span class="row" style="flex-wrap:nowrap;gap:8px"><input name="n" placeholder="N-number" aria-label="N-number" autocomplete="off" autocapitalize="characters" spellcheck="false" style="font-family:var(--mono);text-transform:uppercase"><button class="btn" type="submit" data-look>Add</button></span><div class="bill-msg" aria-live="polite"></div></form>`;
  const f=$('form',host),msg=$('.bill-msg',host),btn=$('[data-look]',host);
  f.onsubmit=async e=>{e.preventDefault();const n=f.n.value.trim();if(!n)return VA.invalid(f.n,'Enter an N-number');
    btn.disabled=true;btn.innerHTML='<span class="btn-spin" aria-hidden="true"></span>Add';msg.innerHTML='';
    let r;try{r=await B.lookup(n)}catch(err){r={error:'FAA data didn’t load. Try again.'}}btn.disabled=false;btn.textContent='Add';
    if(r.error)return VA.invalid(f.n,r.error);
    if(r.notFound){msg.innerHTML=`<div class="check warn small"><b>${esc(r.tail)}</b> not in FAA file. Tier: <span class="row" style="margin-top:6px">${tierSel('mt','single')}<button class="btn sm" type="button" data-manual>Add ${esc(r.tail)}</button></span></div>`;
      $('[data-manual]',msg).onclick=()=>{const res=onAdd({tail:r.tail,model:'Manual entry',tier:$('select',msg).value,manual:true});if(res!==false){msg.innerHTML='';f.n.value=''}};return}
    const res=onAdd(r.item,r);if(res!==false){f.n.value='';f.n.focus()}};
}
const itemRow=(i,rm)=>{const t=tierOf(i.tier);return `<tr data-tail="${esc(i.tail)}"><td class="mono"><b>${esc(i.tail)}</b></td><td>${esc(i.model||'')}${i.year?` <span class="dim">· ${esc(i.year)}</span>`:''}</td><td>${esc(t.name)}</td><td class="num">$${t.price}</td>${rm?`<td class="num"><button class="btn sm ghost" data-rm="${esc(rm===true?i.tail:i.id)}" aria-label="Remove ${esc(i.tail)}">Remove</button></td>`:''}</tr>`};
B.itemRow=itemRow;B.adder=adder;

/* ---------- sign-up steps ---------- */
const shell=(...a)=>A.shell(...a);
const back='<button class="btn ghost" type="button" id="suBack">Back</button>';
A.VIEWS.aircraft=()=>{const d=A.draft||{};d.items=d.items||[];
  return shell(`${A.steps(1)}<h1 id="authH">Aircraft</h1><div id="suAdd"></div><div id="suItems"></div>
    <div class="row auth-nav">${back}<span class="spacer"></span><button class="btn primary" type="button" id="suNext">Continue</button></div>`)};
function drawItems(el){const d=A.draft;const box=$('#suItems',el);
  box.innerHTML=d.items.length?`<div class="tbl"><div class="tbl-scroll"><table class="bill-t"><thead><tr><th>Tail</th><th>Aircraft</th><th>Tier</th><th class="num">/mo</th><th></th></tr></thead><tbody>${d.items.map(i=>itemRow(i,true)).join('')}</tbody>
    <tfoot><tr><td colspan="3"><b>${d.items.length} aircraft</b></td><td class="num" id="suTotal"><b>${money0(d.items.reduce((t,i)=>t+tierOf(i.tier).price,0))}</b></td><td></td></tr></tfoot></table></div></div>`:'';
  $$('[data-rm]',box).forEach(b=>b.onclick=()=>{d.items=d.items.filter(i=>i.tail!==b.dataset.rm);drawItems(el)})}
A.WIRE.aircraft=el=>{if(!A.draft)return A.show('create');adder($('#suAdd',el),item=>{const d=A.draft;if(d.items.some(i=>i.tail===item.tail)){VA.toast(`${esc(item.tail)} already added`,'bad');return false}d.items.push(item);drawItems(el)});drawItems(el);
  $('#suBack',el).onclick=()=>A.show('create');
  $('#suNext',el).onclick=()=>{if(!A.draft.items.length){VA.invalid($('#suAdd input',el),'Add at least one aircraft');return}A.show('plan')}};
A.VIEWS.plan=()=>{const d=A.draft||{items:[]};const tot=d.items.reduce((t,i)=>t+tierOf(i.tier).price,0);const trialEnd=addD(today(),CONFIG.trialDays);
  return shell(`${A.steps(2)}<h1 id="authH">Plan</h1>
    <div class="tbl plan-sum"><div class="tbl-scroll"><table class="bill-t" id="planT"><thead><tr><th>Tail</th><th>Aircraft</th><th>Tier</th><th class="num">/mo</th></tr></thead><tbody>${d.items.map(i=>itemRow(i,false)).join('')}</tbody>
    <tfoot><tr><td colspan="3">Monthly total</td><td class="num" id="planTotal"><b>${money0(tot)}/mo</b></td></tr>
    <tr class="trial"><td colspan="3"><b>${CONFIG.trialDays}-day free trial</b> · first charge ${fmtDate(trialEnd)}</td><td class="num"><b>$0 today</b></td></tr></tfoot></table></div></div>
    <p class="small dim">${CONFIG.currency}, plus applicable tax.</p>
    <div class="row auth-nav">${back}<span class="spacer"></span><button class="btn primary" type="button" id="suCheckout">Continue to secure checkout</button></div>`)};
A.WIRE.plan=el=>{if(!A.draft||!A.draft.items||!A.draft.items.length)return A.show('aircraft');$('#suBack',el).onclick=()=>A.show('aircraft');$('#suCheckout',el).onclick=()=>A.show('checkout')};
A.VIEWS.checkout=()=>{const d=A.draft||{items:[]};const tot=d.items.reduce((t,i)=>t+tierOf(i.tier).price,0);
  return shell(`${A.steps(3)}<div class="sim-banner" role="note"><b>Demo checkout: no card is charged.</b></div>
    <h1 id="authH">Confirm</h1>
    <dl class="sim-kv"><dt>Account</dt><dd>${esc(d.email||'')}</dd><dt>Organization</dt><dd>${esc(d.org||'')}</dd><dt>Aircraft</dt><dd>${d.items.length}</dd>
    <dt>Monthly</dt><dd><b>${money0(tot)}</b> from ${fmtDate(addD(today(),CONFIG.trialDays))}</dd><dt>Today</dt><dd><b>$0.00</b></dd></dl>
    <div class="consent" id="suConsent"><p id="suRenew"><b>${money0(tot)}/mo</b> after the ${CONFIG.trialDays}-day free trial. Renews monthly until canceled. Cancel anytime in Settings.</p>
      <label class="auth-check"><input type="checkbox" id="suAgree" required aria-describedby="suRenew"> <span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></span></label>
      <div class="auth-err" id="suAgreeErr" role="alert" hidden>Agree to the Terms to continue.</div></div>
    <div class="row auth-nav">${back}<span class="spacer"></span><button class="btn primary" type="button" id="suConfirm">Confirm</button></div>`)};
A.WIRE.checkout=el=>{if(!A.draft||!A.draft.items||!A.draft.items.length)return A.show('aircraft');$('#suBack',el).onclick=()=>A.show('plan');
  const agree=$('#suAgree',el),aErr=$('#suAgreeErr',el);agree.onchange=()=>{aErr.hidden=true;agree.removeAttribute('aria-invalid')};
  $('#suConfirm',el).onclick=async()=>{if(!agree.checked){aErr.hidden=false;agree.setAttribute('aria-invalid','true');agree.focus();return}
    const b=$('#suConfirm',el);A.busy(b,true,'Confirming');const d=A.draft;const tot=d.items.reduce((t,i)=>t+tierOf(i.tier).price,0);
    const r=await A.create(d);if(!r.ok){A.busy(b,false);A.show('create');return setTimeout(()=>A.bad($('#createForm'),r.field,r.msg),50)}
    B.recordConsent(r.account,{monthly:tot,aircraft:d.items.length,trialDays:CONFIG.trialDays,firstCharge:addD(today(),CONFIG.trialDays),text:$('#suRenew',el).textContent+' I agree to the Terms and Privacy.'});
    const sub=B.start(r.account.id,d.items);A.draft={done:true,account:r.account,sub,org:d.org,n:d.items.length,tot:d.items.reduce((t,i)=>t+tierOf(i.tier).price,0)};A.show('done')}};
A.VIEWS.done=()=>{const d=A.draft||{};const sub=d.sub||{checkout:{}};
  return shell(`<div class="auth-sent"><div class="auth-sent-ic" aria-hidden="true">✓</div><h1 id="authH">Subscription active</h1>
    <p class="auth-sub">${d.n||0} aircraft · ${money0(d.tot||0)}/mo · trial until ${sub.trialEnds?fmtDate(sub.trialEnds):''}</p>
    <div class="sim-banner small" role="note">Demo checkout: no card was charged · <span class="mono">${esc(sub.checkout&&sub.checkout.ref||'')}</span></div>
    <button class="btn primary auth-submit" id="suEnter" type="button">Open Valkyr360</button></div>`)};
A.WIRE.done=el=>{const d=A.draft;if(!d||!d.done)return A.show('signin');$('#suEnter',el).onclick=()=>{A.draft=null;A.begin(d.account,true)}};

/* ---------- Billing page (owner only) ---------- */
VA.views.billing=function(el){
  const sub=B.get();
  if(!sub){el.innerHTML=`<div class="empty"><b>No subscription.</b> <a href="#/plans">Plans</a></div>`;return {title:'Billing'}}
  const c=cycle(sub),items=lines(),tot=total();const adj=sub.adjustments.reduce((t,a)=>t+a.amount,0);
  const st=sub.status==='suspended'?['Suspended','bad']:sub.status==='canceled'?['Canceled','bad']:sub.status==='canceling'?['Ends '+fmtDate(sub.cancelAt),'warn']:['Active','ok'];
  el.innerHTML=`<div class="sim-banner small" role="note"><span class="demo-tag">DEMO</span> Simulated billing. No card is stored or charged.</div>
  <div class="stats s4" style="margin-top:14px">
    <div class="stat"><div class="l">Status</div><div class="v" id="bStatus" style="font-size:20px;color:var(--${st[1]})">${st[0]}</div><div class="s">${sub.status==='canceled'?'Read-only':c.trial?`Trial until ${fmtDate(sub.trialEnds)}`:'Monthly'} · <a href="#/settings" id="bManage">Manage</a></div></div>
    <div class="stat"><div class="l">Monthly total</div><div class="v" id="bTotal">${money0(tot)}</div><div class="s">${items.length} aircraft</div></div>
    <div class="stat"><div class="l">Next invoice</div><div class="v" id="bNext" style="font-size:20px">${sub.status==='active'?fmtDate(c.next):'—'}</div><div class="s">${sub.status==='active'?money2(tot+adj)+(adj?` incl. ${money2(adj)} proration`:''):'None'}</div></div>
    <div class="stat"><div class="l">Payment method</div><div class="v" style="font-size:16px">${esc(sub.payment.label)}</div><div class="s"><button class="link-btn" id="bPay">Update</button></div></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>Aircraft</h2>
    <div class="tbl"><div class="tbl-scroll"><table class="bill-t" id="bItems"><thead><tr><th>Tail</th><th>Aircraft</th><th>Tier</th><th class="num">/mo</th><th></th></tr></thead><tbody>${items.map(i=>itemRow(i,'id')).join('')}</tbody>
    <tfoot><tr><td colspan="3"><b>Monthly total</b></td><td class="num"><b>${money0(tot)}</b></td><td></td></tr></tfoot></table></div></div>
    <div id="bNote" class="bill-note" aria-live="polite">${B.lastNote?`<div class="check ok small">${esc(B.lastNote)}</div>`:''}</div>
    <div id="bAdd" style="margin-top:14px"></div>
    ${sub.adjustments.length?`<h3 class="section-h" style="margin-top:18px">Prorations</h3><table class="bill-t" id="bAdj"><tbody>${sub.adjustments.map(a=>`<tr><td>${fmtDate(a.date)}</td><td>${esc(a.desc)}</td><td class="num">${a.amount<0?'−':''}${money2(Math.abs(a.amount))}</td></tr>`).join('')}</tbody></table>`:''}
  </div>
  <div class="card" style="margin-top:16px"><h2>Invoices</h2>
    ${sub.invoices.length?`<div class="tbl"><div class="tbl-scroll"><table class="bill-t" id="bInv"><thead><tr><th>Invoice</th><th>Date</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>${sub.invoices.map((v,k)=>`<tr><td class="mono">${esc(v.id)}</td><td>${fmtDate(v.date)}</td><td class="num">${money2(v.amount)}</td><td><span class="chip ok">Paid</span></td><td class="num"><button class="btn sm ghost" data-ro-ok data-inv="${k}">View</button></td></tr>`).join('')}</tbody></table></div></div>`
      :`<div class="empty small">None yet.</div>`}
  </div>
  `;
  B.lastNote=null;
  const redraw=()=>VA.views.billing(el);
  $$('#bItems [data-rm]',el).forEach(b=>b.onclick=()=>VA.confirmArchive(b.dataset.rm,()=>{VA.route()}));
  if(sub.status!=='canceled')adder($('#bAdd',el),(item,r)=>{const res=VA.addAircraft({type:r&&r.type,reg:r&&r.reg,tail:item.tail,tier:item.tier,model:r?null:item.model});if(res.error){VA.toast(esc(res.error),'bad');return false}B.lastNote=res.note;VA.route()});
  $('#bPay',el).onclick=()=>VA.modal('Update payment method',`<div class="sim-banner" role="note"><b>Demo: nothing is collected.</b> Production opens the provider’s hosted page.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" data-ro-ok id="payGo">Simulate update</button>`,m=>{$('#payGo',m.parentElement).onclick=()=>{sub.payment={label:'Demo payment method',updated:today()};B.save(sub);VA.closeModal();VA.toast('Payment method updated (demo)','ok');redraw()}});
  $$('[data-inv]',el).forEach(b=>b.onclick=()=>{const v=sub.invoices[+b.dataset.inv];VA.modal(`Invoice ${v.id}`,`<div class="inv-brand"><img src="brand/hill-systems-logo-sm.png" alt="Hill Systems"><span class="small dim">Valkyr360 by Hill Systems</span></div><p class="small dim"><span class="demo-tag">DEMO</span> ${esc(v.period)}</p><table class="bill-t"><tbody>${v.lines.map(l=>`<tr><td>${esc(l.desc)}</td><td class="num">${money2(l.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td><b>Total</b></td><td class="num"><b>${money2(v.amount)}</b></td></tr></tfoot></table><p class="inv-copy">© 2026 Hill Systems. All rights reserved.</p>`,`<button class="btn" data-ro-ok id="invPrint">Print</button><button class="btn" data-close>Close</button>`,m=>{$('#invPrint',m.parentElement).onclick=()=>{document.body.classList.add('print-invoice');window.print();setTimeout(()=>document.body.classList.remove('print-invoice'),300)}})});
  return {title:'Billing'};
};
/* ---------- Settings › Subscription (owner only) ---------- */
const set0=VA.views.settings;
VA.views.settings=function(el,args){const r=set0(el,args)||{};const sub=VA.state().role==='owner'&&A.session()?B.get():null;
  if(sub){const c=cycle(sub),tot=total();
    const line=sub.status==='suspended'?'Suspended · read-only':sub.status==='canceled'?`Canceled ${fmtDate(sub.cancelAt)} · read-only`:sub.status==='canceling'?`Ends ${fmtDate(sub.cancelAt)}`:`Active · ${money0(tot)}/mo · ${c.trial?'trial until '+fmtDate(sub.trialEnds):'next invoice '+fmtDate(c.next)}`;
    const btns=sub.status==='active'?`<button class="btn ghost danger-t" id="sCancel">Cancel subscription</button>`
      :sub.status==='canceling'?`<button class="btn" id="sResume">Keep subscription</button>`
      :sub.status==='suspended'?`<button class="btn" data-ro-ok id="sExport">Export data</button>`
      :`<button class="btn" data-ro-ok id="sExport">Export data</button><button class="btn primary" data-ro-ok id="sResub">Resubscribe</button>`;
    el.insertAdjacentHTML('afterbegin',`<section class="card sub-card" id="subCard" style="margin-bottom:18px"><h2>Subscription</h2><div class="row"><span id="subStatus" class="${sub.status==='active'?'ok-t':sub.status==='canceling'?'warn-t':'bad-t'}">${line}</span><span class="spacer"></span><a href="#/billing" class="small">Billing</a> <a href="terms.html" class="small" id="subTerms">Terms</a>${btns}</div></section>`);
    const on=(id,f)=>{const b=$('#'+id,el);if(b)b.onclick=f};
    on('sCancel',()=>VA.modal('Cancel subscription?',`<p style="margin-top:0">Ends ${fmtDate(c.next)}. Full access until then, then read-only and exportable. No further charges.</p>`,
      `<button class="btn" data-close>Keep subscription</button><button class="btn danger" id="cancelGo">Cancel subscription</button>`,m=>{$('#cancelGo',m.parentElement).onclick=()=>{sub.status='canceling';sub.cancelAt=c.next;sub.canceledOn=today();B.save(sub);VA.closeModal();VA.toast(`Subscription ends ${fmtDate(c.next)}`,'ok');VA.route()}}));
    on('sResume',()=>{sub.status='active';delete sub.cancelAt;B.save(sub);VA.toast('Subscription kept','ok');VA.route()});
    on('sExport',()=>VA.exportAll());
    on('sResub',()=>{const t=today();Object.assign(sub,{status:'active',anchor:t,trialEnds:t,created:t,adjustments:[]});delete sub.cancelAt;B.save(sub);VA.toast('Subscription active (demo)','ok');VA.route()});}
  r.title='Settings';return r};
/* ---------- onboarding for a new account's own fleet ---------- */
const fleet0=VA.views.fleet;
VA.views.fleet=function(el,args){const r=fleet0(el,args);const S=VA.state();
  if(VA.isAccount()&&S.role==='owner'&&!S.onboardDone){const first=S.aircraft[0];
    const steps=[['log','Log first flight','#/log',VA.logCount>0],['sd','Import SD card','#/import',Object.keys(S.deviceMap||{}).length>0],['docs','Upload documents',first?`#/aircraft/${first.id}/docs`:'#/fleet',S.docs.length>0]];
    el.insertAdjacentHTML('afterbegin',`<div class="card onboard" id="onboard"><div class="row"><h2 style="margin:0">Get started</h2><span class="spacer"></span><button class="link-btn" id="obHide">Hide</button></div>
      <ol>${steps.map(([k,l,h,d],i)=>`<li class="${d?'done':''}" data-ob="${k}"><a href="${h}"><span class="n">${d?'✓':i+1}</span>${l}</a></li>`).join('')}</ol></div>`);
    $('#obHide',el).onclick=()=>{S.onboardDone=true;VA.save();$('#onboard',el).remove()}}
  return r};
/* ---------- aircraft detail: archive (owner) + document upload ---------- */
const ac0=VA.views.aircraft;
VA.views.aircraft=function(el,parts){const r=ac0(el,parts);const a=VA.state().aircraft.find(x=>x.id===(parts&&parts[0]));if(!a)return r;
  const head=el.querySelector('.detail-head > .row:last-child')||el.querySelector('.detail-head .row:last-child');
  if(head&&VA.state().role==='owner')head.insertAdjacentHTML('beforeend','<button class="btn ghost" id="acArchive">Archive</button>');
  const ab=$('#acArchive',el);if(ab)ab.onclick=()=>VA.confirmArchive(a.id,()=>VA.go('fleet'));
  if((parts[1]||'due')==='docs'){const tabs=el.querySelector('[data-tab]');const host=tabs&&tabs.parentElement;
    if(host){host.insertAdjacentHTML('afterend',`<div class="row" style="margin:12px 0" id="docUpRow"><label class="btn sm" for="docUp">Upload documents</label><input type="file" id="docUp" multiple hidden></div>`);
      $('#docUp',el).onchange=async e=>{const fs=[...e.target.files];if(!fs.length)return;const S=VA.state();
        for(const f of fs){const id=VA.uid('d');S.docs.push({id,ac:a.id,name:f.name,kind:'Uploaded',exp:null,size:f.size,uploaded:today()});try{await DAL.putKV('doc:'+id,f)}catch(err){}}
        VA.save();VA.toast(`${fs.length} document${fs.length>1?'s':''} added`,'ok');VA.route()}}}
  return r};
})();

/* Consent records (DEMO: localStorage va.consent, one list per account). Production: server-side, kept ≥ 3 years (ARCHITECTURE §16). */
(function(){const B=VA.billing;const K='va.consent';
  const all=()=>{try{return JSON.parse(localStorage.getItem(K)||'{}')}catch(e){return {}}};
  B.recordConsent=function(acct,shown){const m=all();(m[acct.id]=m[acct.id]||[]).push({uid:acct.id,email:acct.email,at:new Date().toISOString(),termsVersion:VA.BILLING_CONFIG.termsVersion,privacy:'placeholder',autoRenew:'monthly',shown});localStorage.setItem(K,JSON.stringify(m));return m[acct.id].slice(-1)[0]};
  B.consents=uid=>all()[uid]||[];
})();
