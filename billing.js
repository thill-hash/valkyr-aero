/* Valkyr Aero — DEMO billing (processor-neutral).
   Sign-up: account → aircraft (FAA N-number lookup picks the tier) → plan summary → simulated checkout → app.
   No card data is collected or stored anywhere. In production "Continue to secure checkout" redirects to the
   payment provider's hosted page through a BillingAdapter (see ARCHITECTURE.md §16). Our own subscription and
   invoice records are the source of truth; here they live in this browser's localStorage. */
(function(){
const {$,$$,esc}=VA;const A=VA.auth;
/* Placeholders Trevor can change */
const CONFIG=VA.BILLING_CONFIG={trialDays:14,currency:'USD',invoicePrefix:'VA-DEMO-'};
const KEY='va.billing';
const tiers=()=>VA.TIERS;
const tierOf=id=>tiers().find(t=>t.id===id)||tiers().find(t=>t.id==='single');
const money2=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const money0=n=>'$'+Math.round(n).toLocaleString('en-US');
const iso=d=>d.toISOString().slice(0,10);
const addD=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const addM=(s,n)=>{const d=new Date(s+'T12:00:00Z');const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return iso(d)};
const today=()=>VA.todayISO?VA.todayISO():iso(new Date());
const days=(a,b)=>Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/864e5);
const fmtDate=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const all=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return {}}};
const put=(uid,sub)=>{const a=all();a[uid]=sub;localStorage.setItem(KEY,JSON.stringify(a))};
const total=sub=>sub.items.reduce((t,i)=>t+tierOf(i.tier).price,0);

function invoiceFor(sub,date,items,status='paid'){const lines=items.map(i=>({desc:`${i.tail} · ${tierOf(i.tier).name}`,amount:tierOf(i.tier).price}));
  return {id:CONFIG.invoicePrefix+date.replace(/-/g,'')+'-'+String(sub.invoices.length+1).padStart(3,'0'),date,period:`${fmtDate(date)} – ${fmtDate(addD(addM(date,1),-1))}`,lines,amount:lines.reduce((t,l)=>t+l.amount,0),status}}
/* demo owner: subscription seeded from the demo fleet, started 6 months ago, past its trial */
function demoSub(){const S=VA.state();const t=today();const start=addM(t,-6);
  const sub={uid:'demo',status:'active',plan:'per-aircraft-monthly',created:start,trialEnds:addD(start,CONFIG.trialDays),anchor:addD(start,CONFIG.trialDays),
    items:S.aircraft.slice(0,5).map(a=>({tail:a.tail,model:a.short||a.model||'',tier:a.cls,added:start})),payment:{label:'Demo payment method',updated:start},invoices:[],adjustments:[],demo:true};
  let d=sub.anchor;while(d<=t){sub.invoices.unshift(invoiceFor(sub,d,sub.items));d=addM(d,1)}return sub}
function cycle(sub){const t=today();if(t<sub.trialEnds)return {start:sub.created,next:sub.trialEnds,trial:true};
  let d=sub.anchor;while(addM(d,1)<=t)d=addM(d,1);return {start:d,next:addM(d,1),trial:false}}
function prorate(sub,price){const c=cycle(sub);if(c.trial)return {trial:true,amount:0,left:days(today(),c.next),cycleDays:days(c.start,c.next)};
  const left=days(today(),c.next),len=days(c.start,c.next);return {trial:false,amount:Math.round(price*left/len*100)/100,left,cycleDays:len}}
