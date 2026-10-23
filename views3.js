/* Valkyr360 — Expenses ledger, TCO report, Engine trends, Integrations / avionics import, Add aircraft */
(function(){
const {$,$$,esc,h1,money,fmtDate,fmtShort,todayISO,addDays,addMonths,uid,I}=VA;
const S=()=>VA.state();const V=VA.views;const role=()=>S().role;
const acOpts=(sel,all)=>(all?`<option value="">${all}</option>`:'')+S().aircraft.map(a=>`<option value="${a.id}" ${a.id===sel?'selected':''}>${esc(a.tail)} — ${esc(a.short)}</option>`).join('');
const catOpts=sel=>VA.CATS.map(c=>`<option value="${c[0]}" ${c[0]===sel?'selected':''}>${esc(c[1])} (${c[2]==='F'?'fixed':'variable'})</option>`).join('');
const m2=n=>'$'+(Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

/* ================= EXPENSES ================= */
const EXP_FILTERS=()=>[{id:'ac',label:'Aircraft',opts:[['','All aircraft'],...S().aircraft.map(a=>[a.id,a.tail])]},
  {id:'cat',label:'Category',opts:[['','All categories'],['F','— Fixed only'],['V','— Variable only'],...VA.CATS.map(c=>[c[0],c[1]])]},
  {id:'from',label:'From',type:'date'},{id:'to',label:'To',type:'date'}];
const catParam=v=>v==='F'||v==='V'?VA.CATS.filter(c=>c[2]===v).map(c=>c[0]).join('|'):v||undefined;
V.expenses=function(el){
  el.innerHTML=`<div class="row" style="margin-bottom:14px"><div class="spacer"><div class="small muted">Itemized ledger · fuel auto-created from flights · maintenance from sign-offs <span class="demo-n">DEMO DATA</span></div><div style="font-size:15px;margin-top:2px" id="expSum">…</div></div>
    <button class="btn primary" id="addExp">+ Add expense</button><label class="btn" style="cursor:pointer">Import CSV<input type="file" id="expImp" accept=".csv" hidden></label><button class="btn" id="expExport">Export CSV</button></div>
    <div id="expImpBox"></div><div id="expList"></div>`;
  let lastQ=null;if(VA.costAc!=null){VA.listState.exp=VA.listState.exp||{q:'',f:{},sort:'date_desc',page:0,size:25};if((VA.listState.exp.f.ac||'')!==VA.costAc){VA.listState.exp.f.ac=VA.costAc;VA.listState.exp.page=0}}
  const lc=VA.list($('#expList',el),{id:'exp',pageSize:25,sizes:[25,50,100],placeholder:'Search vendor, description, notes…',filters:EXP_FILTERS(),
    sorts:[['date_desc','Newest'],['date_asc','Oldest'],['amount_desc','Amount ↓'],['amount_asc','Amount ↑']],
    fetch:async({q,f,sort,offset,limit})=>{VA.costAc=f.ac||'';lastQ={ac:f.ac||undefined,cat:catParam(f.cat),from:f.from||undefined,to:f.to||undefined,q};const r=await DAL.queryExpenses({...lastQ,sort,offset,limit});
      const sm=$('#expSum',el);if(sm)sm.innerHTML=`<b class="mono">${m2(r.sum)}</b> <span class="muted">across ${r.total.toLocaleString()} matching expenses</span>`;return r},
    render:rs=>`<div class="tbl"><div class="tbl-scroll"><table><thead><tr><th>Date</th><th>Tail</th><th>Category</th><th class="hide-m">Vendor</th><th>Description</th><th class="hide-m">Qty</th><th style="text-align:right">Amount</th><th class="hide-m">Receipt</th><th class="hide-m">Paid by</th></tr></thead><tbody>
      ${rs.map(x=>{const c=VA.cat(x.cat);return `<tr data-exp="${x.id}" style="cursor:pointer"><td class="mono small">${esc(x.date)}</td><td class="mono" style="font-weight:700">${esc(VA.ac(x.ac)?.tail||'?')}</td><td><span class="chip">${c.fv}</span> <span class="small">${esc(c.name)}</span></td><td class="hide-m small">${esc(x.vendor)}</td><td class="small">${esc(x.desc)}${x.src&&x.src!=='seed'&&x.src!=='manual'?` <span class="chip" style="color:var(--accent)">${esc(x.src==='flight'||x.src==='Garmin SD card'?'auto · flight':x.src==='signoff'?'auto · sign-off':x.src)}</span>`:''}</td><td class="hide-m mono small">${x.unit&&x.unit!=='ea'?`${x.qty} ${esc(x.unit)} @ ${m2(x.unitPrice)}`:''}</td><td class="mono" style="text-align:right">${m2(x.amount)}</td><td class="hide-m small">${x.receipt?'📎':''}</td><td class="hide-m small muted">${esc(x.paidBy||'')}</td></tr>`}).join('')}</tbody></table></div></div>`,
    after:b=>$$('[data-exp]',b).forEach(r=>r.onclick=async()=>VA.expenseForm(await DAL.getExpense(r.dataset.exp),()=>lc.redraw()))});
  $('#addExp',el).onclick=()=>VA.expenseForm(null,()=>lc.redraw());
  $('#expExport',el).onclick=async()=>{const r=await DAL.queryExpenses({...(lastQ||{}),sort:'date_asc',limit:1e9});
    const rows=[['date','tail','category','fixed_variable','vendor','description','quantity','unit','unit_price','amount','receipt','paid_by','notes','source']].concat(r.rows.map(x=>{const c=VA.cat(x.cat);return [x.date,VA.ac(x.ac)?.tail,c.name,c.fv,x.vendor,x.desc,x.qty,x.unit,x.unitPrice,x.amount.toFixed(2),x.receipt,x.paidBy,x.notes,x.src]}));
    VA.download(`valkyr-expenses-${todayISO()}.csv`,VA.toCSV(rows));VA.toast(`Exported ${r.rows.length.toLocaleString()} expenses`,'ok')};
  $('#expImp',el).onchange=e=>{const f=e.target.files[0];if(f)f.text().then(t=>VA.previewImport(t,f.name,$('#expImpBox',el))).then(()=>{const b=$('#expImpBox',el);b.addEventListener('click',ev=>{if(ev.target.id==='cGo')setTimeout(()=>lc.redraw(),400)})})};
  return {title:'Expenses'};
};
VA.expenseForm=function(x,onDone){
  const isNew=!x;x=x||{date:todayISO(),ac:S().aircraft[0].id,cat:'fuel',vendor:'',desc:'',qty:1,unit:'ea',unitPrice:0,amount:0,paidBy:'Company card',receipt:'',notes:'',src:'manual'};
  VA.modal(isNew?'Add expense':'Edit expense',`<form class="form" id="xf" onsubmit="return false">
    <label class="f">Date<input type="date" name="date" value="${esc(x.date)}"></label><label class="f">Aircraft<select name="ac">${acOpts(x.ac)}</select></label>
    <label class="f full">Category<select name="cat">${catOpts(x.cat)}</select></label>
    <label class="f">Vendor<input name="vendor" value="${esc(x.vendor)}" placeholder="KM02 FBO"></label><label class="f">Paid by<input name="paidBy" value="${esc(x.paidBy||'')}"></label>
    <label class="f full">Description<input name="desc" value="${esc(x.desc)}" placeholder="Jet A uplift"></label>
    <label class="f">Quantity<input name="qty" type="number" step="any" value="${x.qty}"></label><label class="f">Unit<input name="unit" value="${esc(x.unit)}" placeholder="gal, h, ea"></label>
    <label class="f">Unit price ($)<input name="unitPrice" type="number" step="any" value="${x.unitPrice}"></label><label class="f">Amount ($)<input name="amount" type="number" step="0.01" value="${x.amount}"></label>
    <label class="f full">Receipt<span class="row"><input type="file" name="receipt" accept="image/*,.pdf" style="flex:1"><button class="btn sm" type="button" id="scanR">Simulate receipt scan</button></span><span class="small dim" id="rName">${esc(x.receipt||'No receipt attached')}</span></label>
    <label class="f full">Notes<input name="notes" value="${esc(x.notes||'')}"></label></form>`,
   `${isNew?'':'<button class="btn danger" id="xDel">Delete</button><span class="spacer"></span>'}<button class="btn" data-close>Cancel</button><button class="btn primary" id="xSave">${isNew?'Add expense':'Save'}</button>`,m=>{
    const f=$('#xf',m);const calc=()=>{const q=parseFloat(f.qty.value),p=parseFloat(f.unitPrice.value);if(q>0&&p>0)f.amount.value=(q*p).toFixed(2)};
    f.qty.oninput=calc;f.unitPrice.oninput=calc;let receipt=x.receipt;
    f.receipt.onchange=()=>{receipt=f.receipt.files[0]?f.receipt.files[0].name:'';$('#rName',m).textContent=receipt};
    $('#scanR',m).onclick=()=>{receipt='scan-'+Date.now().toString(36)+'.jpg (simulated)';if(!f.vendor.value)f.vendor.value='KM02 FBO (demo)';$('#rName',m).textContent=receipt+' · OCR filled vendor (simulated)'};
    $('#xSave',m).onclick=async()=>{const amt=parseFloat(f.amount.value);if(!(amt>0)){VA.invalid(f.amount,'Enter an amount greater than $0');return}if(!f.date.value){VA.invalid(f.date,'Pick the expense date');return}
      const y={...x,date:f.date.value,ac:f.ac.value,cat:f.cat.value,vendor:f.vendor.value.trim(),desc:f.desc.value.trim(),qty:parseFloat(f.qty.value)||1,unit:f.unit.value.trim()||'ea',unitPrice:parseFloat(f.unitPrice.value)||amt,amount:Math.round(amt*100)/100,paidBy:f.paidBy.value.trim(),notes:f.notes.value.trim(),receipt};
      if(isNew)await VA.addExpense(y);else{await DAL.putExpenses([y]);await VA.refreshAgg()}
      VA.closeModal();VA.toast(isNew?`Expense added · ${m2(y.amount)}`:'Expense updated','ok');onDone&&onDone()};
    const d=$('#xDel',m);if(d)d.onclick=async()=>{if(!confirm('Delete this expense?'))return;await DAL.deleteExpense(x.id);await VA.refreshAgg();VA.closeModal();VA.toast('Expense deleted');onDone&&onDone()};
  });
};

/* ================= TCO ================= */
function periodRange(p,cf,ct){const t=todayISO();const d=VA.parse(t);
  if(p==='month')return [t.slice(0,8)+'01',t];
  if(p==='quarter'){const q=Math.floor(d.getMonth()/3)*3;return [`${d.getFullYear()}-${String(q+1).padStart(2,'0')}-01`,t]}
  if(p==='ytd')return [`${d.getFullYear()}-01-01`,t];
  if(p==='custom')return [cf||addMonths(t,-3),ct||t];
  return [addDays(t,-365),t]}
V.tco=function(el){
  const s=S(),st=VA.tcoState=VA.tcoState||{ac:'',p:'12mo',from:'',to:''};if(VA.costAc!=null)st.ac=VA.costAc;
  const [from,to]=periodRange(st.p,st.from,st.to);
  el.innerHTML=`<div class="row no-print" style="margin-bottom:14px"><select id="tAc" style="width:auto">${acOpts(st.ac,'Whole fleet ('+s.aircraft.length+' aircraft)')}</select>
    <div class="seg" id="tP">${[['month','Month'],['quarter','Quarter'],['ytd','YTD'],['12mo','12 months'],['custom','Custom']].map(x=>`<button data-p="${x[0]}" class="${st.p===x[0]?'on':''}">${x[1]}</button>`).join('')}</div>
    ${st.p==='custom'?`<input type="date" id="tF" value="${from}" style="width:auto"><input type="date" id="tT" value="${to}" style="width:auto">`:''}
    <button class="switch ${s.includeDepr?'on':''}" id="tD"><span class="tr"></span>Depreciation</button><span class="spacer"></span><button class="btn" id="tCsv">Export CSV</button><button class="btn primary" id="tPrint">Print report</button></div>
  <div id="tcoBody"><div class="spinner"></div></div>`;
  $('#tAc',el).onchange=e=>{st.ac=VA.costAc=e.target.value;VA.route()};$$('#tP button',el).forEach(b=>b.onclick=()=>{st.p=b.dataset.p;VA.route()});
  const tf=$('#tF',el);if(tf){tf.onchange=()=>{st.from=tf.value;VA.route()};$('#tT',el).onchange=e=>{st.to=e.target.value;VA.route()}}
  $('#tD',el).onclick=()=>{s.includeDepr=!s.includeDepr;VA.save();VA.route()};$('#tPrint',el).onclick=()=>window.print();
  VA.tcoReport(st.ac,from,to).then(r=>{VA.lastTco=r;const b=$('#tcoBody',el);if(!b)return;b.innerHTML=tcoHTML(r);$('#tCsv',el).onclick=()=>exportTco(r)});
  return {title:'Total cost of operation'};
};
VA.tcoReport=async function(ac,from,to){
  const t0=performance.now();const s=S();
  const [ex,fl]=await Promise.all([DAL.scanExpenses({ac:ac||undefined,from,to}),DAL.flightsIn({ac:ac||undefined,from,to})]);
  const sum=VA.summarize(ex,fl,!!s.includeDepr);
  const days=VA.daysBetween(from,to)+1;const acs=ac?[ac]:s.aircraft.map(a=>a.id);
  const budget={};acs.forEach(id=>Object.entries((s.budgets||{})[id]||{}).forEach(([c,v])=>{if(c==='depr'&&!s.includeDepr)return;budget[c]=(budget[c]||0)+v*days/365}));
  const tEnd=to;const tStart=addMonths(tEnd.slice(0,8)+'01',-11);
  const [ex12,fl12]=await Promise.all([DAL.scanExpenses({ac:ac||undefined,from:tStart,to:tEnd}),DAL.flightsIn({ac:ac||undefined,from:tStart,to:tEnd})]);
  const months=[];for(let m=tStart;m<=tEnd;m=addMonths(m,1))months.push({m:m.slice(0,7),fixed:0,variable:0,hrs:0});
  ex12.forEach(x=>{if(x.cat==='depr'&&!s.includeDepr)return;const mo=months.find(z=>z.m===x.date.slice(0,7));if(mo)mo[VA.cat(x.cat).fv==='F'?'fixed':'variable']+=x.amount});
  fl12.forEach(f=>{const mo=months.find(z=>z.m===f.date.slice(0,7));if(mo)mo.hrs+=f.hrs||0});
  const per=ac?[]:s.aircraft.map(a=>({a,s:VA.summarize(ex.filter(x=>x.ac===a.id),fl.filter(f=>f.ac===a.id),!!s.includeDepr)})).sort((x,y)=>y.s.total-x.s.total);
  return {ac,from,to,days,sum,budget,months,per,ms:performance.now()-t0,rows:ex.length};
};
function tcoHTML(r){
  const s=r.sum,bTot=Object.values(r.budget).reduce((a,b)=>a+b,0);const a=r.ac?VA.ac(r.ac):null;
  const maxM=Math.max(...r.months.map(m=>m.fixed+m.variable),1);
  const cats=VA.CATS.filter(c=>s.byCat[c[0]]||r.budget[c[0]]);
  const varCell=(act,bud)=>{const v=act-bud,p=bud?v/bud*100:0;return `<td class="mono ${v>0?'bad-t':'ok-t'}" style="text-align:right">${bud?(v>0?'+':'')+money(v):'—'}</td><td class="mono small ${v>0?'bad-t':'ok-t'}" style="text-align:right">${bud?(p>0?'+':'')+p.toFixed(1)+'%':''}</td>`};
  return `<div class="print-head"><b>Valkyr360 · Total Cost of Operation</b> — ${a?esc(a.tail)+' '+esc(a.short):'Fleet'} · ${fmtDate(r.from)} – ${fmtDate(r.to)} · DEMO DATA</div>
  <div class="stats s6">
    <div class="stat"><div class="k">Total cost</div><div class="v">${money(s.total)}</div></div>
    <div class="stat"><div class="k">Flight hours</div><div class="v">${h1(s.hrs)}</div></div>
    <div class="stat"><div class="k">Fully loaded $/hr</div><div class="v">${money(s.perHr)}</div></div>
    <div class="stat"><div class="k">Variable $/hr</div><div class="v">${money(s.varPerHr)}</div></div>
    <div class="stat"><div class="k">Cost / trip</div><div class="v">${money(s.perTrip)}</div><div class="small muted">${s.trips} trips · ${s.legs} legs</div></div>
    <div class="stat"><div class="k">Fixed · variable</div><div class="v" style="font-size:16px">${money(s.fixed)}<br>${money(s.variable)}</div></div></div>
  <div class="two-col">
   <div class="tbl"><div class="tbl-scroll"><table><thead><tr><th>Category</th><th>Type</th><th style="text-align:right">Actual</th><th style="text-align:right">Budget</th><th style="text-align:right">Variance</th><th></th></tr></thead><tbody>
    ${cats.map(c=>`<tr><td>${esc(c[1])}</td><td><span class="chip">${c[2]}</span></td><td class="mono" style="text-align:right">${money(s.byCat[c[0]]||0)}</td><td class="mono muted" style="text-align:right">${r.budget[c[0]]?money(r.budget[c[0]]):'—'}</td>${varCell(s.byCat[c[0]]||0,r.budget[c[0]]||0)}</tr>`).join('')}
    <tr><td><b>Total</b></td><td></td><td class="mono" style="text-align:right"><b>${money(s.total)}</b></td><td class="mono" style="text-align:right">${money(bTot)}</td>${varCell(s.total,bTot)}</tr></tbody></table></div>
   <div class="card"><h2>Monthly trend · 12 months to ${fmtShort(r.to)}</h2>
    <svg viewBox="0 0 400 190" style="width:100%;height:auto" role="img" aria-label="Monthly cost trend">
     ${r.months.map((m,i)=>{const x=10+i*32.5,hf=m.fixed/maxM*140,hv=m.variable/maxM*140;return `<rect x="${x}" y="${160-hf-hv}" width="22" height="${hv}" fill="var(--c1)" rx="2"><title>${m.m}: variable ${money(m.variable)}</title></rect><rect x="${x}" y="${160-hf}" width="22" height="${hf}" fill="var(--c3)" rx="2"><title>${m.m}: fixed ${money(m.fixed)}</title></rect><text x="${x+11}" y="174" font-size="8" text-anchor="middle" fill="var(--muted)">${m.m.slice(5)}</text><text x="${x+11}" y="185" font-size="7" text-anchor="middle" fill="var(--dim)">${Math.round(m.hrs)}h</text>`}).join('')}
    </svg><div class="legend"><span style="--c:var(--c3)"><i></i>Fixed</span><span style="--c:var(--c1)"><i></i>Variable</span><span class="dim">· hours flown under each bar</span></div></div></div>
  ${r.per.length?`<h3 class="section-h">By aircraft</h3><div class="tbl"><div class="tbl-scroll"><table><thead><tr><th>Tail</th><th>Hours</th><th style="text-align:right">Fixed</th><th style="text-align:right">Variable</th><th style="text-align:right">Total</th><th style="text-align:right">$/hr loaded</th><th style="text-align:right">$/hr variable</th></tr></thead><tbody>
    ${r.per.map(({a,s})=>`<tr><td class="mono" style="font-weight:700">${esc(a.tail)} <span class="muted small" style="font-weight:400">${esc(a.short)}</span></td><td class="mono">${h1(s.hrs)}</td><td class="mono" style="text-align:right">${money(s.fixed)}</td><td class="mono" style="text-align:right">${money(s.variable)}</td><td class="mono" style="text-align:right">${money(s.total)}</td><td class="mono" style="text-align:right">${s.hrs?money(s.perHr):'—'}</td><td class="mono" style="text-align:right">${s.hrs?money(s.varPerHr):'—'}</td></tr>`).join('')}</tbody></table></div></div>`:''}
  <p class="small dim" style="margin-top:12px">${r.rows.toLocaleString()} ledger rows aggregated in ${r.ms.toFixed(0)} ms. Budgets are annual demo budgets prorated to ${r.days} days. Trip = a day with at least one flight on an aircraft.</p>`;
}
function exportTco(r){
  const s=r.sum;const rows=[['Valkyr360 TCO (DEMO DATA)'],['scope',r.ac?VA.ac(r.ac).tail:'fleet'],['from',r.from],['to',r.to],[],['category','fixed_variable','actual','budget','variance']];
  VA.CATS.filter(c=>s.byCat[c[0]]||r.budget[c[0]]).forEach(c=>rows.push([c[1],c[2],(s.byCat[c[0]]||0).toFixed(2),(r.budget[c[0]]||0).toFixed(2),((s.byCat[c[0]]||0)-(r.budget[c[0]]||0)).toFixed(2)]));
  rows.push([],['total',s.total.toFixed(2)],['fixed',s.fixed.toFixed(2)],['variable',s.variable.toFixed(2)],['flight_hours',s.hrs.toFixed(1)],['cost_per_hour_loaded',s.perHr.toFixed(2)],['cost_per_hour_variable',s.varPerHr.toFixed(2)],['trips',s.trips],['cost_per_trip',s.perTrip.toFixed(2)]);
  if(r.per.length){rows.push([],['tail','hours','fixed','variable','total','per_hour_loaded','per_hour_variable']);r.per.forEach(({a,s})=>rows.push([a.tail,s.hrs.toFixed(1),s.fixed.toFixed(2),s.variable.toFixed(2),s.total.toFixed(2),s.perHr.toFixed(2),s.varPerHr.toFixed(2)]))}
  rows.push([],['month','fixed','variable','hours']);r.months.forEach(m=>rows.push([m.m,m.fixed.toFixed(2),m.variable.toFixed(2),m.hrs.toFixed(1)]));
  VA.download(`valkyr-tco-${r.from}-${r.to}.csv`,VA.toCSV(rows));VA.toast('TCO CSV exported','ok');
}

/* ================= ENGINE TRENDS ================= */
V.engine=function(el){
  const s=S();const ac=VA.query.get('ac')||VA.engAc||s.aircraft.find(a=>a.id==='sr22')?.id||s.aircraft[0].id;VA.engAc=ac;const a=VA.ac(ac);
  const turb=VA.isTurbine(a);const params=turb?['itt','ng','tq','oilT','oilP','ff']:['cht','egt','oilT','oilP','ff'];const L=VA.limitsFor(ac);
  el.innerHTML=`<div class="row" style="margin-bottom:14px"><select id="eAc" style="width:auto">${acOpts(ac)}</select><span class="chip">${turb?'Turbine':'Piston'} · ${esc(a.engines||'')}</span><span class="spacer"></span>
    <a class="btn" href="#/import">${I.sync} Import SD card / engine data</a></div>
  <div class="two-col"><div id="eCharts" class="grid"><div class="spinner"></div></div>
   <div class="grid"><div class="card"><h2>Limits · ${esc(a.short)}</h2><p class="small muted" style="margin-top:0">Demo starting values — enter the limits from your POH/AFM and engine manual. Exceedances create a <b>squawk draft</b> for mechanic review; only limits marked <b class="bad-t">grounding</b> ground the aircraft automatically.</p>
     <form id="limF" class="list" style="gap:8px">${params.filter(p=>L[p]||p!=='ff').map(p=>{const l=L[p]||{};const [nm,u]=VA.PARAMS[p];return `<div class="row" style="gap:8px;flex-wrap:nowrap"><span style="width:84px" class="small"><b>${nm}</b><br><span class="dim">${u}</span></span>
       <input type="number" step="any" placeholder="min" data-p="${p}" data-k="min" value="${l.min??''}" style="width:80px"><input type="number" step="any" placeholder="max" data-p="${p}" data-k="max" value="${l.max??''}" style="width:80px">
       <label class="small row" style="gap:4px;flex-wrap:nowrap"><input type="checkbox" data-p="${p}" data-k="grounding" ${l.grounding?'checked':''} style="width:16px;height:16px;accent-color:var(--bad)">grounding</label></div>`}).join('')}
     <button class="btn primary" type="button" id="limSave">Save limits</button></form></div>
    <div class="card"><h2>Exceedances · last 60 flights</h2><div id="eExc" class="list"></div></div></div></div>`;
  $('#eAc',el).onchange=e=>{VA.engAc=e.target.value;history.replaceState(null,'','#/engine?ac='+e.target.value);VA.route()};
  $('#limSave',el).onclick=()=>{const NL={};$$('#limF input[data-p]',el).forEach(i=>{const p=i.dataset.p;NL[p]=NL[p]||{};if(i.dataset.k==='grounding')NL[p].grounding=i.checked;else if(i.value!=='')NL[p][i.dataset.k]=parseFloat(i.value)});
    Object.keys(NL).forEach(p=>{if(NL[p].min==null&&NL[p].max==null)delete NL[p]});s.limits[ac]=NL;VA.save();VA.toast('Limits saved for '+esc(a.tail),'ok');VA.route()};
  DAL.queryLogs({ac,type:'Flight',limit:300}).then(({rows})=>{
    const fl=rows.filter(f=>f.eng).slice(0,60).reverse();const box=$('#eCharts',el);if(!box)return;
    if(!fl.length){box.innerHTML='<div class="empty">No engine data yet for this aircraft. Import an SD card or engine-monitor file.</div>';$('#eExc',el).innerHTML='';return}
    box.innerHTML=params.map(p=>chart(p,fl,L[p])).join('');
    const ex=[];fl.forEach(f=>Object.entries(L).forEach(([k,l])=>{const v=f.eng[k];if(v==null)return;if((l.max!=null&&v>l.max)||(l.min!=null&&v<l.min))ex.push({f,k,v,l})}));
    $('#eExc',el).innerHTML=ex.length?ex.reverse().map(x=>{const has=s.squawks.some(q=>q.flight===x.f.id&&q.title.includes(VA.PARAMS[x.k][0]));return `<div class="li"><div class="body"><div class="title">${VA.PARAMS[x.k][0]} ${x.v} ${VA.PARAMS[x.k][1]}</div><div class="meta">${fmtDate(x.f.date)} · ${esc(x.f.from)} → ${esc(x.f.to)} · limit ${x.l.max!=null?'max '+x.l.max:'min '+x.l.min}${x.l.grounding?' · grounding':''}</div></div>${has?'<span class="chip">Squawk drafted</span>':`<button class="btn sm" data-draft="${x.f.id}|${x.k}">Create squawk draft</button>`}</div>`}).join(''):'<div class="empty">No exceedances against current limits.</div>';
    $$('[data-draft]',el).forEach(b=>b.onclick=()=>{const [fid,k]=b.dataset.draft.split('|');const f=fl.find(x=>x.id===fid);VA.checkExceedances(ac,{[k]:f.eng[k]},f);VA.toast('Squawk draft created for mechanic review','ok');VA.route()});
  });
  return {title:'Engine trends'};
};
function chart(p,fl,l){
  const [nm,u]=VA.PARAMS[p];const vals=fl.map(f=>f.eng[p]).filter(v=>v!=null);if(!vals.length)return '';
  let lo=Math.min(...vals),hi=Math.max(...vals);if(l){if(l.max!=null)hi=Math.max(hi,l.max);if(l.min!=null)lo=Math.min(lo,l.min)}const pad=(hi-lo)*.12||5;lo-=pad;hi+=pad;
  const W=560,H=150,x=i=>30+i*(W-40)/Math.max(1,fl.length-1),y=v=>H-18-(v-lo)/(hi-lo)*(H-34);
  const pts=fl.map((f,i)=>f.eng[p]!=null?[x(i),y(f.eng[p]),f]:null).filter(Boolean);
  const bad=v=>l&&((l.max!=null&&v>l.max)||(l.min!=null&&v<l.min));
  const last=vals[vals.length-1],avg=vals.reduce((a,b)=>a+b,0)/vals.length;
  return `<div class="card" style="padding:14px 16px"><div class="row" style="margin-bottom:4px"><h2 style="margin:0">${nm} <span class="dim" style="text-transform:none;letter-spacing:0">${u} · per-flight ${p==='oilP'?'min':p==='ff'?'avg':'max'}</span></h2><span class="spacer"></span><span class="mono small">last ${last} · avg ${avg.toFixed(0)}</span></div>
   <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="${nm} trend">
    ${[0,.5,1].map(t=>{const v=lo+(hi-lo)*t;return `<line x1="30" x2="${W-10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="26" y="${y(v)+3}" font-size="9" text-anchor="end" fill="var(--dim)">${Math.round(v)}</text>`}).join('')}
    ${l&&l.max!=null?`<line x1="30" x2="${W-10}" y1="${y(l.max)}" y2="${y(l.max)}" stroke="var(--bad)" stroke-dasharray="5 4"/><text x="${W-12}" y="${y(l.max)-4}" font-size="9" text-anchor="end" fill="var(--bad)">limit ${l.max}${l.grounding?' · grounding':''}</text>`:''}
    ${l&&l.min!=null?`<line x1="30" x2="${W-10}" y1="${y(l.min)}" y2="${y(l.min)}" stroke="var(--bad)" stroke-dasharray="5 4"/><text x="${W-12}" y="${y(l.min)+11}" font-size="9" text-anchor="end" fill="var(--bad)">min ${l.min}</text>`:''}
    <polyline fill="none" stroke="var(--accent)" stroke-width="1.8" points="${pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ')}"/>
    ${pts.map(q=>`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${bad(q[2].eng[p])?4:2.2}" fill="${bad(q[2].eng[p])?'var(--bad)':'var(--accent)'}"><title>${q[2].date} ${esc(q[2].from)}→${esc(q[2].to)}: ${q[2].eng[p]} ${u}</title></circle>`).join('')}
    <text x="30" y="${H-3}" font-size="9" fill="var(--dim)">${fmtShort(fl[0].date)}</text><text x="${W-10}" y="${H-3}" font-size="9" text-anchor="end" fill="var(--dim)">${fmtShort(fl[fl.length-1].date)}</text></svg></div>`;
}

/* ================= SD CARD / AVIONICS IMPORT ================= */
V.import=function(el){
  el.innerHTML=`<div class="card" style="margin-bottom:16px"><div class="row"><div class="spacer"><h2 style="margin:0 0 4px">Import an SD card, USB stick or log files</h2><div class="small muted">Drop the whole card (folder or .zip) — we scan every file, skip databases/charts, split flights, and match each to an aircraft. Parsing runs in a background worker${VA.workerMode()?'':' (fallback: main thread)'}.</div></div><a class="btn sm" href="#/integrations">Supported avionics</a></div>
    <div class="drop" id="dz" style="margin-top:12px;text-align:center;padding:26px"><b>Drop files, a folder or a .zip here</b><div class="row" style="justify-content:center;margin-top:10px">
      <label class="btn primary" style="cursor:pointer">Choose files / .zip<input type="file" id="fFiles" multiple hidden></label><label class="btn" style="cursor:pointer">Choose SD card folder<input type="file" id="fDir" webkitdirectory directory multiple hidden></label></div></div>
    <div id="ingProg" style="display:none"><div class="prog"><i id="ingBar"></i></div><div class="small mono muted" id="ingTxt"></div></div></div>
  <div id="ingOut">${VA.lastIngest?'':'<div class="empty">Tip: demo cards live in <span class="mono">samples/</span> — try <span class="mono">samples/demo-sd-card.zip</span>.</div>'}</div>`;
  const run=async files=>{if(!files.length)return;$('#ingProg',el).style.display='';const bar=$('#ingBar',el),txt=$('#ingTxt',el);
    const r=await VA.ingest([...files],(p,n)=>{bar.style.width=(p*100)+'%';txt.textContent=`${Math.round(p*100)}% · ${n||''}`});
    txt.textContent=`Scanned ${r.files.length} files in ${(r.ms/1000).toFixed(2)} s`;renderIngest(r,$('#ingOut',el))};
  $('#fFiles',el).onchange=e=>run(e.target.files);$('#fDir',el).onchange=e=>run(e.target.files);
  const dz=$('#dz',el);dz.ondragover=e=>{e.preventDefault();dz.style.borderColor='var(--accent)'};dz.ondragleave=()=>dz.style.borderColor='';
  dz.ondrop=async e=>{e.preventDefault();dz.style.borderColor='';const files=[];const its=[...(e.dataTransfer.items||[])].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
    const walk=(en,path)=>new Promise(res=>{if(en.isFile)en.file(f=>{Object.defineProperty(f,'webkitRelativePath',{value:path+f.name});files.push(f);res()});else{const rd=en.createReader();const all=[];const rdAll=()=>rd.readEntries(es=>{if(!es.length){Promise.all(all.map(c=>walk(c,path+en.name+'/'))).then(res)}else{all.push(...es);rdAll()}});rdAll()}});
    if(its.length){for(const it of its)await walk(it,'');run(files)}else run(e.dataTransfer.files)};
  if(VA.lastIngest)renderIngest(VA.lastIngest,$('#ingOut',el));
  return {title:'SD card import'};
};
function renderIngest(r,box){
  const by=k=>r.files.filter(f=>f.status===k||(k==='ok'&&['verified','partial'].includes(f.status)&&f.sessions)).length;
  const sts={verified:'ok',partial:'warn','detect-only':'warn',unsupported:'bad',unknown:'bad',ignore:'',error:'bad'};
  box.innerHTML=`<div class="stats s4"><div class="stat"><div class="k">Files scanned</div><div class="v">${r.files.length}</div></div><div class="stat"><div class="k">Flights found</div><div class="v ok-t">${r.sessions.length}</div></div><div class="stat"><div class="k">Ignored</div><div class="v">${by('ignore')}</div></div><div class="stat"><div class="k">Unsupported</div><div class="v ${by('unknown')+by('unsupported')?'bad-t':''}">${by('unknown')+by('unsupported')+by('detect-only')}</div></div></div>
  <h3 class="section-h">Match &amp; confirm flights</h3>
  ${r.sessions.length?`<div class="tbl"><div class="tbl-scroll"><table id="sesT"><thead><tr><th></th><th>When</th><th>Source</th><th>Derived</th><th>Aircraft match</th><th>Confidence</th></tr></thead><tbody>
   ${r.sessions.map(s=>{const d=new Date(s.takeoff||s.start);const c=s.confidence;return `<tr data-ses="${s.id}"><td><input type="checkbox" class="sesOk" ${s.autoConfirm?'checked':''} style="width:18px;height:18px;accent-color:var(--accent)" aria-label="Confirm"></td>
    <td class="small"><b>${d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</b><br><span class="mono dim">${d.toTimeString().slice(0,5)}</span></td>
    <td class="small">${esc((VA.PARSERS.find(p=>p.id===s.format)||{}).name||s.format)}<br><span class="dim mono">${esc(s.files.map(f=>f.split('/').pop()).join(', '))}</span>${s.device.tail?`<br><span class="chip">tail ${esc(s.device.tail)}</span>`:''}${s.device.systemId?` <span class="chip">id ${esc(s.device.systemId)}</span>`:''}</td>
    <td class="small mono">air ${h1(s.airHrs)} h · hobbs ${h1(s.hobbs)}${s.tach!=null?' · tach '+h1(s.tach):''}<br>block ${h1(s.blockHrs)} h · ${s.landings} ldg · ${h1(s.fuelGal)} gal${s.trackOnly?'<br><span class="warn-t">track only — no engine data</span>':''}</td>
    <td><select class="sesAc" style="width:auto;min-width:170px"><option value="">— choose aircraft —</option>${S().aircraft.map(a=>`<option value="${a.id}" ${a.id===s.match?'selected':''}>${esc(a.tail)} — ${esc(a.short)}</option>`).join('')}</select><div class="small dim" style="margin-top:4px">${s.cands[0]?esc(s.cands[0].why.join(' · ')):'No match signals — choose manually'}</div></td>
    <td><span class="pill ${c>=90?'ok':c>=50?'warn':'bad'} plain mono">${c}%</span></td></tr>`}).join('')}</tbody></table></div></div>
   <div class="row" style="margin-top:12px"><span class="small muted spacer">Nothing is merged silently: only checked rows import. ≥90% with a clear winner is pre-checked; confirming teaches Valkyr the device → aircraft mapping.</span><button class="btn primary" id="sesGo">${I.sync} Import confirmed flights</button></div><div id="sesRes"></div>`:'<div class="empty">No flight sessions found in these files.</div>'}
  <h3 class="section-h">Files</h3><div class="tbl"><div class="tbl-scroll"><table><thead><tr><th>File</th><th>Detected format</th><th>Status</th><th>Notes</th></tr></thead><tbody>
   ${r.files.map(f=>`<tr data-file="${esc(f.name)}"><td class="mono small">${esc(f.name)}</td><td class="small">${esc(f.formatName)}</td><td><span class="pill ${sts[f.status]||''} plain">${esc(f.status==='unknown'?'unsupported':f.status)}</span></td><td class="small muted">${f.sessions?f.sessions+' flight session'+(f.sessions>1?'s':'')+(f.unverified&&f.unverified.length?' · <span class="warn-t">unverified columns: '+esc(f.unverified.join(', '))+'</span>':''):esc(f.reason||'')}</td></tr>`).join('')}</tbody></table></div></div>`;
  const go=box.querySelector('#sesGo');if(go)go.onclick=async()=>{go.disabled=true;const out=[];
    for(const tr of box.querySelectorAll('[data-ses]')){if(!tr.querySelector('.sesOk').checked)continue;const ac=tr.querySelector('.sesAc').value;if(!ac){VA.toast('Choose an aircraft for every checked flight','bad');go.disabled=false;return}
      const s=r.sessions.find(x=>x.id===tr.dataset.ses);const res=await VA.commitSession(s,ac);out.push({s,ac,res});tr.style.opacity=.5;tr.querySelector('.sesOk').disabled=true}
    VA.lastCommit=out;const ex=out.reduce((t,o)=>t+o.res.exceedances.length,0);
    box.querySelector('#sesRes').innerHTML=`<div class="check ok" data-result="commit">✓ ${out.filter(o=>!o.res.dup).length} flight(s) created, ${out.filter(o=>o.res.dup).length} matched existing flights (deduped)${ex?` · <b class="warn-t">${ex} exceedance(s)</b> → <a href="#/squawks?f=draft">squawk drafts</a>`:''}. Device mappings learned.</div>`;
    VA.toast(`Imported ${out.length} flight(s)`,'ok')};
}

/* ================= INTEGRATIONS ================= */
V.integrations=function(el){
  const s=S();const cards=[
   ['Garmin avionics','G1000 / NXi / Perspective / G3X SD-card data logs','Connected · file import','ok','Live sync via Flight Stream 510 → Garmin Pilot → flyGarmin requires Garmin\'s licensed Aviation Flight Data Log API — coming in production.'],
   ['ForeFlight','Logbook & track logs','Connected · simulated sync + file import','ok','Live API sync — coming in production (ForeFlight partner access to be confirmed).'],
   ['JPI EDM engine monitors','.JPI files','Detect only','warn','Native .JPI decoding — coming in production. Today: export CSV from EzTrends.'],
   ['Dynon · Avidyne · EI','SkyView user logs, Entegra R9 C_*.CSV','File import (partial)','warn','Keyword column mapping; send a sample to verify your installation.'],
   ['ADS-B flight detection','Auto-detect flights from ADS-B tracks by Mode S hex','Coming in production','','Planned via a licensed ADS-B data provider; Mode S hex comes from the FAA registry record.'],
   ['FAA Registry & ADs','Type library + N-number lookup; AD feed','Registry bundled (offline)','ok','Registry data refreshed from FAA daily download; AD feed (Federal Register / DRS) — coming in production.']];
  el.innerHTML=`<div class="fleet" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${cards.map(c=>`<div class="card"><div class="row"><b style="font-size:15px" class="spacer">${c[0]}</b><span class="pill ${c[3]||'plain'}" ${c[3]?'':'style="color:var(--muted);background:var(--panel2)"'}>${c[2]}</span></div><div class="small muted" style="margin:6px 0 10px">${c[1]}</div><div class="small dim">${c[4]}</div></div>`).join('')}</div>
  <div class="row" style="margin:18px 0 0"><a class="btn primary" href="#/import">${I.sync} Import SD card / log files</a></div>
  <h3 class="section-h">Device → aircraft mappings (learned)</h3>
  <div class="tbl"><div class="tbl-scroll"><table><thead><tr><th>Device</th><th>Aircraft</th><th></th></tr></thead><tbody>${[...(s.avionics||[]).map(x=>[x.kind+' · system_id '+x.systemId,x.ac,null]),...Object.entries(s.deviceMap||{}).map(([k,v])=>[k,v,k])].map(r=>`<tr><td class="mono small">${esc(r[0])}</td><td class="mono">${esc(VA.ac(r[1])?.tail||'?')}</td><td>${r[2]?`<button class="btn sm" data-forget="${esc(r[2])}">Forget</button>`:'<span class="dim small">configured</span>'}</td></tr>`).join('')||'<tr><td colspan="3" class="dim">None yet — confirm an import to teach a mapping.</td></tr>'}</tbody></table></div></div>
  <h3 class="section-h">Supported avionics &amp; formats</h3>
  <div class="tbl"><div class="tbl-scroll"><table id="supT"><thead><tr><th>System</th><th>Status</th><th>What we read</th><th class="hide-m">Sources</th></tr></thead><tbody>
   ${VA.PARSERS.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td><span class="pill ${p.status==='verified'?'ok':p.status==='unsupported'?'bad':'warn'} plain">${esc(p.status)}</span></td><td class="small">${esc(p.covers)}</td><td class="hide-m small dim">${p.src.map(esc).join('<br>')||'—'}</td></tr>`).join('')}
  </tbody></table></div></div><p class="small dim">Unsupported or unrecognized file? The importer says so and asks for a sample — we never guess a format.</p>`;
  $$('[data-forget]',el).forEach(b=>b.onclick=()=>{delete s.deviceMap[b.dataset.forget];VA.save();VA.route()});
  return {title:'Avionics & integrations'};
};

/* ================= ADD AIRCRAFT (FAA registry) ================= */
V.addaircraft=function(el){
  el.innerHTML=`<div class="two-col"><div class="grid">
   <div class="card"><h2>1 · Look up by N-number</h2><div class="row"><input id="nIn" placeholder="e.g. N172SP" style="flex:1;text-transform:uppercase;font-family:var(--mono)" maxlength="6"><button class="btn primary" id="nGo">Look up</button></div>
     <div class="small dim" style="margin-top:6px">Searches the bundled FAA Aircraft Registry (MASTER) — offline. Owner name/address are not bundled.</div><div id="nOut"></div></div>
   <div class="card"><h2>2 · Or search the type library</h2><input id="tIn" placeholder="Search make / model — e.g. Cessna 172, King Air B300, R44" autocomplete="off"><div id="tOut" class="attn" style="margin-top:8px"></div><div class="small dim" id="tMeta" style="margin-top:6px">Loading FAA type library…</div></div>
  </div><div class="card" id="profile"><h2>3 · Aircraft profile</h2><div class="empty">Pick a type or look up an N-number to auto-fill.</div></div></div>`;
  let lib=null;VA.types.load().then(L=>{lib=L;$('#tMeta',el).textContent=`${L.list.length.toLocaleString()} FAA make/model records · registry file dated ${L.built} · loaded in ${L.ms.toFixed(0)} ms`});
  let tq;$('#tIn',el).oninput=e=>{clearTimeout(tq);tq=setTimeout(()=>{if(!lib)return;const t0=performance.now();const res=VA.types.search(e.target.value,15);const ms=performance.now()-t0;
    $('#tOut',el).innerHTML=res.map(r=>`<a href="javascript:void 0" data-code="${r.code}"><span class="n"><div><b>${esc(r.mfr)}</b> ${esc(r.model)}</div><div class="small dim">${esc(VA.types.TYPE_ACFT[r.typeAcft]||'')} · ${esc(VA.types.TYPE_ENG[r.typeEng]||'')} · ${r.noEng} eng · ${r.seats} seats${r.cert==='1'?' · experimental':''}</div></span><span class="chip">${esc((VA.TIERS.find(t=>t.id===VA.types.classify(r).tier)||{}).name||'')}</span></a>`).join('')||'<div class="dim small">No matches.</div>';
    $('#tMeta',el).textContent=`${res.length} shown · searched ${lib.list.length.toLocaleString()} records in ${ms.toFixed(1)} ms`;VA.lastTypeSearch={q:e.target.value,res,ms};
    $$('[data-code]',el).forEach(a=>a.onclick=()=>profile({type:lib.byCode.get(a.dataset.code)}))},120)};
  const look=async()=>{const n=$('#nIn',el).value;$('#nOut',el).innerHTML='<div class="spinner"></div>';const t0=performance.now();const r=await VA.types.lookupN(n);const ms=performance.now()-t0;VA.lastLookup=r;
    if(r.error){$('#nOut',el).innerHTML=`<div class="check bad">${esc(r.error)}</div>`;return}
    if(r.notFound){$('#nOut',el).innerHTML=`<div class="check warn">${esc(r.n)} is not in the FAA registry file (unassigned, reserved or deregistered). You can still add it manually from the type library.</div>`;return}
    $('#nOut',el).innerHTML=`<div class="check ok" style="color:var(--text)"><b style="color:var(--ok)">${esc(r.n)} found</b> · ${ms.toFixed(0)} ms<table class="brk"><tbody><tr><td>Make / model</td><td>${esc(r.type?r.type.mfr+' '+r.type.model:r.code)}</td></tr><tr><td>Year · serial</td><td>${esc(r.year||'—')} · ${esc(r.serial)}</td></tr><tr><td>Engine</td><td>${esc(r.eng?r.eng.mfr+' '+r.eng.model+(r.eng.hp?' · '+r.eng.hp+' hp':'')+(r.eng.thrust?' · '+r.eng.thrust+' lbf':''):'—')}</td></tr><tr><td>Airworthiness class</td><td>${esc(r.cert?r.cert.className+(r.cert.ops.length?' — '+r.cert.ops.join(', '):'')+' ('+r.cert.code+')':'—')}</td></tr><tr><td>Airworthiness date</td><td>${esc(VA.types.fmtYMD(r.airworthDate))}</td></tr><tr><td>Registration expires</td><td>${esc(VA.types.fmtYMD(r.expiration))}</td></tr><tr><td>Mode S (hex)</td><td class="mono">${esc(r.modeSHex)}</td></tr></tbody></table><div class="small dim">Owner: hidden (not bundled; available via FAA registry if the operator opts in).</div></div>`;
    if(r.type)profile({type:r.type,reg:r})};
  $('#nGo',el).onclick=look;$('#nIn',el).onkeydown=e=>{if(e.key==='Enter')look()};
  function profile({type,reg}){
    const c=VA.types.classify(type,reg);const tier=VA.TIERS.find(t=>t.id===c.tier);const av=VA.types.avionicsGuess(type,reg&&reg.year);
    const usedTails=new Set(S().aircraft.map(a=>a.tail));const tail=reg?reg.n:((window.DEMO_TAILS||{pool:[]}).pool.find(t=>!usedTails.has(t))||'N');
    $('#profile',el).innerHTML=`<h2>3 · Aircraft profile</h2><form class="form" id="apf" onsubmit="return false">
      <label class="f">Tail number<input name="tail" value="${esc(tail)}" style="font-family:var(--mono)"></label><label class="f">Year<input name="year" value="${esc(reg&&reg.year||'')}"></label>
      <label class="f full">Make / model (FAA)<input name="model" value="${esc(type.mfr+' '+type.model)}"></label>
      <label class="f">Serial<input name="serial" value="${esc(reg?reg.serial:'')}"></label><label class="f">Total time (h)<input name="tt" type="number" step="0.1" value="0"></label></form>
      <table class="brk" style="margin-top:12px"><tbody>
       <tr><td>Category</td><td>${esc(VA.types.TYPE_ACFT[type.typeAcft]||'')} · ${esc(VA.types.TYPE_ENG[type.typeEng]||'')} · ${type.noEng} eng · ${type.seats} seats · weight class ${type.wclass||'?'}</td></tr>
       <tr><td>Pricing tier</td><td><b>${esc(tier.name)}</b> · $${tier.price}/mo</td></tr>
       <tr><td>Engine monitoring</td><td>${c.kind==='turbine'?'Turbine (ITT, Ng, torque, oil)':'Piston (CHT, EGT, oil, fuel flow)'} · limits entered from POH</td></tr>
       <tr><td>Typical avionics</td><td>${esc(av.suite)} <span class="dim">(${esc(av.confidence)} — confirm)</span></td></tr></tbody></table>
      ${(c.notes||[]).length?`<div class="small dim" style="margin-top:8px">${c.notes.map(esc).join(' · ')}</div>`:''}${c.flags.length?`<div class="check warn small" style="margin-top:10px"><b>Flags</b><ul>${c.flags.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></div>`:''}
      <h3 class="section-h" style="margin-top:16px">Starting due list (IA verifies before it counts)</h3><div class="list" style="gap:6px">${c.program.map(p=>`<div class="small"><span class="chip ${p.cat}">${p.cat}</span> <b>${esc(p.name)}</b> <span class="dim">— ${esc(p.ref)}</span></div>`).join('')}</div>
      <button class="btn primary" style="margin-top:14px;width:100%;justify-content:center" id="apAdd">Add ${esc(tail)} to fleet</button>`;
    VA.lastProfile={type,reg,c,av};
    $('#apAdd',el).onclick=()=>{const f=$('#apf',el);const t=f.tail.value.trim().toUpperCase();if(!/^N[1-9][0-9A-Z]{0,4}$/.test(t)){VA.invalid(f.tail,'Enter a US N-number like N172SP');return}if(S().aircraft.some(a=>a.tail===t)){VA.invalid(f.tail,t+' is already in your fleet');return}
      const r=VA.addAircraft({type,reg:reg&&!reg.notFound?reg:null,tail:t,model:f.model.value,year:f.year.value,serial:f.serial.value,tt:parseFloat(f.tt.value)||0});
      if(r.error){VA.invalid(f.tail,r.error);return}
      VA.toast(`${esc(r.note||t+' added')} · ${r.program.length} template items await IA verification`,'ok');VA.go('aircraft/'+r.a.id)};
  }
  const pre=VA.query.get('n');if(pre){$('#nIn',el).value=pre;look()}
  return {title:'Add aircraft'};
};
})();
