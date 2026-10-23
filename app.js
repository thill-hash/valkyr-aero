/* Valkyr Aero — core: state, airworthiness engine, routing, UI helpers */
const VA=window.VA={};
let S=null;
let saveT=null;
function save(){VA.dirty();clearTimeout(saveT);saveT=setTimeout(()=>{DAL.putState(S).catch(e=>console.warn('save failed',e))},60)}
VA.flush=()=>{clearTimeout(saveT);return DAL.putState(S)};
VA.state=()=>S; VA.save=save; VA.setState=s=>{S=s;VA.dirty()};
function flightEntry(f){return {id:f.id||uid('l'),ac:f.ac,date:f.date,type:'Flight',hrs:f.hrs,from:f.from,to:f.to,pilot:f.pilot,src:f.src||'Manual',
  text:`${f.from} → ${f.to} · ${h1(f.hrs)} h · ${VA.person(f.pilot).name}${f.src&&f.src!=='Manual'?' · auto-imported from '+f.src:''}`,by:VA.person(f.pilot).name}}
VA.flightEntry=flightEntry;
VA.seedStandard=async function(){
  const seed=window.VALKYR_SEED();const {logbook,flights,...st}=seed;S=st;VA.dirty();
  const hist=VA.genStandardHistory(S);
  const fl=[...flights.map(flightEntry),...hist.flights];
  const cut=addDays(todayISO(),-365);
  S.aircraft.forEach(a=>{a.hrs12=Math.round(fl.filter(f=>f.ac===a.id&&f.date>=cut).reduce((t,f)=>t+f.hrs,0)*10)/10});
  // seed one engine-trend exceedance draft on the SR22 for mechanic review
  const sr=hist.flights.filter(f=>f.ac==='sr22'&&f.eng).slice(-1)[0];
  if(sr){sr.eng.cht=466;S.squawks.unshift({id:uid('s'),ac:'sr22',title:'Engine exceedance: CHT 466 °F (limit 460 °F)',desc:`Auto-detected from engine data on ${sr.from} → ${sr.to} (${sr.date}). Rising CHT trend over the last ~40 days — suggest baffle / injector inspection. Draft — needs mechanic review.`,by:'system',date:sr.date,grounding:false,status:'draft',auto:true,flight:sr.id})}
  await DAL.clearAll();await DAL.addLogs([...logbook,...fl]);await DAL.putExpenses(hist.expenses);await VA.flush();
};
VA.reset=async()=>{await VA.seedStandard();toast('Demo data reset','ok');route()};
/* cached lookups (rebuilt lazily after any mutation) */
let cache=null;
VA.dirty=()=>{cache=null};
function C(){if(!cache){cache={ac:new Map(),items:new Map(),people:new Map()};S.aircraft.forEach(a=>{cache.ac.set(a.id,a);cache.items.set(a.id,[])});S.items.forEach(i=>{(cache.items.get(i.ac)||cache.items.set(i.ac,[]).get(i.ac)).push(i)});S.people.forEach(p=>cache.people.set(p.id,p))}return cache}
VA.itemsOf=id=>C().items.get(id)||[];