const B=VA.billing={CONFIG,tierOf,total,cycle,prorate,money2,
  get(){const s=A.session();if(!s)return null;const a=all();if(a[s.uid])return a[s.uid];if(s.demo){const d=demoSub();put('demo',d);return d}return null},
  save(sub){put(sub.uid,sub)},
  start(uid,items){const t=today();const sub={uid,status:'active',plan:'per-aircraft-monthly',created:t,trialEnds:addD(t,CONFIG.trialDays),anchor:addD(t,CONFIG.trialDays),
    items:items.map(i=>({...i,added:t})),payment:{label:'Demo payment method',updated:t},invoices:[],adjustments:[],checkout:{ref:'DEMO-CHK-'+Date.now().toString(36).toUpperCase(),at:new Date().toISOString(),charged:0}};put(uid,sub);return sub},
  add(sub,item){if(sub.items.some(i=>i.tail===item.tail))return {error:`${item.tail} is already on your plan`};const p=prorate(sub,tierOf(item.tier).price);
    sub.items.push({...item,added:today()});const note=p.trial?`${item.tail} added. You’re in the free trial, so nothing is prorated; the new total starts with the first invoice.`:`${item.tail} added. Prorated charge of ${money2(p.amount)} for the ${p.left} days left in this billing period goes on the next invoice.`;
    if(!p.trial)sub.adjustments.push({date:today(),desc:`${item.tail} added (${p.left}/${p.cycleDays} days)`,amount:p.amount});B.save(sub);return {note}},
  remove(sub,tail){const it=sub.items.find(i=>i.tail===tail);if(!it)return {};const p=prorate(sub,tierOf(it.tier).price);sub.items=sub.items.filter(i=>i!==it);
    const note=p.trial?`${tail} removed. No charge during the free trial.`:`${tail} removed. A prorated credit of ${money2(p.amount)} for the ${p.left} unused days goes on the next invoice.`;
    if(!p.trial)sub.adjustments.push({date:today(),desc:`${tail} removed (${p.left}/${p.cycleDays} days unused)`,amount:-p.amount});B.save(sub);return {note}},
  /* N-number → plan item via the FAA library */
  async lookup(n){const r=await VA.types.lookupN(n);if(r.error)return {error:r.error};if(r.notFound)return {notFound:true,tail:r.n};
    if(!r.type)return {notFound:true,tail:r.n,why:'type code not in the FAA type library'};
    const c=VA.types.classify(r.type,r);return {item:{tail:r.n,model:`${r.type.mfr} ${r.type.model}`.trim(),year:r.year||'',tier:c.tier,code:r.code,flags:c.flags||[]}}}
};

/* ---------- shared aircraft picker (sign-up step 2 + Billing page) ---------- */
const tierSel=(name,sel)=>`<select name="${name}" aria-label="Pricing tier">${tiers().map(t=>`<option value="${t.id}" ${t.id===sel?'selected':''}>${esc(t.name)} — $${t.price}/mo</option>`).join('')}</select>`;
function adder(host,onAdd){
  host.innerHTML=`<form class="bill-add" novalidate><label class="f">N-number<span class="row" style="flex-wrap:nowrap;gap:8px"><input name="n" placeholder="e.g. N121W" autocomplete="off" autocapitalize="characters" spellcheck="false" style="font-family:var(--mono);text-transform:uppercase"><button class="btn" type="submit" data-look>Look up &amp; add</button></span></label><div class="bill-msg" aria-live="polite"></div></form>`;
  const f=$('form',host),msg=$('.bill-msg',host),btn=$('[data-look]',host);
  f.onsubmit=async e=>{e.preventDefault();const n=f.n.value.trim();if(!n)return VA.invalid(f.n,'Enter an N-number');
    btn.disabled=true;const t=btn.textContent;btn.innerHTML='<span class="btn-spin" aria-hidden="true"></span>Looking up…';msg.innerHTML='';
    let r;try{r=await B.lookup(n)}catch(err){r={error:'Couldn’t load the FAA registry data. Try again.'}}btn.disabled=false;btn.textContent=t;
    if(r.error)return VA.invalid(f.n,r.error);
    if(r.notFound){msg.innerHTML=`<div class="check warn small"><b>${esc(r.tail)}</b> isn’t in the FAA registry file${r.why?' ('+esc(r.why)+')':''}. Pick its tier to add it anyway:<div class="row" style="margin-top:8px">${tierSel('mt','single')}<button class="btn sm" type="button" data-manual>Add ${esc(r.tail)}</button></div></div>`;
      $('[data-manual]',msg).onclick=()=>{const res=onAdd({tail:r.tail,model:'Not in FAA file (manual)',tier:$('select',msg).value,manual:true});if(res!==false){msg.innerHTML='';f.n.value=''}};return}
    const res=onAdd(r.item);if(res!==false){f.n.value='';f.n.focus()}};
}
const itemRow=(i,rm)=>{const t=tierOf(i.tier);return `<tr data-tail="${esc(i.tail)}"><td class="mono"><b>${esc(i.tail)}</b></td><td>${esc(i.model||'')}${i.year?` <span class="dim">· ${esc(i.year)}</span>`:''}${(i.flags||[]).length?` <span class="chip warn" title="${esc(i.flags.join(' · '))}">review</span>`:''}</td><td>${esc(t.name)}</td><td class="num">$${t.price}/mo</td>${rm?`<td class="num"><button class="btn sm ghost" data-rm="${esc(i.tail)}" aria-label="Remove ${esc(i.tail)}">Remove</button></td>`:''}</tr>`};
B.itemRow=itemRow;B.adder=adder;

