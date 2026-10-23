/* Valkyr360 — print support: a Print button in the top bar, a print header (logo, Valkyr360, page, operator, tail, date),
   and full lists (no pagination) while printing. Styling lives in styles.css @media print. */
(function(){
const {$,esc}=VA;
const ICON='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>';
function tailOf(){const h=location.hash.replace(/^#\/?/,'');const [path,qs]=h.split('?');const parts=path.split('/');
  let a=null;if(parts[0]==='aircraft'&&parts[1])a=VA.ac&&VA.ac(decodeURIComponent(parts[1]));
  if(!a){const id=new URLSearchParams(qs||'').get('ac');if(id)a=VA.ac&&VA.ac(id)}
  if(!a){const sel=document.querySelector('#view select#tAc');if(sel&&sel.value)a=VA.ac&&VA.ac(sel.value)}
  return a&&a.tail?a.tail+(a.short?' · '+a.short:a.model?' · '+a.model:''):''}
function operatorOf(){const s=VA.auth&&VA.auth.session()||{};
  if(s.platform){const n=document.getElementById('admName');return n?n.textContent+' · Hill Systems admin':'Hill Systems admin'}
  return s.org||(VA.me&&VA.me().org)||''}
VA.printHead=function(){const el=$('.print-brand');if(!el)return;
  const d=new Date();const date=d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})+' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  const tabEl=document.querySelector('#view .tabs .on');let sec='';if(tabEl){const c=tabEl.cloneNode(true);c.querySelectorAll('.count').forEach(x=>x.remove());sec=c.textContent.trim()}
  const t0=($('#pageTitle')||{}).textContent||'';const title=sec&&!t0.includes(sec)?t0+' · '+sec:t0;const meta=[operatorOf(),tailOf(),'Printed '+date].filter(Boolean);
  el.innerHTML=`<div class="ph-in"><img class="ph-logo" src="brand/valkyr360-logo-print.svg" alt="Valkyr360" width="88" height="24"><div class="ph-t">${title?'<span id="phTitle">'+esc(title)+'</span>':''}<div class="ph-m" id="phMeta">${meta.map(esc).join(' · ')}</div></div><div class="ph-by">by <img class="ph-hs" src="brand/hill-systems-logo-print.png" alt="Hill Systems" width="57" height="16"></div></div>`};
const settle=async(ms=10000)=>{const t=Date.now();await new Promise(r=>setTimeout(r,60));
  while(Date.now()-t<ms){const v=$('#view');if(v&&!v.querySelector('.spinner')&&!v.querySelector('[aria-busy=true]'))break;await new Promise(r=>setTimeout(r,80))}
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))};
VA.preparePrint=async function(){VA.printAll=true;VA.printing=true;document.body.classList.add('printing');VA.route();await settle();VA.printHead()};
VA.endPrint=function(){if(!VA.printing)return;VA.printing=false;VA.printAll=false;document.body.classList.remove('printing');VA.route()};
VA.print=async function(){await VA.preparePrint();window.print();setTimeout(VA.endPrint,0)};
/* Ctrl/Cmd+P: synchronous lists re-render in full; async lists print what is loaded (use the Print button for everything) */
window.addEventListener('beforeprint',()=>{if(!VA.printing){VA.printAll=true;VA.printing=true;VA.route()}VA.printHead()});
window.addEventListener('afterprint',()=>setTimeout(VA.endPrint,0));
function addBtn(){const tr=$('.top-right');if(!tr||$('#printBtn'))return;
  const b=document.createElement('button');b.type='button';b.id='printBtn';b.className='icon-btn print-btn no-print';b.title='Print';b.setAttribute('aria-label','Print');b.innerHTML=ICON;b.onclick=()=>VA.print();tr.insertBefore(b,tr.firstChild)}
addBtn();
const prev=VA.afterRoute;VA.afterRoute=function(v,view){if(prev)prev(v,view);addBtn();setTimeout(VA.printHead,0);const tp=document.getElementById('tPrint');if(tp)tp.onclick=()=>VA.print()};
})();
