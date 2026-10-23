/* Valkyr360 — Hill Systems admin sign-in (DEMO). Staff accounts only (staff.js); operator accounts are rejected. */
(function(){
const S=window.VA_STAFF,f=document.getElementById('adminForm'),err=document.getElementById('adminErr'),btn=document.getElementById('adminBtn');
const CONSOLE=location.protocol==='file:'?'../index.html#/admin':'../#/admin';
if(S.session()){location.replace(CONSOLE);return}
const opAccount=e=>{try{return JSON.parse(localStorage.getItem('va.accounts')||'[]').some(a=>a.email===e)}catch(x){return false}};
const fail=(msg,field)=>{err.textContent=msg;err.hidden=false;if(field){f[field].setAttribute('aria-invalid','true');f[field].focus()}};
f.oninput=e=>{e.target.removeAttribute('aria-invalid')};
f.onsubmit=async e=>{e.preventDefault();err.hidden=true;
  const email=f.email.value.trim().toLowerCase(),pw=f.password.value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return fail('Enter your email.','email');
  if(!pw)return fail('Enter your password.','password');
  if(!S.find(email)&&(opAccount(email)||email==='demo@valkyr-aero.demo')){f.password.value='';return fail('Operator accounts can’t sign in here.')}
  if(!(window.crypto&&crypto.subtle))return fail('This browser can’t verify passwords here.');
  btn.disabled=true;btn.textContent='Signing in…';
  const a=await S.verify(email,pw);
  btn.disabled=false;btn.textContent='Sign in';
  if(!a){f.password.value='';return fail('Wrong email or password.','password')}
  S.start(a);location.replace(CONSOLE)};
if(!matchMedia('(max-width:600px)').matches)f.email.focus();
})();