/* ---------- sign-up steps 2–4 ---------- */
const shell=(...a)=>A.shell(...a);
A.VIEWS.aircraft=()=>{const d=A.draft||{};d.items=d.items||[];
  return shell(`${A.steps(1)}<h1 id="authH">Add your aircraft</h1><p class="auth-sub">Enter each tail number. We look it up in the FAA registry and pick the pricing tier automatically.</p>
    <div id="suAdd"></div><div id="suItems"></div>
    <div class="row auth-nav"><button class="btn ghost" type="button" id="suBack">← Back</button><span class="spacer"></span><button class="btn primary" type="button" id="suNext">Continue: review plan →</button></div>`)};
function drawItems(el){const d=A.draft;const box=$('#suItems',el);
  box.innerHTML=d.items.length?`<div class="tbl"><div class="tbl-scroll"><table class="bill-t"><thead><tr><th>Tail</th><th>Aircraft</th><th>Tier</th><th class="num">Monthly</th><th></th></tr></thead><tbody>${d.items.map(i=>itemRow(i,true)).join('')}</tbody>
    <tfoot><tr><td colspan="3"><b>${d.items.length} aircraft</b></td><td class="num"><b>${money0(d.items.reduce((t,i)=>t+tierOf(i.tier).price,0))}/mo</b></td><td></td></tr></tfoot></table></div></div>`:`<div class="empty small">No aircraft yet. Add at least one to see your plan.</div>`;
  $$('[data-rm]',box).forEach(b=>b.onclick=()=>{d.items=d.items.filter(i=>i.tail!==b.dataset.rm);drawItems(el)})}
A.WIRE.aircraft=el=>{if(!A.draft)return A.show('create');adder($('#suAdd',el),item=>{const d=A.draft;if(d.items.some(i=>i.tail===item.tail)){VA.toast(`${esc(item.tail)} is already added`,'bad');return false}d.items.push(item);drawItems(el);VA.toast(`${esc(item.tail)} added · ${esc(tierOf(item.tier).name)} $${tierOf(item.tier).price}/mo`,'ok')});drawItems(el);
  $('#suBack',el).onclick=()=>A.show('create');
  $('#suNext',el).onclick=()=>{if(!A.draft.items.length){VA.invalid($('#suAdd input',el),'Add at least one aircraft');return}A.show('plan')}};
A.VIEWS.plan=()=>{const d=A.draft||{items:[]};const tot=d.items.reduce((t,i)=>t+tierOf(i.tier).price,0);const trialEnd=addD(today(),CONFIG.trialDays);
  return shell(`${A.steps(2)}<h1 id="authH">Your plan</h1><p class="auth-sub">${esc(d.org||'')} · billed monthly per aircraft. Cancel any time.</p>
    <div class="tbl plan-sum"><div class="tbl-scroll"><table class="bill-t" id="planT"><thead><tr><th>Tail</th><th>Aircraft</th><th>Tier</th><th class="num">Monthly</th></tr></thead><tbody>${d.items.map(i=>itemRow(i,false)).join('')}</tbody>
    <tfoot><tr><td colspan="3">Monthly total</td><td class="num" id="planTotal"><b>${money0(tot)}/mo</b></td></tr>
    <tr class="trial"><td colspan="3"><b>${CONFIG.trialDays}-day free trial</b> · first charge on ${fmtDate(trialEnd)}</td><td class="num"><b>$0 today</b></td></tr></tfoot></table></div></div>
    <p class="small dim">Prices in ${CONFIG.currency}, before any applicable sales tax (calculated at checkout). Adding or removing aircraft later is prorated.</p>
    <div class="row auth-nav"><button class="btn ghost" type="button" id="suBack">← Back</button><span class="spacer"></span><button class="btn primary" type="button" id="suCheckout"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Continue to secure checkout</button></div>`)};