/* ---------- utils ---------- */
const $=(q,el=document)=>el.querySelector(q);
const $$=(q,el=document)=>[...el.querySelectorAll(q)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayISO=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const parse=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)};
const isoOf=d=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const addMonths=(s,m)=>{const d=parse(s);d.setMonth(d.getMonth()+m);return isoOf(d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return isoOf(d)};
const daysBetween=(a,b)=>Math.round((parse(b)-parse(a))/864e5);
const fmtDate=s=>s?parse(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'—';
const fmtShort=s=>s?parse(s).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—';
const h1=n=>(Math.round(n*10)/10).toFixed(1);
const money=n=>'$'+Math.round(n).toLocaleString();
const uid=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
Object.assign(VA,{$,$$,esc,todayISO,parse,isoOf,addMonths,addDays,daysBetween,fmtDate,fmtShort,h1,money,uid});

/* ---------- lookups ---------- */
VA.ac=id=>C().ac.get(id);
VA.person=id=>id==='system'?{name:'Valkyr engine monitor',initials:'VA'}:C().people.get(id)||{name:'—',initials:'?'};
VA.me=()=>S.people.find(p=>p.role===S.role);
VA.pilots=()=>S.people.filter(p=>p.role!=='mechanic'||true);

/* ---------- airworthiness engine ---------- */
// due-soon thresholds: hours <= max(10, 15% of interval) ; days <= 30
VA.itemDue=function(it,asOfDate){
  const a=VA.ac(it.ac), today=asOfDate||todayISO();
  let dueHrs=null,remHrs=null,dueDate=null,remDays=null,pct=1;
  if(it.intHrs&&it.lastHrs!=null){dueHrs=it.lastHrs+it.intHrs;remHrs=dueHrs-a.tt;pct=Math.min(pct,remHrs/it.intHrs)}
  if(it.intMo&&it.lastDate){dueDate=addMonths(it.lastDate,it.intMo);remDays=daysBetween(today,dueDate);pct=Math.min(pct,remDays/(it.intMo*30.4))}
  if(!it.lastDate&&it.targetDate){dueDate=it.targetDate;remDays=daysBetween(today,dueDate);pct=Math.min(pct,remDays/180)}
  let st='ok';
  const soonH=it.intHrs?Math.min(50,Math.max(10,it.intHrs*.15)):10;
  if((remHrs!=null&&remHrs<0)||(remDays!=null&&remDays<0))st='overdue';
  else if((remHrs!=null&&remHrs<=soonH)||(remDays!=null&&remDays<=(it.soonDays||30)))st='soon';
  return {dueHrs,remHrs,dueDate,remDays,st,pct:Math.max(0,Math.min(1,pct))};
};
VA.remText=function(d){
  const p=[];
  if(d.remHrs!=null)p.push(d.remHrs<0?`${h1(-d.remHrs)} h over`:`${h1(d.remHrs)} h`);
  if(d.remDays!=null)p.push(d.remDays<0?`${-d.remDays} d over`:`${d.remDays} d`);
  return p.join(' · ')||'—';
};
VA.status=function(acId,asOfDate){
  const items=VA.itemsOf(acId).map(i=>({it:i,d:VA.itemDue(i,asOfDate)}));
  const reasons=[];
  items.forEach(x=>{if(x.d.st==='overdue'&&x.it.required)reasons.push({kind:'item',text:`${x.it.name} overdue (${VA.remText(x.d)})`,ref:x.it.ref,id:x.it.id})});
  S.squawks.filter(q=>q.ac===acId&&q.status==='open'&&q.grounding).forEach(q=>reasons.push({kind:'squawk',text:`Grounding squawk: ${q.title}`,ref:'Reported '+fmtShort(q.date)+' by '+VA.person(q.by).name,id:q.id}));
  const soon=items.filter(x=>x.d.st==='soon'||(x.d.st==='overdue'&&!x.it.required));
  const code=reasons.length?'bad':soon.length?'warn':'ok';
  const label={bad:'Grounded',warn:'Due Soon',ok:'Airworthy'}[code];
  const sorted=items.slice().sort((a,b)=>urg(a.d)-urg(b.d));
  return {code,label,reasons,soon,items:sorted};
};
function urg(d){ // lower = more urgent, normalized to "days-equivalent"
  const h=d.remHrs!=null?d.remHrs*3:Infinity, dd=d.remDays!=null?d.remDays:Infinity;return Math.min(h,dd)}
VA.urg=urg;
VA.pillCls=st=>({overdue:'bad',soon:'warn',ok:'ok'}[st]);

/* ---------- costs (from the expense ledger) ---------- */
VA.CATS=[
 ['fuel','Fuel & oil','V','fuel'],['mx_sched','Scheduled maintenance','V','mx'],['mx_unsched','Unscheduled maintenance / squawks','V','mx'],['parts','Parts','V','mx'],['reserves','Engine / prop reserves','V','mx'],
 ['fees','Landing / ramp / FBO fees','V','other'],['catering','Catering','V','other'],['travel','Crew travel','V','other'],['other','Other','V','other'],
 ['avionics','Avionics / subscriptions','F','fixed'],['hangar','Hangar / tiedown','F','fixed'],['insurance','Insurance','F','fixed'],['crew','Crew salaries & contract pilots','F','fixed'],['training','Training / recurrent','F','fixed'],
 ['taxes','Taxes & registration','F','fixed'],['mgmt','Management fees','F','fixed'],['finance','Financing / lease','F','fixed'],['depr','Depreciation (optional)','F','fixed']];
VA.cat=id=>{const c=VA.CATS.find(x=>x[0]===id)||VA.CATS.find(x=>x[0]==='other');return {id:c[0],name:c[1],fv:c[2],group:c[3]}};
VA.agg={};
function emptyAgg(){return {byCat:{},hrs:0,flights:0,days:new Set()}}
VA.aggAdd=x=>{if(x.date<addDays(todayISO(),-365))return;const g=VA.agg[x.ac]||(VA.agg[x.ac]=emptyAgg());g.byCat[x.cat]=(g.byCat[x.cat]||0)+x.amount};
VA.aggFlight=f=>{if(f.date<addDays(todayISO(),-365))return;const g=VA.agg[f.ac]||(VA.agg[f.ac]=emptyAgg());g.hrs+=f.hrs;g.flights++;g.days.add(f.date)};
VA.refreshAgg=async function(){
  const from=addDays(todayISO(),-365),to=todayISO();
  const [ex,fl]=await Promise.all([DAL.scanExpenses({from,to}),DAL.flightsIn({from,to})]);
  VA.agg={};ex.forEach(VA.aggAdd);fl.forEach(VA.aggFlight);
};
/* summarize an expense list + flights (used by Costs and TCO) */
VA.summarize=function(expenses,flights,includeDepr){
  const byCat={};let fixed=0,variable=0,fuel=0,mx=0,other=0;
  expenses.forEach(x=>{if(x.cat==='depr'&&!includeDepr)return;byCat[x.cat]=(byCat[x.cat]||0)+x.amount;const c=VA.cat(x.cat);
    if(c.fv==='F')fixed+=x.amount;else{variable+=x.amount;if(c.group==='fuel')fuel+=x.amount;else if(c.group==='mx')mx+=x.amount;else other+=x.amount}});
  const hrs=flights.reduce((t,f)=>t+(f.hrs||0),0),trips=new Set(flights.map(f=>f.ac+'|'+f.date)).size;
  return {byCat,fixed,variable,fuel,mx,other,total:fixed+variable,hrs,trips,legs:flights.length,
    perHr:hrs?(fixed+variable)/hrs:0,varPerHr:hrs?variable/hrs:0,perTrip:trips?(fixed+variable)/trips:0};
};
VA.costs=function(acId){
  const g=VA.agg[acId]||emptyAgg(),inc=!!S.includeDepr;let fixed=0,fuel=0,mx=0,other=0;const mxTotal=0;
  Object.entries(g.byCat).forEach(([k,v])=>{if(k==='depr'&&!inc)return;const c=VA.cat(k);if(c.fv==='F')fixed+=v;else if(c.group==='fuel')fuel+=v;else if(c.group==='mx')mx+=v;else other+=v});
  const hrs=Math.max(1,g.hrs);
  return {fuel:fuel/hrs,mx:mx/hrs,other:other/hrs,fixed:fixed/hrs,total:(fuel+mx+other+fixed)/hrs,variable:(fuel+mx+other)/hrs,
    fuelTotal:fuel,mxTotal:mx,otherTotal:other,fixedTotal:fixed,hrs:g.hrs,annual:fuel+mx+other+fixed,byCat:g.byCat,trips:g.days.size};
};
VA.addExpense=async function(x){x.id=x.id||uid('x');x.amount=Math.round(x.amount*100)/100;await DAL.putExpenses([x]);VA.aggAdd(x);return x};

/* ---------- mutations ---------- */
VA.addFlight=function(f){
  const a=VA.ac(f.ac);const before=VA.status(f.ac).items.filter(x=>x.d.remHrs!=null).map(x=>({id:x.it.id,name:x.it.name,rem:x.d.remHrs}));
  a.tt=Math.round((a.tt+f.hrs)*10)/10; a.hrs12=Math.round((a.hrs12+f.hrs)*10)/10;
  const e=flightEntry({...f,id:uid('l')});if(f.eng)e.eng=f.eng;if(f.garmin)e.garmin=f.garmin;
  const fx=VA.fuelExpense(a,e,f.src==='Manual'?'flight':f.src||'flight');if(f.fuelGal){fx.qty=f.fuelGal;fx.amount=Math.round(f.fuelGal*a.fuelPrice*100)/100;fx.notes='Auto-created from logged flight · fuel used from engine data'}
  VA.lastFlightId=e.id;VA.lastFuel=fx;
  VA.pendingWrite=Promise.all([DAL.addLogs([e]),DAL.putExpenses([fx])]);VA.aggFlight(e);VA.aggAdd(fx);
  save();
  const after=VA.status(f.ac).items;return before.map(b=>({...b,after:after.find(x=>x.it.id===b.id).d.remHrs}));
};
VA.checkBooking=function(b){
  const out={blocked:false,reasons:[],warnings:[]};
  const a=VA.ac(b.ac); if(!a)return out;
  const isMx=b.purpose==='Maintenance';
  const st=VA.status(b.ac);
  if(!isMx&&st.reasons.length){out.blocked=true;out.reasons=st.reasons.map(r=>r.text)}
  // calendar items expiring by the booking date
  if(!isMx)VA.itemsOf(b.ac).filter(i=>i.required).forEach(i=>{const d=VA.itemDue(i);if(d.dueDate&&d.remDays>=0&&d.dueDate<b.date&&!out.reasons.some(r=>r.startsWith(i.name))){out.blocked=true;out.reasons.push(`${i.name} expires ${fmtShort(d.dueDate)} — before this flight`)}});
  // hours warnings
  if(!isMx&&!out.blocked)st.items.forEach(x=>{if(x.it.required&&x.d.remHrs!=null&&x.d.remHrs>=0&&x.d.remHrs<b.dur*1.5)out.warnings.push(`${x.it.name}: only ${h1(x.d.remHrs)} h remaining`)});
  // conflicts
  const end=b.start+b.dur;
  const clash=S.bookings.find(o=>o.id!==b.id&&o.ac===b.ac&&o.date===b.date&&o.start<end&&b.start<o.start+o.dur);
  if(clash){out.blocked=true;out.reasons.push(`Conflicts with ${VA.person(clash.pilot).name}'s ${clash.purpose.toLowerCase()} ${clash.start}:00–${clash.start+clash.dur}:00`)}
  if(end>24){out.blocked=true;out.reasons.push('Booking runs past midnight')}
  return out;
};
VA.resolveSquawk=function(id,fix,cost){
  const q=S.squawks.find(x=>x.id===id);const me=VA.me();
  Object.assign(q,{status:'resolved',fix,signedBy:me.name,cert:'A&P/IA #3412987 (demo)',fixDate:todayISO()});
  VA.pendingWrite=DAL.addLogs([{id:uid('l'),ac:q.ac,date:todayISO(),type:'Maintenance',text:`Squawk "${q.title}": ${fix}`,by:me.name+', A&P/IA'}]);
  if(cost>0)VA.addExpense({ac:q.ac,date:todayISO(),cat:'mx_unsched',vendor:'Prentice Aviation Services (demo)',desc:'Squawk: '+q.title,qty:1,unit:'job',unitPrice:cost,amount:cost,receipt:'',paidBy:'Invoice',notes:'Auto-created from squawk sign-off',src:'signoff',ref:q.id});
  save();
};
VA.signOffItem=function(id,cost){
  const it=S.items.find(x=>x.id===id),a=VA.ac(it.ac),me=VA.me();
  it.lastHrs=it.intHrs?a.tt:it.lastHrs; it.lastDate=todayISO(); delete it.targetDate;
  if(!it.intHrs&&!it.intMo){it.complied=true}
  it.verified={by:me.name,cert:'A&P/IA #3412987 (demo)',date:todayISO()};
  VA.pendingWrite=DAL.addLogs([{id:uid('l'),ac:it.ac,date:todayISO(),type:it.cat==='Inspection'?'Inspection':'Maintenance',text:`${it.name} complied with (${it.ref}) at ${h1(a.tt)} h TT. Returned to service.`,by:me.name+', A&P/IA'}]);
  if(cost>0)VA.addExpense({ac:it.ac,date:todayISO(),cat:'mx_sched',vendor:'Prentice Aviation Services (demo)',desc:it.name+' ('+it.ref+')',qty:1,unit:'job',unitPrice:cost,amount:cost,receipt:'',paidBy:'Invoice',notes:'Auto-created from maintenance sign-off',src:'signoff',ref:it.id});
  save();
};

/* ---------- toasts & modal ---------- */
function toast(msg,kind=''){const t=document.createElement('div');t.className='toast '+kind;t.innerHTML=msg;const box=$('#toasts');box.appendChild(t);while(box.children.length>3)box.firstChild.remove();setTimeout(()=>{t.style.transition='opacity .3s';t.style.opacity=0;setTimeout(()=>t.remove(),300)},3600)}
VA.toast=toast;
/* inline field validation: marks the field, shows a message under it, focuses it, and announces via toast */
VA.invalid=function(input,msg){if(!input)return VA.toast(msg,'bad');input.classList.add('invalid');input.setAttribute('aria-invalid','true');
  const lab=input.closest('label')||input.parentElement;let m=lab.querySelector('.field-err');if(!m){m=document.createElement('span');m.className='field-err';m.setAttribute('role','alert');lab.appendChild(m)}m.textContent=msg;
  input.focus();const clear=()=>{input.classList.remove('invalid');input.removeAttribute('aria-invalid');m.remove();input.removeEventListener('input',clear);input.removeEventListener('change',clear)};input.addEventListener('input',clear);input.addEventListener('change',clear);VA.toast(VA.esc(msg),'bad');return false};
VA.modal=function(title,body,foot,onMount){
  const root=$('#modalRoot');
  root.innerHTML=`<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${title}</h3><button class="x" data-close aria-label="Close">×</button></header><div class="mb">${body}</div>${foot?`<footer>${foot}</footer>`:''}</div></div>`;
  const bg=$('.modal-bg',root);
  bg.addEventListener('click',e=>{if(e.target===bg||e.target.closest('[data-close]'))VA.closeModal()});
  onMount&&onMount($('.modal',root));
  VA._modalReturn=VA._modalReturn||document.activeElement;
  const f=$('.mb input:not([type=file]):not([hidden]),.mb select,.mb textarea',root)||$('footer .primary',root)||$('[data-close]',root);f&&setTimeout(()=>f.focus({preventScroll:true}),30);
};
VA.closeModal=()=>{const r=$('#modalRoot');if(!r.innerHTML)return;r.innerHTML='';const back=VA._modalReturn;VA._modalReturn=null;if(back&&document.contains(back)&&back.focus)back.focus({preventScroll:true})};
document.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const m=document.querySelector('#modalRoot .modal');if(!m)return;const els=[...m.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);if(!els.length)return;const a=els[0],z=els[els.length-1];if(e.shiftKey&&document.activeElement===a){z.focus();e.preventDefault()}else if(!e.shiftKey&&document.activeElement===z){a.focus();e.preventDefault()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')VA.closeModal()});

/* ---------- icons ---------- */
const I={
  fleet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16l20-6-3-2-6 2-6-6H5l3 7-4 1-2-2H0z" transform="translate(1 1)"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  log:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="10"/></svg>',
  sq:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
  cost:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  wrench:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.6-2.4a4 4 0 0 0-5-5L3 11l8-8z" transform="scale(.9) translate(1 1)"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/></svg>',
  plane:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>',
  card:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>',
  pulse:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-8 4 16 3-8h6"/></svg>',
  receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
  plug:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/></svg>',
  sync:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h-4M6 22v-4h4"/></svg>'
};
VA.I=I;
VA.iaBadge=v=>v?`<span class="ia" title="Verified by ${esc(v.by)}, ${esc(v.cert)} on ${fmtDate(v.date)}">${I.shield}IA verified</span>`:`<span class="chip">Unverified</span>`;
VA.demoN=()=>`<span class="demo-n" title="Fictitious demo registration">DEMO</span>`;

/* ---------- nav / routing ---------- */
const NAV=[
  {h:'fleet',label:'Fleet',icon:'plane',roles:['owner','pilot','mechanic']},
  {h:'schedule',label:'Schedule',icon:'cal',roles:['owner','pilot','mechanic']},
  {h:'log',label:'Log flight',icon:'log',roles:['owner','pilot']},
  {h:'import',label:'SD card import',icon:'sync',roles:['owner','pilot','mechanic']},
  {h:'maintenance',label:'Maintenance',icon:'wrench',roles:['owner','mechanic']},
  {h:'squawks',label:'Squawks',icon:'sq',roles:['owner','pilot','mechanic']},
  {h:'engine',label:'Engine trends',icon:'pulse',roles:['owner','pilot','mechanic']},
  {h:'costs',label:'Costs',icon:'cost',roles:['owner']},
  {h:'integrations',label:'Integrations',icon:'plug',roles:['owner','mechanic']},
  {h:'settings',label:'Data sources',icon:'sync',roles:['owner','mechanic']},
  {h:'plans',label:'Plans',icon:'card',roles:['owner']}
];
VA.canSee=h=>{const n=NAV.find(x=>x.h===h);return !n||n.roles.includes(S.role)};
function renderChrome(cur){
  const open=S.squawks.filter(q=>q.status==='open').length;
  const items=NAV.filter(n=>n.roles.includes(S.role));
  const link=(n,mob)=>`<a href="#/${n.h}" class="${cur===n.h?'active':''}" ${cur===n.h?'aria-current="page"':''} data-nav="${n.h}">${I[n.icon]}<span>${mob&&n.h==='log'?'Log':n.label}</span>${n.h==='squawks'&&open?`<span class="badge">${open}</span>`:''}</a>`;
  $('#nav').innerHTML=items.map(n=>link(n)).join('');
  const prim=items.slice(0,4),more=items.slice(4);const inMore=more.some(n=>n.h===cur);
  $('#tabbar').innerHTML=prim.map(n=>link(n,1)).join('')+(more.length?`<a href="javascript:void 0" id="moreTab" class="${inMore?'active':''}"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg><span>More</span></a>`:'');
  const mt=$('#moreTab');if(mt)mt.onclick=()=>VA.modal('More',`<div class="nav">${more.map(n=>link(n)).join('')}</div>`,'',m=>$$('a',m).forEach(x=>x.addEventListener('click',()=>VA.closeModal())));
  $$('#roles button').forEach(b=>b.classList.toggle('on',b.dataset.role===S.role));
  const me=VA.me();$('#who').innerHTML=`<div class="avatar">${me.initials}</div><div><b>${esc(me.name)}</b>${esc(me.title)}</div>`;
}
function route(){if(!S)return;
  const raw=location.hash.replace(/^#\/?/,'')||'fleet';const [path,qs]=raw.split('?');
  VA.query=new URLSearchParams(qs||'');
  const parts=(path||'fleet').split('/');
  let view=parts[0];
  if(!VA.views[view])view='fleet';
  if(!VA.canSee(view)){location.hash='#/fleet';return}
  renderChrome(view==='aircraft'?'fleet':view);
  const v=$('#view');v.style.animation='none';v.offsetHeight;v.style.animation='';
  const t0=performance.now();
  const res=VA.views[view](v,parts.slice(1));
  VA.lastRender={view,ms:performance.now()-t0};
  const pf=document.createElement('div');pf.className='perf';pf.id='perf';pf.textContent=`⚡ rendered in ${VA.lastRender.ms.toFixed(1)} ms · ${S.aircraft.length} aircraft · ${S.items.length.toLocaleString()} due items${VA.logCount!=null?' · '+VA.logCount.toLocaleString()+' logbook entries':''}`;v.appendChild(pf);
  $('#pageTitle').textContent=res&&res.title||'';
  document.title=(res&&res.title?res.title+' · ':'')+'Valkyr Aero';
}
VA.route=route;
VA.go=h=>{if(location.hash==='#/'+h)route();else location.hash='#/'+h};
window.addEventListener('hashchange',()=>{route();window.scrollTo(0,0)});
document.addEventListener('DOMContentLoaded',()=>{
  $('#roles').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;S.role=b.dataset.role;save();
    const me=VA.me();toast(`Viewing as <b>${esc(me.name)}</b> · ${esc(me.title)}`);route()});
  $('#resetBtn').addEventListener('click',()=>{if(confirm('Reset all demo data?'))VA.reset()});
  $('#largeBtn').addEventListener('click',()=>VA.toggleLarge());
  boot();
});
async function boot(){
  const t0=performance.now();
  const step=x=>{window.__bootStep=x};step('init');
  try{await DAL.init();step('state');S=await DAL.getState();step('seed?');if(!S||S.v!==2)await VA.seedStandard()}
  catch(e){console.error(e);$('#view').innerHTML='<div class="empty">This browser blocked IndexedDB storage. Try a normal (non-private) window.</div>';return}
  VA.dirty();
  step('count');VA.logCount=await DAL.countLogs();
  step('faa');if(VA.faa)await VA.faa.init();
  step('agg');await VA.refreshAgg();step('route');
  VA.bootMs=performance.now()-t0;
  document.body.classList.remove('booting');
  VA.syncLargeBtn&&VA.syncLargeBtn();
  route();VA.ready=true;
}
