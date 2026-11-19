import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
await fs.mkdir('qa',{recursive:true});
const executablePath=process.env.BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined);
const origin=`http://127.0.0.1:${process.env.PORT||4173}`,baseUrl=`${origin}/`;
const browser=await chromium.launch({executablePath,headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],saved=[],calls=[];
page.on('pageerror',e=>errors.push(e.message));
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'test@example.com',created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,email:user.email})+'.test-signature';
const yandexUser={...user,email:'',app_metadata:{provider:'custom:yandex',providers:['custom:yandex']}};
let emailFailure=false,saveFailure=false,yandexEnabled=false,yandexDenied=false,oauthChallenge='',oauthExchanges=0;
await page.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.SKEBALANCE_CONFIG={supabaseUrl:'https://test-project.supabase.co',supabasePublishableKey:'sb_publishable_browser_test',yandexLoginEnabled:${yandexEnabled}};`}));
await page.route('https://test-project.supabase.co/**',async route=>{
 const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,DELETE,PUT,OPTIONS','content-type':'application/json'};
 if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
 const body=req.postDataJSON();calls.push({path:url.pathname,method:req.method(),body});
 if(url.pathname.endsWith('/signup')){await route.fulfill({status:200,headers,body:JSON.stringify({user,session:null})});return;}
 if(url.pathname==='/auth/v1/authorize'){
  assert.equal(url.searchParams.get('provider'),'custom:yandex');
  assert.equal(url.searchParams.get('redirect_to'),`${baseUrl}?auth=yandex`);
  assert.equal(url.searchParams.get('code_challenge_method'),'s256');
  oauthChallenge=url.searchParams.get('code_challenge');
  assert.match(oauthChallenge,/^[\w-]{43}$/);
  const redirect=yandexDenied?'#error=access_denied&error_code=access_denied':'&code=synthetic-auth-code';
  await route.fulfill({status:302,headers:{...headers,location:`${baseUrl}?auth=yandex${redirect}`}});
  return;
 }
 if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='pkce'){
  assert.equal(body.auth_code,'synthetic-auth-code');
  assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'),oauthChallenge);
  assert.equal(req.headers().apikey,'sb_publishable_browser_test');
  oauthExchanges++;
  await route.fulfill({status:200,headers,body:JSON.stringify({access_token:token,refresh_token:'synthetic-refresh-token',provider_token:'never-store-yandex-token'})});
  return;
 }
 if(url.pathname.endsWith('/token')){if(body.password==='wrong-password'){await route.fulfill({status:400,headers,body:JSON.stringify({code:'invalid_credentials',msg:'Invalid login credentials'})});return;}await route.fulfill({status:200,headers,body:JSON.stringify({access_token:token,refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})});return;}
 if(url.pathname.endsWith('/recover')){await route.fulfill({status:emailFailure?429:200,headers,body:JSON.stringify(emailFailure?{code:'over_email_send_rate_limit',msg:'Too many requests'}:{})});return;}
 if(url.pathname.endsWith('/logout')){await route.fulfill({status:204,headers});return;}
 if(url.pathname.endsWith('/user')){await route.fulfill({status:200,headers,body:JSON.stringify(oauthExchanges?yandexUser:user)});return;}
 if(url.pathname==='/rest/v1/saved_calculations'){
  if(req.method()==='GET'){await route.fulfill({status:200,headers,body:JSON.stringify(saved)});return;}
  if(req.method()==='POST'){if(saveFailure){await route.fulfill({status:403,headers,body:JSON.stringify({code:'42501',message:'RLS violation'})});return;}saved.unshift({...body,id:crypto.randomUUID(),created_at:new Date().toISOString()});await route.fulfill({status:201,headers,body:''});return;}
  if(req.method()==='DELETE'){const id=url.searchParams.get('id').replace(/^eq\./,'');const index=saved.findIndex(r=>r.id===id);if(index>=0)saved.splice(index,1);await route.fulfill({status:204,headers});return;}
 }
 await route.fulfill({status:404,headers,body:'{}'});
});
try{
 await page.goto(baseUrl);await page.locator('#demo').click();await page.locator('#confirmed').check();await page.locator('#continue').click();await page.locator('#forecast').waitFor({state:'visible'});
 await page.locator('#save-calculation').click();await page.locator('#account-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#yandex-signin').isVisible(),false);
 await page.locator('#signup-mode').click();await page.locator('#account-email').fill(user.email);await page.locator('#account-password').fill('long-test-password-123');await page.locator('#account-submit').click();await page.getByText('Проверьте почту: перейдите по ссылке подтверждения, затем войдите.',{exact:true}).waitFor();
 await page.locator('#login-mode').click();await page.locator('#account-password').fill('wrong-password');await page.locator('#account-submit').click();await page.getByText('Не удалось войти. Проверьте email и пароль.',{exact:true}).waitFor();
 emailFailure=true;await page.locator('#forgot-password').click();await page.getByText('Слишком много запросов. Подождите несколько минут и повторите.',{exact:true}).waitFor();emailFailure=false;
 await page.locator('#account-password').fill('long-test-password-123');await page.locator('#account-submit').click();await page.locator('#account-user').waitFor({state:'visible'});assert.equal(await page.locator('#account-password').inputValue(),'');
 await page.locator('#save-name').fill('Наушники');await page.locator('#save-calculation').click();await page.getByText('Расчёт сохранён. Он доступен в «Мои расчёты».',{exact:true}).waitFor();assert.equal(saved.length,1);assert.equal(saved[0].user_id,user.id);assert.equal(saved[0].snapshot.operations,undefined);assert.equal(saved[0].snapshot.filename,undefined);assert.equal(saved[0].snapshot.recurring[0].operationIds,undefined);
 const before=await page.locator('#after-amount').textContent();await page.locator('#reset').click();await page.locator('[data-open-run]').click();await page.locator('#forecast').waitFor({state:'visible'});assert.equal(await page.locator('#after-amount').textContent(),before);assert.equal(await page.locator('#review').isVisible(),false);await page.locator('#purchase').fill('200000');await page.locator('#decision.deficit').waitFor();
 saveFailure=true;await page.locator('#save-calculation').click();await page.locator('#save-message').filter({hasText:'Нет доступа'}).waitFor();assert.equal(saved.length,1);saveFailure=false;
 await page.locator('#account-panel').scrollIntoViewIfNeeded();await page.screenshot({path:'qa/account-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#account-panel').screenshot({path:'qa/account-mobile.png'});await page.setViewportSize({width:1440,height:1000});
 page.once('dialog',d=>d.accept());await page.locator('[data-delete-run]').click();await page.getByText('Расчёт удалён.',{exact:true}).waitFor();assert.equal(saved.length,0);
 await page.locator('#signout').click();await page.locator('#account-user').waitFor({state:'hidden'});assert.equal(await page.locator('#saved-section').isVisible(),false);assert.equal(await page.locator('#forecast').isVisible(),false);
 assert.equal(calls.filter(r=>r.path==='/rest/v1/saved_calculations'&&r.method==='POST').length,2);

 yandexEnabled=true;
 await page.goto(`${baseUrl}?auth=yandex&code=unsolicited`);
 await page.getByText('Не удалось завершить вход через Яндекс. Попробуйте ещё раз.',{exact:true}).waitFor();
 assert.equal(oauthExchanges,0);
 await page.locator('#demo').click();await page.locator('#confirmed').check();await page.locator('#continue').click();
 await page.locator('#save-name').fill('Черновик');
 const draftAmount=await page.locator('#after-amount').textContent();
 await page.locator('#save-calculation').click();
 yandexDenied=true;
 await page.locator('#yandex-signin').click();
 await page.getByText('Вход через Яндекс отменён.',{exact:true}).waitFor();
 assert.equal(await page.locator('#account-user').isVisible(),false);
 assert.equal(await page.locator('#after-amount').textContent(),draftAmount);
 assert.equal(await page.locator('#save-name').inputValue(),'Черновик');
 assert.equal(oauthExchanges,0);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#account-panel').screenshot({path:'qa/account-yandex-mobile.png'});

 yandexDenied=false;
 await page.locator('#yandex-signin').click();
 await page.getByText('Вы вошли через Яндекс. Теперь можно сохранять расчёты.',{exact:true}).waitFor();
 assert.equal(oauthExchanges,1);
 assert.equal(page.url(),baseUrl);
 assert.equal(await page.locator('#account-user-email').textContent(),'Яндекс ID');
 assert.equal(await page.locator('#yandex-signin').isVisible(),false);
 assert.equal(await page.locator('#after-amount').textContent(),draftAmount);
 assert.equal(await page.evaluate(()=>Object.values(sessionStorage).some(value=>value.includes('never-store-yandex-token'))),false);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('skebalance-yandex-signin')),null);
 await page.locator('#save-calculation').click();
 await page.getByText('Расчёт сохранён. Он доступен в «Мои расчёты».',{exact:true}).waitFor();
 assert.equal(saved[0].name,'Черновик');
 assert.deepEqual(errors,[]);
 console.log('Account browser checks passed with a mock API, including Yandex PKCE, cancellation, draft restoration and saving.');
}finally{await browser.close();}