A.WIRE.plan=el=>{if(!A.draft||!A.draft.items||!A.draft.items.length)return A.show('aircraft');$('#suBack',el).onclick=()=>A.show('aircraft');$('#suCheckout',el).onclick=()=>A.show('checkout')};
A.VIEWS.checkout=()=>{const d=A.draft||{items:[]};const tot=d.items.reduce((t,i)=>t+tierOf(i.tier).price,0);
  return shell(`${A.steps(3)}<div class="sim-banner" role="note"><b>Demo checkout: no card is charged.</b> In the live product this step opens our payment provider’s secure hosted page. No card details are collected here.</div>
    <h1 id="authH">Confirm your subscription</h1>
    <dl class="sim-kv"><dt>Account</dt><dd>${esc(d.name||'')} · ${esc(d.email||'')}</dd><dt>Organization</dt><dd>${esc(d.org||'')}</dd><dt>Aircraft</dt><dd>${d.items.length} (${d.items.map(i=>esc(i.tail)).join(', ')})</dd>
    <dt>After trial</dt><dd><b>${money0(tot)}/mo</b> from ${fmtDate(addD(today(),CONFIG.trialDays))}</dd><dt>Due today</dt><dd><b>$0.00</b> · ${CONFIG.trialDays}-day free trial</dd></dl>
    <div class="row auth-nav"><button class="btn ghost" type="button" id="suBack">← Back</button><span class="spacer"></span><button class="btn primary" type="button" id="suConfirm">Confirm demo checkout</button></div>`)};
A.WIRE.checkout=el=>{if(!A.draft||!A.draft.items||!A.draft.items.length)return A.show('aircraft');$('#suBack',el).onclick=()=>A.show('plan');
  $('#suConfirm',el).onclick=async()=>{const b=$('#suConfirm',el);A.busy(b,true,'Confirming…');const d=A.draft;
    const r=await A.create(d);if(!r.ok){A.busy(b,false);A.show('create');return setTimeout(()=>A.bad($('#createForm'),r.field,r.msg),50)}
    const sub=B.start(r.account.id,d.items);A.draft={done:true,account:r.account,sub,org:d.org};A.show('done')}};
A.VIEWS.done=()=>{const d=A.draft||{};const sub=d.sub||{items:[],checkout:{}};
  return shell(`<div class="auth-sent"><div class="auth-sent-ic" aria-hidden="true">✓</div><h1 id="authH">Subscription active</h1>
    <p class="auth-sub">${esc(d.org||'')} is set up with ${sub.items.length} aircraft at <b>${money0(total(sub))}/mo</b>. Your free trial runs until ${sub.trialEnds?fmtDate(sub.trialEnds):''}.</p>
    <div class="sim-banner small" role="note">Demo checkout: no card was charged · reference <span class="mono">${esc(sub.checkout&&sub.checkout.ref||'')}</span></div>
    <button class="btn primary auth-submit" id="suEnter" type="button">Go to Valkyr Aero →</button></div>`)};
A.WIRE.done=el=>{const d=A.draft;if(!d||!d.done)return A.show('signin');$('#suEnter',el).onclick=()=>{A.draft=null;A.begin(d.account,true)}};

