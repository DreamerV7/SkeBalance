import {cleanSnapshot,resultForSnapshot} from './snapshot.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n/100);
export function readableError(error){
 const code=error?.code||'',message=error?.message||'';
 if(code==='invalid_credentials'||/Invalid login credentials/i.test(message))return 'Не удалось войти. Проверьте email и пароль.';
 if(code==='email_not_confirmed')return 'Подтвердите email по ссылке из письма, затем войдите.';
 if(code==='user_already_exists'||/already registered/i.test(message))return 'Этот email уже зарегистрирован. Попробуйте войти или восстановить пароль.';
 if(code==='weak_password')return 'Выберите более надёжный пароль: не менее 12 символов.';
 if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit'||error?.status===429)return 'Слишком много запросов. Подождите несколько минут и повторите.';
 if(code==='email_address_not_authorized'||/Email address not authorized/i.test(message))return 'Отправка писем пока недоступна для этого адреса. Используйте настроенный тестовый аккаунт или обратитесь к автору проекта.';
 if(code==='PGRST205'||code==='42P01')return 'Сохранение ещё не подключено. Расчёт можно использовать без аккаунта.';
 if(code==='42501')return 'Нет доступа к этому расчёту. Войдите заново и повторите.';
 if(error?.status===401)return 'Сессия истекла. Войдите заново.';
 if(/fetch|network|abort|timed out/i.test(message)||error?.name==='AbortError')return 'Не удалось связаться с сервером. Проверьте интернет и повторите.';
 return 'Действие не выполнено. Повторите позже. Данные в форме сохранены.';
}
export async function initAccount({capture,restore}){
 let client=null,user=null,mode='login',revision=0,runs=[],valid=false;
 function message(text,error=false){$('account-message').textContent=text;$('account-message').className='account-message'+(error?' error':'');}
 function open(){ $('account-panel').hidden=false;$('account-toggle').setAttribute('aria-expanded','true');$('account-panel').scrollIntoView({behavior:'smooth',block:'start'});if(!user)$('account-email').focus({preventScroll:true});}
 function setMode(next){mode=next;$('login-mode').setAttribute('aria-pressed',String(mode==='login'));$('signup-mode').setAttribute('aria-pressed',String(mode==='signup'));$('account-submit').textContent=mode==='signup'?'Создать аккаунт':'Войти';$('account-password').autocomplete=mode==='signup'?'new-password':'current-password';$('account-password').minLength=mode==='signup'?12:1;$('password-hint').hidden=mode!=='signup';message('');}
 function saveLabel(){ $('save-calculation').textContent=user?'Сохранить в аккаунте':'Войти и сохранить';$('save-calculation').disabled=!valid; }
 function renderRuns(){
  $('saved-list').innerHTML=runs.length?runs.map(r=>{let summary='';try{const s=cleanSnapshot(r.snapshot),result=resultForSnapshot(s);summary=`${s.from} — ${s.to} · после покупки ${money(result.after)}`;}catch{summary='Этот расчёт не удалось прочитать.';}
   return `<li class="saved-run"><div><strong>${esc(r.name)}</strong><span>${esc(summary)}</span></div><div class="saved-actions"><button class="secondary" type="button" data-open-run="${esc(r.id)}">Открыть</button><button class="text-button remove" type="button" data-delete-run="${esc(r.id)}">Удалить</button></div></li>`;}).join(''):'<li class="empty">Сохранённых расчётов пока нет. Постройте прогноз и нажмите «Сохранить в аккаунте».</li>';
 }
 async function loadRuns(){const epoch=revision;if(!user||!client)return;$('saved-list').innerHTML='<li class="empty">Загружаем сохранённые расчёты…</li>';
  const {data,error}=await client.from('saved_calculations').select('id,name,snapshot,created_at').order('created_at',{ascending:false}).limit(20);
  if(epoch!==revision)return;if(error){runs=[];renderRuns();message(readableError(error),true);return;}runs=data||[];renderRuns();
 }
 function sessionChanged(event,session){
  const next=session?.user??null;const changed=next?.id!==user?.id;if(changed){revision++;runs=[];renderRuns();}user=next;
  $('account-form').hidden=!!user;$('account-tabs').hidden=!!user;$('account-user').hidden=!user;$('saved-section').hidden=!user;$('account-toggle').textContent=user?'Мои расчёты':'Войти';$('account-user-email').textContent=user?.email||'';saveLabel();
  if(event==='PASSWORD_RECOVERY'){open();$('password-update-form').hidden=false;message('Задайте новый пароль для аккаунта.');}
  else if(!user)$('password-update-form').hidden=true;
  if(event==='SIGNED_OUT'&&changed)window.dispatchEvent(new CustomEvent('skebalance:signedout'));
  if(changed&&user)setTimeout(()=>loadRuns().catch(e=>message(readableError(e),true)),0);
 }
 $('account-toggle').addEventListener('click',()=>{$('account-panel').hidden=!$('account-panel').hidden;$('account-toggle').setAttribute('aria-expanded',String(!$('account-panel').hidden));});
 $('account-close').addEventListener('click',()=>{$('account-panel').hidden=true;$('account-toggle').setAttribute('aria-expanded','false');$('account-toggle').focus();});
 $('login-mode').addEventListener('click',()=>setMode('login'));$('signup-mode').addEventListener('click',()=>setMode('signup'));
 window.addEventListener('skebalance:calculation',e=>{valid=!!e.detail?.valid;saveLabel();$('save-message').textContent='';});
 $('account-form').addEventListener('submit',async e=>{e.preventDefault();if(!client){message('Вход пока недоступен. Расчёт можно использовать без аккаунта.',true);return;}if(!$('account-form').reportValidity())return;
  const epoch=revision,submittedMode=mode,email=$('account-email').value.trim(),password=$('account-password').value;$('account-submit').disabled=true;message(submittedMode==='signup'?'Создаём аккаунт…':'Входим…');
  try{const result=submittedMode==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;
   $('account-password').value='';if(submittedMode==='signup'&&!result.data.session)message('Проверьте почту: перейдите по ссылке подтверждения, затем войдите.');else message('Вы вошли. Теперь можно сохранять расчёты.');
  }catch(err){if(epoch===revision)message(readableError(err),true);}finally{$('account-submit').disabled=false;}
 });
 $('forgot-password').addEventListener('click',async()=>{if(!client)return;if(!$('account-email').reportValidity())return;$('forgot-password').disabled=true;message('Запрашиваем письмо для восстановления…');try{const {error}=await client.auth.resetPasswordForEmail($('account-email').value.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;message('Если адрес зарегистрирован, на него придёт ссылка для восстановления пароля.');}catch(e){message(readableError(e),true);}finally{$('forgot-password').disabled=false;}});
 $('password-update-form').addEventListener('submit',async e=>{e.preventDefault();if(!client||!$('password-update-form').reportValidity())return;const button=$('password-update-submit');button.disabled=true;try{const {error}=await client.auth.updateUser({password:$('new-password').value});if(error)throw error;$('new-password').value='';$('password-update-form').hidden=true;message('Пароль изменён.');}catch(err){message(readableError(err),true);}finally{button.disabled=false;}});
 $('signout').addEventListener('click',async()=>{if(!client)return;$('signout').disabled=true;try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;sessionChanged('SIGNED_OUT',null);message('Вы вышли из аккаунта.');}catch(e){message(readableError(e),true);}finally{$('signout').disabled=false;}});
 $('refresh-saved').addEventListener('click',()=>loadRuns().catch(e=>message(readableError(e),true)));
 $('save-calculation').addEventListener('click',async()=>{if(!user){open();if(!client)message('Вход пока недоступен. Расчёт можно использовать без аккаунта.',true);else message('Войдите или создайте аккаунт, чтобы сохранить этот расчёт.');return;}
  const name=$('save-name').value.trim();if(!name){$('save-name').reportValidity();return;}let snapshot;try{snapshot=cleanSnapshot(capture());}catch(e){$('save-message').textContent=e.message;return;}
  const epoch=revision;$('save-calculation').disabled=true;$('save-message').textContent='Сохраняем расчёт…';
  try{const {error}=await client.from('saved_calculations').insert({user_id:user.id,name,snapshot});if(error)throw error;if(epoch!==revision)return;$('save-message').textContent='Расчёт сохранён. Он доступен в «Мои расчёты».';await loadRuns();}
  catch(e){if(epoch===revision)$('save-message').textContent=readableError(e);}finally{saveLabel();}
 });
 $('saved-list').addEventListener('click',async e=>{const openId=e.target.closest('[data-open-run]')?.dataset.openRun,deleteId=e.target.closest('[data-delete-run]')?.dataset.deleteRun;
  if(openId){const r=runs.find(r=>r.id===openId);if(!r)return;try{restore(cleanSnapshot(r.snapshot));$('save-name').value=r.name;message('Расчёт открыт. Исходная выписка не сохранялась.');}catch(err){message(err.message,true);}return;}
  if(deleteId){const r=runs.find(r=>r.id===deleteId);if(!r||!confirm('Удалить сохранённый расчёт «'+r.name+'»?'))return;const epoch=revision;e.target.disabled=true;
   try{const {error}=await client.from('saved_calculations').delete().eq('id',deleteId);if(error)throw error;if(epoch!==revision)return;runs=runs.filter(r=>r.id!==deleteId);renderRuns();message('Расчёт удалён.');}catch(err){if(epoch===revision)message(readableError(err),true);}finally{if(e.target.isConnected)e.target.disabled=false;}
  }
 });
 const config=window.SKEBALANCE_CONFIG||{};
 if(!config.supabaseUrl||!/^sb_publishable_/.test(config.supabasePublishableKey||'')||!window.supabase?.createClient){$('account-connection').textContent='Аккаунты ещё не подключены. Калькулятор работает без регистрации.';$('account-submit').disabled=true;$('forgot-password').disabled=true;return;}
 let origin;try{origin=new URL(config.supabaseUrl);if(origin.protocol!=='https:')throw Error('HTTPS required');}catch{$('account-connection').textContent='Вход временно недоступен. Калькулятор работает без регистрации.';return;}
 const fetchWithTimeout=(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
 client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:true},global:{fetch:fetchWithTimeout}});
 $('account-connection').textContent='В аккаунте сохраняются только выбранные расчёты. PDF и история операций остаются в браузере.';
 client.auth.onAuthStateChange((event,session)=>sessionChanged(event,session));
 const {data,error}=await client.auth.getSession();if(error)message(readableError(error),true);else if(data.session)sessionChanged('INITIAL_SESSION',data.session);
}
