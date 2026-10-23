/* Valkyr360 — Costs hub: one nav item with tabs Overview · Expenses · Report (#/costs, #/costs/expenses, #/costs/report).
   Old #/expenses and #/tco links redirect. The aircraft picker (VA.costAc, '' = whole fleet) is shared across the tabs. */
(function(){
const V=VA.views;const esc=VA.esc;
const overview=V.costs,expenses=V.expenses,report=V.tco;
const TABS=[['overview','Overview','#/costs'],['expenses','Expenses','#/costs/expenses'],['report','Report','#/costs/report']];
V.costs=function(el,args){
  const tab=(args&&args[0])||'overview';const t=TABS.find(x=>x[0]===tab)||TABS[0];VA.costTab=t[0];
  el.innerHTML=`<nav class="tabs no-print" role="tablist" aria-label="Costs sections" id="costTabs">${TABS.map(x=>`<a role="tab" href="${x[2]}" data-tab="${x[0]}" aria-selected="${x===t}" class="${x===t?'on':''}">${x[1]}</a>`).join('')}</nav><div id="costBody"></div>`;
  const body=el.querySelector('#costBody');
  const fn={overview,expenses,report}[t[0]];const res=fn(body,[])||{};
  return {title:t[0]==='overview'?'Costs':t[0]==='expenses'?'Costs · Expenses':'Costs · Report'};
};
const redirect=to=>function(el){const qs=location.hash.split('?')[1];const ac=VA.query&&VA.query.get('ac');if(ac)VA.costAc=ac;location.replace(to+(qs&&!ac?'?'+qs:''));return {title:'Costs'}};
V.expenses=redirect('#/costs/expenses');V.tco=redirect('#/costs/report');
})();
