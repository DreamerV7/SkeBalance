import {cleanSnapshot,resultForSnapshot} from './snapshot.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n/100);
const yandexProvider = 'custom:yandex';
const yandexPendingKey = 'skebalance-yandex-signin';
const profileSections = new Set(['#profile', '#saved-section', '#journal', '#inflation', '#tools', '#upload', '#review', '#forecast']);

function readYandexCallback() {
 const url = new URL(location.href);
 if (url.searchParams.get('auth') !== 'yandex') return null;

 const fragment = new URLSearchParams(url.hash.slice(1));
 const callback = {
  code: url.searchParams.get('code'),
  denied: [url.searchParams, fragment].some(params =>
   params.get('error') === 'access_denied' || params.get('error_code') === 'access_denied'),
 };
 history.replaceState(history.state, '', url.pathname);
 return callback;
}

async function createYandexChallenge() {
 const random = crypto.getRandomValues(new Uint8Array(32));
 const verifier = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
 const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
 const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
 return { verifier, challenge };
}

export function readableError(error){
 const code=error?.code||'',message=error?.message||'';
 if(code==='invalid_credentials'||/Invalid login credentials/i.test(message))return 'Не удалось войти. Проверьте email и пароль.';
 if(code==='email_not_confirmed')return 'Подтвердите email по ссылке из письма, затем войдите.';
 if(code==='user_already_exists'||/already registered/i.test(message))return 'Этот email уже зарегистрирован. Попробуйте войти или восстановить пароль.';
 if(code==='weak_password')return 'Выберите более надёжный пароль: не менее 12 символов.';
 if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit'||error?.status===429)return 'Слишком много запросов. Подождите несколько минут и повторите.';
 if(code==='email_address_not_authorized'||/Email address not authorized/i.test(message))return 'Отправка писем пока недоступна для этого адреса. Используйте настроенный тестовый аккаунт или обратитесь к автору проекта.';
 if(code==='PGRST205'||code==='42P01')return 'Сохранение расчётов временно недоступно.';
 if(code==='42501')return 'Нет доступа к этому расчёту. Войдите заново и повторите.';
 if(error?.status===401)return 'Сессия истекла. Войдите заново.';
 if(/fetch|network|abort|timed out/i.test(message)||error?.name==='AbortError')return 'Не удалось связаться с сервером. Проверьте интернет и повторите.';
 return 'Действие не выполнено. Повторите позже. Данные в форме сохранены.';
}
export async function initAccount({capture,restore}){
 let client=null,user=null,mode='login',revision=0,runs=[],valid=false,ready=false;
 const example = $('example');
 const profile = $('profile');
 const panel = $('account-panel');
 const toggle = $('account-toggle');
 const yandex = $('account-yandex');
 const yandexButton = $('yandex-signin');
 const config = window.SKEBALANCE_CONFIG || {};
 const yandexCallback = readYandexCallback();
 const yandexEnabled = config.yandexLoginEnabled === true;
 function message(text,error=false){const status=$(user?'profile-message':'account-message');status.textContent=text;status.classList.toggle('error',error);}
 function renderRoute(scroll = false, accountChanged = false) {
  const wantsProfile = profileSections.has(location.hash);
  const showProfile = wantsProfile && !!user;
  const enteringProfile = showProfile && (profile.hidden || accountChanged);
  const wasPanelHidden = panel.hidden;
  example.hidden = showProfile;
  profile.hidden = profile.inert = !showProfile;
  panel.hidden = !ready || !wantsProfile || !!user;
  toggle.setAttribute('aria-controls', user ? 'profile' : 'account-panel');
  toggle.setAttribute('aria-expanded', String(showProfile || !panel.hidden));
  if (enteringProfile) setTimeout(() => {
   if (!profile.hidden) loadRuns().catch(error => message(readableError(error), true));
  }, 0);
  if (!scroll) return;
  if (showProfile) {
   const target = $(location.hash.slice(1));
   (target.hidden ? profile : target).scrollIntoView({block: 'start'});
   if (location.hash === '#profile') $('profile-heading').focus({preventScroll: true});
  } else if (!panel.hidden) {
   panel.scrollIntoView({block: 'start'});
   if (wasPanelHidden) (yandex.hidden ? $('account-email') : yandexButton).focus({preventScroll: true});
  } else if (!wantsProfile) window.scrollTo(0, 0);
 }
 function goTo(hash, replace = false) {
  if (location.hash !== hash) {
   const url = new URL(location.href);
   url.hash = hash;
   history[replace ? 'replaceState' : 'pushState'](history.state, '', url);
  }
  renderRoute(true);
 }
 function setMode(next){mode=next;$('login-mode').setAttribute('aria-pressed',String(mode==='login'));$('signup-mode').setAttribute('aria-pressed',String(mode==='signup'));$('account-submit').textContent=mode==='signup'?'Создать аккаунт':'Войти';$('account-password').autocomplete=mode==='signup'?'new-password':'current-password';$('account-password').minLength=mode==='signup'?12:1;$('password-hint').hidden=mode!=='signup';message('');}
 function saveLabel(){ $('save-calculation').disabled=!user||!valid; }
 function renderRuns(){
  $('saved-list').innerHTML=runs.length?runs.map(r=>{let summary='';try{const s=cleanSnapshot(r.snapshot),result=resultForSnapshot(s);summary=`${s.from} — ${s.to} · после покупки ${money(result.after)}`;}catch{summary='Этот расчёт не удалось прочитать.';}
   return `<li class="saved-run"><div><strong>${esc(r.name)}</strong><span>${esc(summary)}</span></div><div class="saved-actions"><button class="secondary" type="button" data-open-run="${esc(r.id)}">Открыть</button><button class="text-button remove" type="button" data-delete-run="${esc(r.id)}">Удалить</button></div></li>`;}).join(''):'<li class="empty">Сохранённых расчётов пока нет. Постройте прогноз и нажмите «Сохранить в профиле».</li>';
 }
 async function loadRuns(){const epoch=revision;if(!user||!client)return;$('saved-list').innerHTML='<li class="empty">Загружаем сохранённые расчёты…</li>';
  const {data,error}=await client.from('saved_calculations').select('id,name,snapshot,created_at').order('created_at',{ascending:false}).limit(20);
  if(epoch!==revision)return;if(error){runs=[];renderRuns();message(readableError(error),true);return;}runs=data||[];renderRuns();
 }
 function sessionChanged(event,session){
  const previousUserId = user?.id;
  const next = session?.user ?? null;
  const changed = next?.id !== previousUserId;
  const firstSession = !ready;
  ready = true;
  user = next;
  if (changed) {
   revision++;
   runs = [];
   renderRuns();
   $('profile-message').textContent = '';
   $('account-message').textContent = '';
   window.dispatchEvent(new CustomEvent('skebalance:profile', { detail: { userId: user?.id, previousUserId } }));
  }
  toggle.textContent=user?'Личный профиль':'Войти';$('account-user-email').textContent=user?.email||(user?.app_metadata?.provider===yandexProvider?'Яндекс ID':'');saveLabel();
  yandex.hidden = !!user || !yandexEnabled;
  if (!user || changed) $('password-update-form').hidden = true;
  if (event === 'PASSWORD_RECOVERY' && user) {
   $('password-update-form').hidden = false;
   goTo('#profile');
   message('Задайте новый пароль для аккаунта.');
   $('new-password').focus();
  } else if (!user && previousUserId) goTo('', true);
  else renderRoute(firstSession || changed, changed);
 }
 window.addEventListener('hashchange', () => renderRoute(true));
 toggle.addEventListener('click', () => goTo(!panel.hidden ? '' : '#profile'));
 $('account-close').addEventListener('click',()=>{goTo('');toggle.focus({preventScroll:true});});
 $('skip-content').addEventListener('click', event => {
  event.preventDefault();
  $('main').focus();
 });
 $('login-mode').addEventListener('click',()=>setMode('login'));$('signup-mode').addEventListener('click',()=>setMode('signup'));
 window.addEventListener('skebalance:calculation',e=>{valid=!!e.detail?.valid;saveLabel();$('save-message').textContent='';});
 $('account-form').addEventListener('submit',async e=>{e.preventDefault();if(!client){message('Вход пока недоступен. Можно посмотреть учебный пример на главной.',true);return;}if(!$('account-form').reportValidity())return;
  const epoch=revision,submittedMode=mode,email=$('account-email').value.trim(),password=$('account-password').value,destination=profileSections.has(location.hash)?location.hash:'#profile';$('account-submit').disabled=true;message(submittedMode==='signup'?'Создаём аккаунт…':'Входим…');
  try{const result=submittedMode==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;
   $('account-password').value='';if(submittedMode==='signup'&&!result.data.session)message('Проверьте почту: перейдите по ссылке подтверждения, затем войдите.');else {goTo(destination);message('Вы вошли в личный профиль.');}
  }catch(err){if(epoch===revision)message(readableError(err),true);}finally{$('account-submit').disabled=false;}
 });
 $('forgot-password').addEventListener('click',async()=>{if(!client)return;if(!$('account-email').reportValidity())return;$('forgot-password').disabled=true;message('Запрашиваем письмо для восстановления…');try{const {error}=await client.auth.resetPasswordForEmail($('account-email').value.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;message('Если адрес зарегистрирован, на него придёт ссылка для восстановления пароля.');}catch(e){message(readableError(e),true);}finally{$('forgot-password').disabled=false;}});
 $('password-update-form').addEventListener('submit',async e=>{e.preventDefault();if(!client||!$('password-update-form').reportValidity())return;const button=$('password-update-submit');button.disabled=true;try{const {error}=await client.auth.updateUser({password:$('new-password').value});if(error)throw error;$('new-password').value='';$('password-update-form').hidden=true;message('Пароль изменён.');}catch(err){message(readableError(err),true);}finally{button.disabled=false;}});
 $('signout').addEventListener('click',async()=>{if(!client)return;$('signout').disabled=true;try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;sessionChanged('SIGNED_OUT',null);toggle.focus({preventScroll:true});}catch(e){message(readableError(e),true);}finally{$('signout').disabled=false;}});
 $('refresh-saved').addEventListener('click',()=>loadRuns().catch(e=>message(readableError(e),true)));
 $('save-calculation').addEventListener('click',async()=>{if(!user)return;
  const name=$('save-name').value.trim();if(!name){$('save-name').reportValidity();return;}let snapshot;try{snapshot=cleanSnapshot(capture());}catch(e){$('save-message').textContent=e.message;return;}
  const epoch=revision;$('save-calculation').disabled=true;$('save-message').textContent='Сохраняем расчёт…';
  try{const {error}=await client.from('saved_calculations').insert({user_id:user.id,name,snapshot});if(error)throw error;if(epoch!==revision)return;$('save-message').textContent='Расчёт сохранён в профиле.';await loadRuns();}
  catch(e){if(epoch===revision)$('save-message').textContent=readableError(e);}finally{saveLabel();}
 });
 $('saved-list').addEventListener('click',async e=>{const openId=e.target.closest('[data-open-run]')?.dataset.openRun,deleteId=e.target.closest('[data-delete-run]')?.dataset.deleteRun;
  if(openId){const r=runs.find(r=>r.id===openId);if(!r)return;try{restore(cleanSnapshot(r.snapshot));$('save-name').value=r.name;message('Расчёт открыт. Исходная выписка не сохранялась.');}catch(err){message(err.message,true);}return;}
  if(deleteId){const r=runs.find(r=>r.id===deleteId);if(!r||!confirm('Удалить сохранённый расчёт «'+r.name+'»?'))return;const epoch=revision;e.target.disabled=true;
   try{const {error}=await client.from('saved_calculations').delete().eq('id',deleteId);if(error)throw error;if(epoch!==revision)return;runs=runs.filter(r=>r.id!==deleteId);renderRuns();message('Расчёт удалён.');}catch(err){if(epoch===revision)message(readableError(err),true);}finally{if(e.target.isConnected)e.target.disabled=false;}
  }
 });
 function disableLogin(){ready=true;yandex.hidden=true;$('account-connection').textContent='Вход временно недоступен. Учебный пример доступен на главной.';$('account-submit').disabled=true;$('forgot-password').disabled=true;renderRoute(true);}
 if(!config.supabaseUrl||!/^sb_publishable_/.test(config.supabasePublishableKey||'')||!window.supabase?.createClient){disableLogin();return;}
 let origin;try{origin=new URL(config.supabaseUrl);if(origin.protocol!=='https:')throw Error('HTTPS required');}catch{disableLogin();return;}
 const fetchWithTimeout=(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
 try {
  client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:true},global:{fetch:fetchWithTimeout}});
 } catch {disableLogin();return;}
 $('account-connection').textContent='В аккаунте сохраняются только выбранные расчёты. PDF и история операций остаются в браузере.';
 client.auth.onAuthStateChange((event,session)=>sessionChanged(event,session));
 yandexButton.addEventListener('click', async () => {
  if (!yandexEnabled || user) return;
  yandexButton.disabled = true;
  message('Переходим к Яндексу…');
  try {
   // Use PKCE for Yandex while keeping existing email links compatible across tabs.
   const { verifier, challenge } = await createYandexChallenge();
   const redirectTo = new URL('./?auth=yandex', location.href).href;
   const { data, error } = await client.auth.signInWithOAuth({
    provider: yandexProvider,
    options: {
     redirectTo,
     skipBrowserRedirect: true,
     queryParams: { code_challenge: challenge, code_challenge_method: 's256' },
    },
   });
   if (error || !data.url) throw error || new Error('Missing authorize URL');
   if (user) {
    yandexButton.disabled = false;
    return;
   }
   sessionStorage.setItem(yandexPendingKey, JSON.stringify({
    verifier, destination: profileSections.has(location.hash) ? location.hash : '#profile', started: Date.now(),
   }));
   location.assign(data.url);
  } catch {
   yandexButton.disabled = false;
   message('Не удалось открыть вход через Яндекс. Попробуйте ещё раз.', true);
  }
 });
 window.addEventListener('pageshow', event => {
  if (!event.persisted || !yandexButton.disabled) return;
  yandexButton.disabled = false;
  sessionStorage.removeItem(yandexPendingKey);
  message('');
 });

 const {data,error}=await client.auth.getSession();
 sessionChanged('INITIAL_SESSION',data.session);
 if(error)message(readableError(error),true);
 if (!yandexCallback || !yandexEnabled) return;

 try {
  const pending = sessionStorage.getItem(yandexPendingKey);
  sessionStorage.removeItem(yandexPendingKey);
  const attempt = JSON.parse(pending);
  if (!/^[a-f0-9]{64}$/.test(attempt?.verifier ?? '') || !Number.isFinite(attempt.started) ||
      Date.now() - attempt.started > 30 * 60 * 1000) throw new Error('Missing OAuth attempt');
  const destination = profileSections.has(attempt.destination) ? attempt.destination : '#profile';
  if (yandexCallback.denied) {
   goTo(destination);
   message('Вход через Яндекс отменён.');
   return;
  }
  if (!yandexCallback.code) throw new Error('Missing OAuth code');

  const endpoint = new URL('/auth/v1/token?grant_type=pkce', origin);
  const response = await fetchWithTimeout(endpoint, {
   method: 'POST',
   headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' },
   body: JSON.stringify({ auth_code: yandexCallback.code, code_verifier: attempt.verifier }),
  });
  if (!response.ok) throw new Error('OAuth code exchange failed');
  const { access_token, refresh_token } = await response.json();
  const signedIn = await client.auth.setSession({ access_token, refresh_token });
  if (signedIn.error || !signedIn.data.session) throw new Error('Missing OAuth session');
  goTo(destination);
  if (attempt.draft) {
   try { restore(attempt.draft, { draft: true }); $('save-name').value = attempt.name; } catch { /* Older drafts are optional. */ }
  }
  message('Вы вошли через Яндекс.');
 } catch {
  goTo('#profile');
  message('Не удалось завершить вход через Яндекс. Попробуйте ещё раз.', true);
 }
}
