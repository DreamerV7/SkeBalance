import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('qa',{recursive:true});
const executablePath=process.env.BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined);
const browser=await chromium.launch({executablePath,headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],saved=[],calls=[];
page.on('pageerror',e=>errors.push(e.message));
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'test@example.com',created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,email:user.email})+'.test-signature';
let emailFailure=false,saveFailure=false;
await page.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:"window.SKEBALANCE_CONFIG={supabaseUrl:'https://test-project.supabase.co',supabasePublishableKey:'sb_publishable_browser_test'};"}));
await page.route('https://test-project.supabase.co/**',async route=>{
 const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'http://127.0.0.1:4173','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,DELETE,PUT,OPTIONS','content-type':'application/json'};
 if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
 const body=req.postDataJSON();calls.push({path:url.pathname,method:req.method(),body});
 if(url.pathname.endsWith('/signup')){await route.fulfill({status:200,headers,body:JSON.stringify({user,session:null})});return;}
 if(url.pathname.endsWith('/token')){if(body.password==='wrong-password'){await route.fulfill({status:400,headers,body:JSON.stringify({code:'invalid_credentials',msg:'Invalid login credentials'})});return;}await route.fulfill({status:200,headers,body:JSON.stringify({access_token:token,refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})});return;}
 if(url.pathname.endsWith('/recover')){await route.fulfill({status:emailFailure?429:200,headers,body:JSON.stringify(emailFailure?{code:'over_email_send_rate_limit',msg:'Too many requests'}:{})});return;}
 if(url.pathname.endsWith('/logout')){await route.fulfill({status:204,headers});return;}
 if(url.pathname.endsWith('/user')){await route.fulfill({status:200,headers,body:JSON.stringify(user)});return;}
 if(url.pathname==='/rest/v1/saved_calculations'){
  if(req.method()==='GET'){await route.fulfill({status:200,headers,body:JSON.stringify(saved)});return;}
  if(req.method()==='POST'){if(saveFailure){await route.fulfill({status:403,headers,body:JSON.stringify({code:'42501',message:'RLS violation'})});return;}saved.unshift({...body,id:crypto.randomUUID(),created_at:new Date().toISOString()});await route.fulfill({status:201,headers,body:''});return;}
  if(req.method()==='DELETE'){const id=url.searchParams.get('id').replace(/^eq\./,'');const index=saved.findIndex(r=>r.id===id);if(index>=0)saved.splice(index,1);await route.fulfill({status:204,headers});return;}
 }
 await route.fulfill({status:404,headers,body:'{}'});
});
try{
 await page.goto('http://127.0.0.1:4173/');await page.locator('#demo').click();await page.locator('#confirmed').check();await page.locator('#continue').click();await page.locator('#forecast').waitFor({state:'visible'});
 await page.locator('#save-calculation').click();await page.locator('#account-panel').waitFor({state:'visible'});
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
 assert.equal(calls.filter(r=>r.path==='/rest/v1/saved_calculations'&&r.method==='POST').length,2);assert.deepEqual(errors,[]);
 console.log('Account browser checks passed with a mock API: signup confirmation, login failure/success, email throttling, save/reopen/delete, RLS denial, no raw history upload, logout clearing, mobile layout.');
}finally{await browser.close();}