/* ---------- Billing page (owner only) ---------- */
VA.views.billing=function(el){
  const sub=B.get();
  if(!sub){el.innerHTML=`<div class="empty"><b>No subscription on this account.</b> <a href="#/plans">See plans</a></div>`;return {title:'Billing'}}
  const c=cycle(sub),tot=total(sub);const adj=sub.adjustments.reduce((t,a)=>t+a.amount,0);
  el.innerHTML=`<div class="sim-banner small" role="note"><span class="demo-tag">DEMO</span> Simulated billing. No card is stored or charged, and invoices are examples.</div>
  <div class="stats s4" style="margin-top:14px">
    <div class="stat"><div class="l">Status</div><div class="v" id="bStatus" style="font-size:20px;color:var(--ok)">Active</div><div class="s">${c.trial?`Free trial until ${fmtDate(sub.trialEnds)}`:'Billed monthly'}</div></div>
    <div class="stat"><div class="l">Monthly total</div><div class="v" id="bTotal">${money0(tot)}</div><div class="s">${sub.items.length} aircraft</div></div>
    <div class="stat"><div class="l">Next invoice</div><div class="v" id="bNext" style="font-size:20px">${fmtDate(c.next)}</div><div class="s">${money2(tot+adj)}${adj?` incl. ${money2(adj)} prorations`:''}</div></div>
    <div class="stat"><div class="l">Payment method</div><div class="v" style="font-size:16px">${esc(sub.payment.label)}</div><div class="s">Updated ${fmtDate(sub.payment.updated)} · <button class="link-btn" id="bPay">Update payment method</button></div></div>
  </div>
  <div class="card" style="margin-top:16px"><h2>Plan per aircraft</h2>
    <div class="tbl"><div class="tbl-scroll"><table class="bill-t" id="bItems"><thead><tr><th>Tail</th><th>Aircraft</th><th>Tier</th><th class="num">Monthly</th><th></th></tr></thead><tbody>${sub.items.map(i=>itemRow(i,true)).join('')||'<tr><td colspan="5" class="dim">No aircraft on the plan.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="3"><b>Monthly total</b></td><td class="num"><b>${money0(tot)}/mo</b></td><td></td></tr></tfoot></table></div></div>
    <div id="bNote" class="bill-note" aria-live="polite">${B.lastNote?`<div class="check ok small">${esc(B.lastNote)}</div>`:''}</div>
    <h3 class="section-h" style="margin-top:18px">Add aircraft</h3><div id="bAdd"></div>
    ${sub.adjustments.length?`<h3 class="section-h" style="margin-top:18px">Prorations on the next invoice</h3><table class="bill-t" id="bAdj"><tbody>${sub.adjustments.map(a=>`<tr><td>${fmtDate(a.date)}</td><td>${esc(a.desc)}</td><td class="num">${a.amount<0?'−':''}${money2(Math.abs(a.amount))}</td></tr>`).join('')}</tbody></table>`:''}
    <p class="small dim" style="margin-top:12px">Proration: adding an aircraft mid-period charges its tier price × days left ÷ days in the period. Removing one credits the unused days. Both appear on the next invoice. No proration during the free trial.</p>
  </div>
  <div class="card" style="margin-top:16px"><h2>Invoice history</h2>
    ${sub.invoices.length?`<div class="tbl"><div class="tbl-scroll"><table class="bill-t" id="bInv"><thead><tr><th>Invoice</th><th>Date</th><th>Period</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>${sub.invoices.map((v,k)=>`<tr><td class="mono">${esc(v.id)}</td><td>${fmtDate(v.date)}</td><td class="small">${esc(v.period)}</td><td class="num">${money2(v.amount)}</td><td><span class="chip ok">Paid · demo</span></td><td class="num"><button class="btn sm ghost" data-inv="${k}">View</button></td></tr>`).join('')}</tbody></table></div></div>`
      :`<div class="empty small">No invoices yet. Your first invoice is on ${fmtDate(c.next)}.</div>`}
  </div>`;
  B.lastNote=null;
  const redraw=note=>{B.lastNote=note;VA.views.billing(el)};
  $$('[data-rm]',el).forEach(b=>b.onclick=()=>{if(sub.items.length<=1){VA.toast('Keep at least one aircraft on the plan. To stop billing entirely, cancel the subscription.','bad');return}const r=B.remove(sub,b.dataset.rm);redraw(r.note)});
  adder($('#bAdd',el),item=>{const r=B.add(sub,item);if(r.error){VA.toast(esc(r.error),'bad');return false}redraw(r.note)});
  $('#bPay',el).onclick=()=>VA.modal('Update payment method',`<div class="sim-banner" role="note"><b>Demo: nothing is collected.</b> In production this opens the payment provider’s secure hosted page, where you enter the new card or bank details. Valkyr Aero never sees or stores card numbers.</div>`,
    `<button class="btn" data-close>Cancel</button><button class="btn primary" id="payGo">Simulate update</button>`,m=>{$('#payGo',m.parentElement).onclick=()=>{sub.payment={label:'Demo payment method (updated)',updated:today()};B.save(sub);VA.closeModal();VA.toast('Payment method updated (simulated)','ok');redraw()}});
  $$('[data-inv]',el).forEach(b=>b.onclick=()=>{const v=sub.invoices[+b.dataset.inv];VA.modal(`Invoice ${v.id}`,`<p class="small dim"><span class="demo-tag">DEMO</span> Example invoice. Not a tax document.</p><table class="bill-t"><tbody>${v.lines.map(l=>`<tr><td>${esc(l.desc)}</td><td class="num">${money2(l.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td><b>Total · ${esc(v.period)}</b></td><td class="num"><b>${money2(v.amount)}</b></td></tr></tfoot></table>`,`<button class="btn" data-close>Close</button>`)});
  return {title:'Billing'};
};
})();
