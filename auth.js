/* Valkyr360 — DEMO sign-in.
   This is a static prototype: accounts live only in this browser (localStorage). Passwords are never stored;
   we keep a random 16-byte salt and a PBKDF2-HMAC-SHA-256 hash (150,000 iterations, WebCrypto) per account.
   This is NOT real security; anyone with access to this browser profile can read or delete the accounts.
   Production auth is server-side; see ARCHITECTURE.md §15. */
(function(){
const {$,$$,esc}=VA;
const ACC='va.accounts',SES='va.session',ITER=150000;
const ROLES=[['owner','Owner','Fleet, costs, plans and billing'],['pilot','Pilot','Schedule, log flights, squawks'],['mechanic','Mechanic','Maintenance, squawks, sign-offs']];
const DEMO={uid:'demo',email:'demo@valkyr-aero.demo',name:'Trevor Hill',org:'Valkyr360 Demo Flight Dept (DEMO)',role:'owner',demo:true};
const b64=buf=>btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const hasCrypto=()=>!!(window.crypto&&crypto.subtle&&crypto.getRandomValues);
async function hashPw(pw,salt,iter=ITER){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);
  return b64(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},key,256))}
const accounts=()=>{try{return JSON.parse(localStorage.getItem(ACC)||'[]')}catch(e){return []}};
const saveAccounts=a=>localStorage.setItem(ACC,JSON.stringify(a));
const normEmail=e=>String(e||'').trim().toLowerCase();
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const initials=n=>String(n||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';
/* Two separate session slots: the admin console (#/admin…, va.admin.session via staff.js) and the operator app (va.session).
   The page runs in one mode, fixed at load; crossing between them reloads. "View as operator" uses a tab-only slot (va.imp). */
const IMP='va.imp';const STAFF=window.VA_STAFF;
const isAdminHash=h=>/^#\/admin(\/|\?|$)/.test(h||'');
const MODE=isAdminHash(location.hash)?'admin':'app';
const ADMIN_URL=()=>location.protocol==='file:'?'admin/index.html':'admin/';
function opSession(){try{const s=JSON.parse(localStorage.getItem(SES)||sessionStorage.getItem(SES)||'null');return s&&!s.platform?s:null}catch(e){return null}}
function session(){if(MODE==='admin')return STAFF?STAFF.session():null;try{const i=JSON.parse(sessionStorage.getItem(IMP)||'null');if(i)return i}catch(e){}return opSession()}
function setSession(s,remember){localStorage.removeItem(SES);sessionStorage.removeItem(SES);if(s)(remember?localStorage:sessionStorage).setItem(SES,JSON.stringify(s))}
function updateSession(patch){const s=opSession();if(!s)return;const rem=!!localStorage.getItem(SES);setSession({...s,...patch},rem)}

const scopeOf=s=>s&&!s.demo&&!s.platform&&s.uid?'valkyr-aero-'+s.uid:'valkyr-aero';
const A=VA.auth={ROLES,session,accounts,MODE,isAdminHash,adminUrl:ADMIN_URL,
  scope(){return scopeOf(session())},
  /* create: returns {ok}|{field,msg} */
  check({name,email,password,org}){
    name=String(name||'').trim();org=String(org||'').trim();email=normEmail(email);
    if(!name)return {field:'name',msg:'Enter your name'};
    if(!EMAIL.test(email))return {field:'email',msg:'Enter a valid email address'};
    if(String(password||'').length<8)return {field:'password',msg:'Use at least 8 characters'};
    if(!org)return {field:'org',msg:'Enter your organization or flight department name'};
    if(!hasCrypto())return {field:'password',msg:'This browser can’t hash passwords securely here (WebCrypto unavailable). Use “Explore the demo”.'};
    if(accounts().some(a=>a.email===email))return {field:'email',msg:'An account with this email already exists in this browser. Sign in instead.'};
    return {ok:true,draft:{name,email,password,org}};
  },
  async create({name,email,password,org}){
    name=String(name||'').trim();org=String(org||'').trim();email=normEmail(email);
    if(!name)return {field:'name',msg:'Enter your name'};
    if(!EMAIL.test(email))return {field:'email',msg:'Enter a valid email address'};
    if(String(password||'').length<8)return {field:'password',msg:'Use at least 8 characters'};
    if(!org)return {field:'org',msg:'Enter your organization or flight department name'};
    if(!hasCrypto())return {field:'password',msg:'This browser can’t hash passwords securely here (WebCrypto unavailable). Use “Explore the demo”.'};
    const list=accounts();if(list.some(a=>a.email===email))return {field:'email',msg:'An account with this email already exists in this browser. Sign in instead.'};
    const salt=crypto.getRandomValues(new Uint8Array(16));const hash=await hashPw(password,salt);
    const acct={id:'u_'+b64(crypto.getRandomValues(new Uint8Array(6))).replace(/[^a-z0-9]/gi,''),name,email,org,role:'owner',alg:'PBKDF2-SHA-256',iter:ITER,salt:b64(salt),hash,created:new Date().toISOString()};
    list.push(acct);saveAccounts(list);return {ok:true,account:acct};
  },
  async verify(email,password){email=normEmail(email);const a=accounts().find(x=>x.email===email);
    if(!a||!hasCrypto()){if(hasCrypto())await hashPw(String(password||'x'),new Uint8Array(16),2000);return null}
    const h=await hashPw(String(password||''),unb64(a.salt),a.iter||ITER);return h===a.hash?a:null},
  begin(acct,remember){if(acct.platform||acct.role==='platform')return;const s=acct.demo?{...DEMO,role:acct.role||'owner'}:{uid:acct.id,email:acct.email,name:acct.name,org:acct.org,role:acct.role||'owner',demo:false};
    if(!acct.demo){const l=accounts();const x=l.find(y=>y.id===acct.id);if(x){x.lastActive=new Date().toISOString();saveAccounts(l)}}
    s.initials=initials(s.name);s.at=new Date().toISOString();setSession(s,remember);
    /* each account has its own IndexedDB scope; switching scope = reload into the other database */
    if(VA.scopeLoaded&&scopeOf(s)!==VA.scopeLoaded){const want=A.pendingHash||location.hash||'#/fleet';A.pendingHash=null;VA.switching=true;history.replaceState(null,'',location.pathname+location.search+want);location.reload();return}
    const S=VA.state();if(S){S.role=s.role;VA.save()}
    hide();const want=A.pendingHash;A.pendingHash=null;
    if(want&&want!==location.hash)location.hash=want;else VA.route();
    VA.toast(`Signed in as <b>${esc(s.name)}</b> · ${esc(roleLabel(s.role))}`,'ok')},
  demo(role='owner'){A.begin({demo:true,role},true)},
  /* platform admin: open an operator read-only in this tab; the admin and operator sessions are left untouched */
  impersonate(op){const me=session();if(MODE!=='admin'||!me||!me.platform)return;
    const s={uid:op.uid,demo:op.uid==='demo',email:op.email,name:op.owner||op.email,org:op.name,role:'owner',initials:initials(op.owner||op.name),impersonatedBy:me.email,at:new Date().toISOString()};
    sessionStorage.setItem(IMP,JSON.stringify(s));reloadTo('#/fleet')},
  exitImpersonation(){sessionStorage.removeItem(IMP);reloadTo('#/admin')},
  setRole(r){if(!ROLES.some(x=>x[0]===r))return;{const ss=session();if(ss&&(ss.platform||ss.impersonatedBy))return}updateSession({role:r});const S=VA.state();S.role=r;VA.save()},
  signOut(){if(MODE==='admin'){STAFF&&STAFF.end();VA.switching=true;location.replace(ADMIN_URL());return}
    sessionStorage.removeItem(IMP);setSession(null);A.draft=null;closeMenu();VA.closeModal();A.pendingHash=null;show('signin');VA.toast('Signed out','ok')},
  show,hide
};
function reloadTo(h){VA.switching=true;history.replaceState(null,'',location.pathname+location.search+h);location.reload()}
const roleLabel=r=>r==='platform'?'Platform admin':(ROLES.find(x=>x[0]===r)||ROLES[0])[1];
A.roleLabel=roleLabel;

/* ---------- sign-in screen ---------- */
function shell(inner){return `<div class="auth-wrap"><section class="auth-card" aria-labelledby="authH">
    <div class="auth-brand"><img class="v360-logo" src="brand/valkyr360-logo.svg" alt="Valkyr360" width="146" height="40"></div>
    <div class="by-hs">by <img src="brand/hill-systems-logo-sm.png" alt="Hill Systems" height="16"></div>
    ${inner}
    <p class="auth-note">Demo: accounts are stored only in this browser.</p>
    <p class="auth-legal"><a href="terms.html" id="authTerms">Terms</a> · <a href="privacy.html">Privacy</a></p>
  </section></div>`}
A.WIRE={};A.busy=(...a)=>busy(...a);A.bad=(...a)=>bad(...a);
const field=A.field=(name,label,type='text',extra='')=>`<label class="f">${label}<input name="${name}" type="${type}" ${extra}></label>`;
const STEPS=['Account','Aircraft','Plan','Checkout'];
const steps=i=>`<ol class="auth-steps" aria-label="Sign-up steps">${STEPS.map((x,k)=>`<li class="${k<i?'done':k===i?'on':''}" ${k===i?'aria-current="step"':''}><span>${k+1}</span>${x}</li>`).join('')}</ol>`;
A.steps=steps;A.shell=shell;
const VIEWS=A.VIEWS={
  signin:()=>shell(`<h1 id="authH" class="auth-head">Aircraft management, simplified.</h1>
    <form class="form auth-form" id="signinForm" novalidate>
      ${field('email','Email','email','autocomplete="username" inputmode="email" required')}
      <label class="f">Password<span class="pw"><input name="password" type="password" autocomplete="current-password" required><button type="button" class="pw-eye" aria-label="Show password" data-eye>Show</button></span></label>
      <div class="auth-row"><label class="auth-check"><input type="checkbox" name="remember" checked> Remember me</label><button type="button" class="link-btn" id="authForgot">Forgot password?</button></div>
      <div class="auth-err" id="authErr" role="alert" hidden></div>
      <button class="btn primary auth-submit" id="signinBtn" type="submit">Sign in</button>
    </form>
    <button class="btn auth-submit auth-demo" id="authDemo" type="button">Explore the demo</button>
    <p class="auth-alt"><button type="button" class="link-btn" id="authCreate">Create account</button></p>`),
  create:()=>shell(`${steps(0)}<h1 id="authH">Create account</h1>
    <form class="form auth-form" id="createForm" novalidate>
      ${field('name','Name','text','autocomplete="name" required value="'+esc(A.draft&&A.draft.name||'')+'"')}
      ${field('email','Email','email','autocomplete="email" inputmode="email" required value="'+esc(A.draft&&A.draft.email||'')+'"')}
      <label class="f">Password<span class="pw"><input name="password" type="password" autocomplete="new-password" minlength="8" required aria-describedby="pwHint"><button type="button" class="pw-eye" aria-label="Show password" data-eye>Show</button></span><span class="hint" id="pwHint">8+ characters</span></label>
      ${field('org','Organization','text','autocomplete="organization" required value="'+esc(A.draft&&A.draft.org||'')+'"')}
      <button class="btn primary auth-submit" id="createBtn" type="submit">Continue</button>
    </form>
    <p class="auth-alt"><button type="button" class="link-btn" id="authBack">Sign in</button></p>`),
  forgot:()=>shell(`<h1 id="authH">Reset password</h1>
    <form class="form auth-form" id="forgotForm" novalidate>
      ${field('email','Email','email','autocomplete="email" inputmode="email" required')}
      <button class="btn primary auth-submit" id="forgotBtn" type="submit">Send reset link</button>
    </form>
    <p class="auth-alt"><button type="button" class="link-btn" id="authBack">Back</button></p>`),
  sent:(email)=>shell(`<div class="auth-sent"><div class="auth-sent-ic" aria-hidden="true">✓</div><h1 id="authH">Check your email</h1>
    <p class="auth-sub" id="sentMsg">If an account exists for <b>${esc(email)}</b>, a reset link is on its way.</p>
    <p class="dim" style="font-size:12px">Demo: nothing was sent.</p>
    <button class="btn auth-submit" id="authBack" type="button">Back</button></div>`)
};
function show(view='signin',arg){
  if(MODE==='admin'){VA.switching=true;location.replace(ADMIN_URL());return}
  if(!A.pendingHash&&location.hash&&!/^#\/?(fleet)?$/.test(location.hash))A.pendingHash=location.hash;
  let el=$('#auth');if(!el){el=document.createElement('div');el.id='auth';el.className='auth';document.body.appendChild(el)}
  document.body.classList.add('signed-out');el.innerHTML=VIEWS[view](arg);el.dataset.view=view;
  document.title=(({signin:'Sign in',create:'Create account',forgot:'Reset password',sent:'Check your email',aircraft:'Add aircraft',plan:'Your plan',checkout:'Checkout',done:'You’re all set'})[view]||'Sign in')+' · Valkyr360 by Hill Systems';el.querySelector('.auth-card').classList.toggle('wide',['aircraft','plan','checkout','done'].includes(view));
  wire(el,view);
  const f=$('form input',el)||$('#authBack',el);if(f&&!matchMedia('(max-width:600px)').matches)setTimeout(()=>f.focus({preventScroll:true}),30);
}
A.show=show;
function hide(){const el=$('#auth');if(el)el.remove();document.body.classList.remove('signed-out')}
function bad(form,name,msg){const i=form.querySelector(`[name=${name}]`);VA.invalid(i,msg)}
function busy(btn,on,txt){btn.disabled=on;if(on){btn.dataset.t=btn.textContent;btn.innerHTML=`<span class="btn-spin" aria-hidden="true"></span>${txt}`}else btn.textContent=btn.dataset.t||btn.textContent}
function wire(el,view){
  $$('[data-eye]',el).forEach(b=>b.onclick=()=>{const i=b.previousElementSibling;const sh=i.type==='password';i.type=sh?'text':'password';b.textContent=sh?'Hide':'Show';b.setAttribute('aria-label',sh?'Hide password':'Show password')});
  const on=(id,fn)=>{const x=$('#'+id,el);if(x)x.onclick=fn};
  on('authDemo',()=>A.demo('owner'));$$('[data-demo]',el).forEach(b=>b.onclick=()=>A.demo(b.dataset.demo));
  on('authForgot',()=>show('forgot'));on('authCreate',()=>show('create'));on('authBack',()=>show('signin'));
  const sf=$('#signinForm',el);if(sf)sf.onsubmit=async e=>{e.preventDefault();const err=$('#authErr',el);err.hidden=true;
    const email=sf.email.value,pw=sf.password.value;
    if(!EMAIL.test(normEmail(email)))return bad(sf,'email','Enter the email you signed up with');
    if(!pw)return bad(sf,'password','Enter your password');
    if(STAFF&&STAFF.find(email)){err.textContent='Admin accounts can’t sign in here.';err.hidden=false;sf.password.value='';return}
    const b=$('#signinBtn',el);busy(b,true,'Signing in…');const a=await A.verify(email,pw);busy(b,false);
    if(!a){err.textContent='That email and password don’t match an account in this browser.';err.hidden=false;sf.password.value='';sf.password.focus();return}
    A.begin(a,sf.remember.checked)};
  const cf=$('#createForm',el);if(cf)cf.onsubmit=e=>{e.preventDefault();
    const r=A.check({name:cf.name.value,email:cf.email.value,password:cf.password.value,org:cf.org.value});
    if(!r.ok)return bad(cf,r.field,r.msg);A.draft={...(A.draft||{}),...r.draft};show('aircraft')};
  if(A.WIRE[view])A.WIRE[view](el);
  const ff=$('#forgotForm',el);if(ff)ff.onsubmit=e=>{e.preventDefault();const em=normEmail(ff.email.value);if(!EMAIL.test(em))return bad(ff,'email','Enter a valid email address');show('sent',em)};
}

/* ---------- header user menu ---------- */
function closeMenu(){const m=$('#userMenu');if(m)m.hidden=true;const b=$('#whoBtn');if(b)b.setAttribute('aria-expanded','false')}
A.renderWho=function(me){const s=session()||{};const who=$('#who');if(!who)return;
  const name=s.demo||!s.name?me.name:s.name,ini=s.demo||!s.name?me.initials:s.initials,sub=s.platform?'Platform admin':s.impersonatedBy?'Read-only view':s.demo?me.title:roleLabel(VA.state().role)+(s.org?' · '+s.org:'');
  const open=$('#userMenu')&&!$('#userMenu').hidden;
  who.innerHTML=`<button class="who-btn" id="whoBtn" aria-haspopup="true" aria-expanded="${open}" aria-controls="userMenu"><span class="avatar">${esc(ini)}</span><span class="who-txt"><b>${esc(name)}</b>${esc(sub)}</span><svg class="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
  <div class="user-menu" id="userMenu" ${open?'':'hidden'}>
    <div class="um-head"><span class="avatar lg">${esc(ini)}</span><div><b>${esc(s.name||name)}</b><span>${esc(s.email||'')}</span><span class="dim">${esc(s.org||'')}</span></div></div>
    ${s.platform||s.impersonatedBy?'':`<div class="um-sec"><div class="um-lab" id="roleLab">${s.demo?'Explore as':'View as'}</div>
      <div class="roles" id="roles" role="radiogroup" aria-labelledby="roleLab">${ROLES.map(([r,l,d])=>`<button role="radio" aria-checked="${VA.state().role===r}" data-role="${r}" class="${VA.state().role===r?'on':''}" title="${esc(d)}">${l}</button>`).join('')}</div></div>`}
    ${s.impersonatedBy?'<button class="um-item" id="umExit">Exit operator view</button>':`<button class="um-item" id="umAccount">Account</button>
    ${VA.state().role==='owner'?'<a class="um-item" id="umBilling" href="#/billing">Billing</a>':''}
    <button class="um-item danger" id="umSignOut">Sign out</button>`}
  </div>`;
  $('#whoBtn').onclick=e=>{e.stopPropagation();const m=$('#userMenu');m.hidden=!m.hidden;$('#whoBtn').setAttribute('aria-expanded',String(!m.hidden));if(!m.hidden){const f=$('#roles button.on',m)||$('.um-item',m);if(f)f.focus()}};
  if($('#umExit'))$('#umExit').onclick=()=>A.exitImpersonation();
  if($('#umSignOut'))$('#umSignOut').onclick=()=>A.signOut();
  if($('#umAccount'))$('#umAccount').onclick=()=>{closeMenu();accountModal()};const ub=$('#umBilling');if(ub)ub.onclick=()=>closeMenu();
};
document.addEventListener('click',e=>{const m=$('#userMenu');if(m&&!m.hidden&&!e.target.closest('#who'))closeMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const m=$('#userMenu');if(m&&!m.hidden){closeMenu();$('#whoBtn').focus()}}});
function accountModal(){const s=session()||{};const a=accounts().find(x=>x.id===s.uid);
  VA.modal('Account',`<dl class="kv acct-kv">
    <dt>Name</dt><dd>${esc(s.name)}</dd><dt>Email</dt><dd>${esc(s.email)}</dd><dt>Organization</dt><dd>${esc(s.org)}</dd>
    <dt>Account role</dt><dd>${esc(roleLabel(s.demo?'owner':(a&&a.role)||'owner'))}</dd><dt>Viewing as</dt><dd>${esc(roleLabel(VA.state().role))}</dd>
    <dt>Session</dt><dd>${localStorage.getItem(SES)?'Remembered on this device':'Ends when you close this tab'}</dd>
    ${a?`<dt>Created</dt><dd>${esc(a.created.slice(0,10))}</dd><dt>Password</dt><dd>Stored as ${esc(a.alg)} hash (${a.iter.toLocaleString()} iterations, random salt)</dd>`:''}</dl>
    <p class="dim" style="font-size:12px;margin-top:14px"><span class="demo-tag">DEMO</span> ${s.demo?'Shared demo account. Nothing is stored about you.':'This account exists only in this browser’s storage. Clearing site data deletes it.'}</p>`,
    `<button class="btn" data-close>Close</button><button class="btn danger" id="acctOut">Sign out</button>`,m=>{$('#acctOut',m.parentElement).onclick=()=>A.signOut()})}
})();
