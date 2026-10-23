/* Valkyr360 — list control: search + filters + sort + pagination.
   Works on in-memory arrays (cfg.data) or async DAL queries (cfg.fetch). Only one page is ever in the DOM. */
(function(){
const {$,$$,esc}=VA;
const ST=VA.listState={};
VA.list=function(host,cfg){
  const st=ST[cfg.id]=Object.assign({q:'',f:{},sort:cfg.sorts?cfg.sorts[0][0]:null,page:0,size:cfg.pageSize||25},ST[cfg.id]||{},cfg.init&&!ST[cfg.id]?cfg.init:{});
  (cfg.filters||[]).forEach(f=>{if(st.f[f.id]==null)st.f[f.id]=f.def!=null?f.def:''});
  const sizes=cfg.sizes||[st.size,st.size*2,st.size*4].filter((v,i,a)=>a.indexOf(v)===i);
  host.innerHTML=`<div class="lc">
    <div class="lc-bar">${cfg.search!==false?`<label class="lc-search">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'}<input type="search" data-lc="q" placeholder="${esc(cfg.placeholder||'Search…')}" value="${esc(st.q)}" aria-label="Search"></label>`:''}
      ${(cfg.filters||[]).map(f=>f.type==='date'?`<label class="small muted" style="display:flex;align-items:center;gap:6px">${esc(f.label)}<input type="date" data-lc="f" data-k="${f.id}" value="${esc(st.f[f.id]||'')}" style="width:auto;padding:7px 8px;font-size:13px"></label>`:`<select data-lc="f" data-k="${f.id}" aria-label="${esc(f.label)}">${f.opts.map(o=>`<option value="${esc(o[0])}" ${String(st.f[f.id])===String(o[0])?'selected':''}>${esc(o[1])}</option>`).join('')}</select>`).join('')}
      ${cfg.sorts?`<select data-lc="sort" aria-label="Sort">${cfg.sorts.map(o=>`<option value="${o[0]}" ${st.sort===o[0]?'selected':''}>Sort: ${esc(o[1])}</option>`).join('')}</select>`:''}
      ${cfg.tools||''}</div>
    <div class="lc-body"></div>
    <div class="lc-foot"><span class="lc-count muted small"></span><span class="spacer"></span>
      <select data-lc="size" aria-label="Rows per page" class="lc-size">${sizes.map(n=>`<option ${n===st.size?'selected':''}>${n}</option>`).join('')}</select>
      <button class="btn sm" data-lc="prev" aria-label="Previous page">‹</button><span class="lc-page mono small"></span><button class="btn sm" data-lc="next" aria-label="Next page">›</button></div></div>`;
  const body=$('.lc-body',host);let seq=0;
  async function draw(){
    const my=++seq,t0=performance.now();let rows,total;
    if(cfg.fetch){body.setAttribute('aria-busy','true');const slow=setTimeout(()=>{if(my===seq)body.classList.add('lc-loading')},150);let r;
      try{r=await cfg.fetch({q:st.q.trim(),f:st.f,sort:st.sort,offset:VA.printAll?0:st.page*st.size,limit:VA.printAll?1e9:st.size})}
      catch(err){clearTimeout(slow);if(my!==seq)return;body.removeAttribute('aria-busy');body.classList.remove('lc-loading');console.warn(err);
        body.innerHTML=`<div class="empty" role="alert"><b>Couldn't load this list.</b> ${esc(err&&err.message||'Storage error')} <button class="btn sm" data-lc="retry">Try again</button></div>`;$('[data-lc=retry]',body).onclick=()=>draw();return}
      clearTimeout(slow);if(my!==seq)return;body.removeAttribute('aria-busy');body.classList.remove('lc-loading');
      if(!r.rows.length&&r.total&&st.page>0){st.page=Math.max(0,Math.ceil(r.total/st.size)-1);return draw()}
      rows=r.rows;total=r.total}
    else{
      let a=cfg.data();const q=st.q.trim().toLowerCase();
      if(q)a=a.filter(r=>cfg.search(r,q));
      (cfg.filters||[]).forEach(f=>{const v=st.f[f.id];if(v!==''&&v!=null)a=a.filter(r=>f.test(r,v))});
      const so=cfg.sorts&&cfg.sorts.find(s=>s[0]===st.sort);if(so)a=a.slice().sort(so[2]);
      total=a.length;const pages=Math.max(1,Math.ceil(total/st.size));if(st.page>=pages)st.page=pages-1;
      rows=VA.printAll?a:a.slice(st.page*st.size,st.page*st.size+st.size);
    }
    const pages=Math.max(1,Math.ceil(total/st.size));
    const filtered=!!st.q.trim()||(cfg.filters||[]).some(f=>(st.f[f.id]||'')!==(f.def!=null?f.def:''));
    body.innerHTML=rows.length?cfg.render(rows):`<div class="empty">${filtered?`<b>No matches.</b> Try a different search or <button class="link-btn" data-lc="clear" style="font-size:inherit">clear filters</button>.`:(cfg.empty||'Nothing here yet.')}</div>`;
    const clr=$('[data-lc=clear]',body);if(clr)clr.onclick=()=>{st.q='';(cfg.filters||[]).forEach(f=>st.f[f.id]=f.def!=null?f.def:'');st.page=0;const qi=$('[data-lc=q]',host);if(qi)qi.value='';$$('select[data-lc=f],input[data-lc=f]',host).forEach(s=>s.value=st.f[s.dataset.k]||'');draw()};
    const ms=performance.now()-t0;
    $('.lc-count',host).textContent=total?`${(st.page*st.size+1).toLocaleString()}–${(st.page*st.size+rows.length).toLocaleString()} of ${total.toLocaleString()} · ${ms.toFixed(1)} ms`:`0 results · ${ms.toFixed(1)} ms`;
    $('.lc-page',host).textContent=`${st.page+1} / ${pages.toLocaleString()}`;
    $('[data-lc=prev]',host).disabled=st.page<=0;$('[data-lc=next]',host).disabled=st.page>=pages-1;
    $('.lc-foot',host).style.display=total<=Math.min(...sizes)&&st.page===0?'none':'';
    host.dataset.total=total;host.dataset.ms=ms.toFixed(2);
    VA.lastList={id:cfg.id,ms,total};
    cfg.after&&cfg.after(body);
    host.dispatchEvent(new CustomEvent('lc:drawn',{detail:{ms,total}}));
  }
  let tq;
  host.addEventListener('input',e=>{const t=e.target;if(t.dataset.lc!=='q')return;clearTimeout(tq);tq=setTimeout(()=>{st.q=t.value;st.page=0;draw()},cfg.fetch?180:90)});
  host.addEventListener('change',e=>{const t=e.target,k=t.dataset.lc;if(k==='f'){st.f[t.dataset.k]=t.value;st.page=0;draw()}else if(k==='sort'){st.sort=t.value;st.page=0;draw()}else if(k==='size'){st.size=+t.value;st.page=0;draw()}});
  host.addEventListener('click',e=>{const b=e.target.closest('[data-lc]');if(!b)return;if(b.dataset.lc==='prev'&&st.page>0){st.page--;draw();host.scrollIntoView({block:'nearest'})}if(b.dataset.lc==='next'){st.page++;draw();host.scrollIntoView({block:'nearest'})}});
  draw();
  return {redraw:draw,state:st};
};
})();
