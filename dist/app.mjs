import {initAccount} from './account.mjs';
import {cleanSnapshot} from './snapshot.mjs';
import {cents,dateISO,addDays,dayNumber,parseCSV,parseSberLines,detectRecurring,dailyEstimate,forecast,toCSV,classifyExpense,expenseCategories,merchant,classifyIncome} from './core.mjs';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n/100);
const dt=s=>new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
let state={operations:[],recurring:[],manual:[],page:0,filename:'',demo:false,dailyManual:false,loaded:false,ordinaryKeys:[],confirmedKeys:[]};
let lastForecast=null,loadToken=0;
$('from').value=today();$('to').value=addDays(today(),18);
function alertMessage(message){$('alert').textContent=message||'';$('alert').hidden=!message;}
function invalidate(){ $('confirmed').checked=false;$('forecast').hidden=true;$('step3').className='step';lastForecast=null;window.dispatchEvent(new CustomEvent('skebalance:calculation',{detail:{valid:false}})); }
function summary(){const t=state.operations,spend=t.filter(x=>x.amount<0).reduce((s,x)=>s-x.amount,0),income=t.filter(x=>x.amount>0).reduce((s,x)=>s+x.amount,0);$('history-summary').innerHTML=[['Операций',t.length],['Списания',fmt(spend)],['Поступления',fmt(income)]].map(([a,b])=>`<div><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('');$('operation-count').textContent=`(${t.length})`;}
function regularList(){ $('recurring-count').textContent=state.recurring.length;$('recurring-list').innerHTML=state.recurring.length?state.recurring.map(r=>`<div class="regular-row" data-id="${r.id}"><label class="regular-top"><input type="checkbox" data-field="active" ${r.active?'checked':''}><span class="regular-name">${esc(r.label)}</span></label><div class="regular-fields"><label>Ожидаемая сумма, ₽<input data-field="amount" type="number" min="0" step="0.01" value="${r.amount/100}" required></label><label>Число месяца<input data-field="day" type="number" min="1" max="31" step="1" value="${r.day}" required></label></div><p class="micro">${r.confirmed?'Отмечен вами как ежемесячный · ':''}${r.count} списания · последнее ${dt(r.lastDate)} · история исключена из обычных трат</p><button class="text-button" type="button" data-action="daily">Обычные траты — убрать из регулярных</button></div>`).join(''):'<p class="empty">Уверенных повторений не найдено. Добавьте известные обязательные платежи в расчёте ниже.</p>'; }
function estimate(){
 if(state.saved)return {daily:cents($('daily').value),days:0,total:0,categories:[]};
 try{const start=dateISO($('history-start').value),end=dateISO($('history-end').value),from=dateISO($('from').value),cutoff=end>=from?addDays(from,-1):end;
  const est=dailyEstimate(state.operations,state.recurring,start,cutoff);if(!state.dailyManual)$('daily').value=(est.daily/100).toFixed(2);
  $('daily-explanation').textContent=`${fmt(est.total)} за ${est.days} календарных дней без регулярных и исключённых операций. `+(state.dailyManual?'Используется ваша оценка.':'Используется среднее за полные дни, включая дни без трат.');if(est.days<60)$('daily-explanation').textContent+=' Короткая история: регулярные платежи могут не определиться.';if(end>=from)$('daily-explanation').textContent+=' Операции начиная с даты расчёта исключены из анализа.';$('daily-explanation').classList.toggle('manual-label',state.dailyManual);
  renderDailyCategories(est);return est;
 }catch(e){$('daily-categories').textContent='';$('daily-explanation').textContent=e.message;if(!state.dailyManual)$('daily').value='';throw e;}
}
function renderDailyCategories(est){
 $('daily-categories').innerHTML=est.categories.length?`<p class="micro">По категориям за выбранный период${state.dailyManual?' · ваша оценка введена отдельно':''}</p><ul class="daily-category-list">${est.categories.map(r=>`<li><span>${esc(r.category)}<small>${esc(fmt(r.total))} за период · ${r.count} оп.</small></span><strong>${esc(fmt(r.daily))}<small>в день</small></strong></li>`).join('')}</ul><p class="micro">Категории определены по описанию и данным банка: их можно исправить в операциях. Среднее считается по всем календарным дням; округление по категориям может отличаться от общего итога.</p>`:'<p class="micro">За этот период нет повседневных расходов: проверьте даты и исключённые операции.</p>';
}
function refreshRecurring(){
 const previous=new Map(state.recurring.map(r=>[r.key,r]));
 const from=dateISO($('from').value),start=dateISO($('history-start').value),end=dateISO($('history-end').value);
 state.recurring=detectRecurring(state.operations.filter(t=>t.date<from&&t.date>=start&&t.date<=end),state.confirmedKeys).filter(r=>!state.ordinaryKeys.includes(r.key)).map(r=>{const p=previous.get(r.key);return p?{...r,amount:p.amount,day:p.day,active:p.active}:r;});regularList();
}
function renderTransactions(){
 const q=$('search').value.toLowerCase(),filtered=state.operations.filter(t=>(t.description+' '+t.category+' '+(t.amount<0?classifyExpense(t).category:classifyIncome(t))).toLowerCase().includes(q)).slice().reverse(),max=Math.max(1,Math.ceil(filtered.length/50));state.page=Math.min(state.page,max-1);const items=filtered.slice(state.page*50,(state.page+1)*50);
 const regIds=new Set(state.recurring.flatMap(r=>r.operationIds));
 $('transactions-body').innerHTML=items.map(t=>{
  const c=classifyExpense(t),regular=regIds.has(t.id);
  const options=[...new Set([c.category,...expenseCategories])].map(category=>`<option value="${esc(category)}" ${category===c.category?'selected':''}>${esc(category)}</option>`).join('');
  return `<tr class="${t.ignored?'excluded':''}"><td>${dt(t.date)}</td><td>${esc(t.description)}${t.amount<0&&c.merchant?`<span class="source-category">Получатель: ${esc(c.merchant)}</span>`:''}${t.amount<0&&c.reviewTransfer?'<span class="transfer-flag">Входит в расходы. Если это перевод себе, отметьте «Не учитывать».</span>':''}${regular?'<span class="transfer-flag">Учтён в регулярных</span>':''}${t.amount<0&&!regular?`<button class="text-button operation-regular" type="button" data-regular="${t.id}" ${t.ignored?'disabled':''}>Сделать ежемесячным</button>`:''}</td><td>${t.amount<0?`<select data-category="${t.id}" aria-label="Категория: ${esc(t.description)}">${options}</select><span class="source-category">${esc(c.source)} · в выписке: ${esc(t.category)}</span>${!merchant(t).startsWith('unknown:')?`<button class="text-button" type="button" data-apply-category="${t.id}">Применить к этому получателю</button>`:''}`:`<span class="income">${esc(classifyIncome(t))}</span><span class="source-category">В выписке: ${esc(t.category)}</span>`}</td><td class="numeric ${t.amount>0?'income':''}">${esc(fmt(t.amount))}</td><td><input type="checkbox" data-op="${t.id}" aria-label="Не учитывать: ${esc(t.description)}" ${t.ignored?'checked':''}></td></tr>`;
 }).join('')||'<tr><td colspan="5">Нет подходящих операций.</td></tr>';
 $('page-label').textContent=`${state.page+1} / ${max}`;$('prev').disabled=state.page===0;$('next').disabled=state.page===max-1;
}
function download(text,name){const u=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);}
function loadData(parsed,filename,isDemo=false){
 $('from-display').readOnly=true;$('forecast-intro').textContent='Уточните баланс и дату дохода. Оценка расходов уже взята из истории.';
 state={operations:parsed.operations,recurring:[],ordinaryKeys:[],confirmedKeys:[],manual:[],page:0,filename,demo:isDemo,dailyManual:false,loaded:true};
 $('history-start').value=parsed.periodStart||parsed.operations[0].date;$('history-end').value=parsed.periodEnd||parsed.operations.at(-1).date;$('daily').value='';$('balance').value=isDemo?'35000':'';$('reserve').value=isDemo?'5000':'';$('purchase').value=isDemo?'12000':'0';$('search').value='';
 $('review').hidden=false;$('reset').hidden=false;$('file-label').textContent=(isDemo?'Учебный пример · ':'')+filename;$('import-warnings').textContent=parsed.warnings.join('\n')+(isDemo?'\nВсе операции и цифры вымышлены. Это демонстрация, а не проверка точности на реальных данных.':'');
 $('step1').className='step done';$('step2').className='step active';invalidate();summary();refreshRecurring();renderManual();renderTransactions();try{estimate();}catch(e){alertMessage(e.message);} $('review').scrollIntoView({behavior:'smooth',block:'start'});
}
async function readPDF(file){
 const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true});let pdf;
 try{pdf=await task.promise;if(pdf.numPages>80)throw Error('PDF слишком длинный: максимум 80 страниц.');const lines=[];
  for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),content=await page.getTextContent();const groups=[];for(const it of content.items){if(!it.str?.trim())continue;const y=it.transform[5];let group=groups.find(g=>Math.abs(g.y-y)<2);if(!group){group={y,items:[]};groups.push(group);}group.items.push({x:it.transform[4],str:it.str});}groups.sort((a,b)=>b.y-a.y);lines.push(...groups.map(g=>g.items.sort((a,b)=>a.x-b.x).map(x=>x.str).join(' ').replace(/\s+/g,' ').trim()));page.cleanup();}
  return parseSberLines(lines);
 }catch(e){if(e.name==='PasswordException')throw Error('PDF защищён паролем. Скачайте выписку без пароля или используйте CSV.');if(e.name==='InvalidPDFException')throw Error('Файл повреждён или не является PDF.');throw e;}finally{await task.destroy();}
}
async function upload(file){if(!file)return;const token=++loadToken;if(state.loaded)invalidate();alertMessage('');if(file.size>15*1024*1024){alertMessage('Максимальный размер файла — 15 МБ.');return;}
 $('upload-title').textContent='Читаем выписку…';$('upload').classList.add('busy');
 try{let parsed;if(/\.pdf$/i.test(file.name))parsed=await readPDF(file);else if(/\.csv$/i.test(file.name)){const buffer=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(buffer);if(text.includes('\uFFFD'))text=new TextDecoder('windows-1251').decode(buffer);parsed=parseCSV(text);}else throw Error('Выберите PDF или CSV. Файлы XLSX пока не поддерживаются.');if(token===loadToken)loadData(parsed,file.name);}
 catch(e){if(token===loadToken){alertMessage(e.message+'\nТочный импорт вашей выписки нужно проверить на её шаблоне. Можно попробовать CSV-шаблон или учебный пример.');$('alert').scrollIntoView({behavior:'smooth'});}}
 finally{if(token===loadToken){$('upload-title').textContent='Выберите или перетащите выписку';$('upload').classList.remove('busy');$('file').value='';}}
}
$('file').addEventListener('change',e=>upload(e.target.files[0]));
for(const ev of ['dragover','dragenter'])$('dropzone').addEventListener(ev,e=>{e.preventDefault();$('dropzone').classList.add('drag');});
for(const ev of ['dragleave','drop'])$('dropzone').addEventListener(ev,e=>{e.preventDefault();$('dropzone').classList.remove('drag');if(ev==='drop')upload(e.dataTransfer.files[0]);});
function demo(){
 alertMessage('');const from=today(),end=addDays(from,-1),d=new Date(from+'T00:00:00Z'),start=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-3,1)).toISOString().slice(0,10),operations=[];
 const push=(date,amount,category,description)=>operations.push({id:'op-'+operations.length,date,amount,category,description,balance:null,ignored:false});
 for(let date=start;date<=end;date=addDays(date,1)){const day=+date.slice(8);push(date,-42000,'Продукты','Магазин у дома');if(day%3===0)push(date,-18000,'Транспорт','Городской транспорт');if(day===5)push(date,-800000,'Жильё','Аренда квартиры');if(day===10)push(date,-65000,'Связь','Мобильная связь');if(day===20)push(date,-39900,'Подписки','Музыкальная подписка');if(day===1)push(date,5000000,'Доход','Зарплата');}
 loadData({operations,periodStart:start,periodEnd:end,warnings:['Учебная история за несколько месяцев: продукты, транспорт, аренда, связь и подписка.']},'демонстрационная история',true);
}
$('demo').addEventListener('click',demo);
$('template').addEventListener('click',()=>download('\uFEFFДата операции;Сумма;Категория;Описание;Остаток\r\n01.10.2026;50000;Доход;Зарплата;50000\r\n02.10.2026;-550;Продукты;Магазин;49450\r\n05.10.2026;-8000;Жильё;Аренда;41450\r\n','Шаблон-операций.csv'));
$('export').addEventListener('click',()=>download(toCSV(state.operations.map(t=>({...t,category:t.amount<0?classifyExpense(t).category:t.category}))),'СкеБаланс-операции.csv'));
$('recurring-list').addEventListener('change',e=>{const row=e.target.closest('[data-id]');if(!row)return;invalidate();const r=state.recurring.find(t=>t.id===row.dataset.id),field=e.target.dataset.field;try{if(field==='active')r.active=e.target.checked;else if(field==='amount'){r.amount=null;r.amount=cents(e.target.value);}else if(field==='day')r.day=Number(e.target.value);estimate();alertMessage('');}catch(err){alertMessage(err.message);}});
$('recurring-list').addEventListener('click',e=>{if(e.target.dataset.action!=='daily')return;const id=e.target.closest('[data-id]').dataset.id;const key=state.recurring.find(r=>r.id===id).key;state.ordinaryKeys.push(key);state.confirmedKeys=state.confirmedKeys.filter(k=>k!==key);state.recurring=state.recurring.filter(r=>r.id!==id);regularList();invalidate();renderTransactions();try{estimate();alertMessage('');}catch(e){alertMessage(e.message);}});
$('transactions-body').addEventListener('change',e=>{const t=state.operations.find(t=>t.id===(e.target.dataset.op||e.target.dataset.category));if(!t)return;if(e.target.dataset.category)t.categoryOverride=e.target.value;else t.ignored=e.target.checked;refreshRecurring();renderTransactions();invalidate();try{estimate();alertMessage('');}catch(e){alertMessage(e.message);}});
$('transactions-body').addEventListener('click',e=>{
 const apply=state.operations.find(t=>t.id===e.target.dataset.applyCategory);
 if(apply){const key=merchant(apply);if(key.startsWith('unknown:'))return;const category=classifyExpense(apply).category;let count=0;for(const op of state.operations){if(op.amount<0&&merchant(op)===key){op.categoryOverride=category;count++;}}refreshRecurring();renderTransactions();invalidate();try{estimate();alertMessage(`Категория «${category}» применена к ${count} операциям этого получателя в текущей выписке. При новом импорте правки нужно повторить.`);}catch(err){alertMessage(err.message);}return;}
 const t=state.operations.find(t=>t.id===e.target.dataset.regular);if(!t||t.amount>=0||t.ignored)return;
 if(t.date>=$('from').value){alertMessage('Для регулярного платежа выберите операцию до даты расчёта.');return;}
 const key=merchant(t);if(!key){alertMessage('У операции нет получателя. Добавьте обязательный платёж в расчёте.');return;}
 if(!state.confirmedKeys.includes(key))state.confirmedKeys.push(key);state.ordinaryKeys=state.ordinaryKeys.filter(k=>k!==key);refreshRecurring();renderTransactions();invalidate();try{estimate();alertMessage('Платёж отмечен как ежемесячный. Проверьте сумму и число месяца в регулярных платежах. История этого получателя исключена из повседневных расходов.');}catch(err){alertMessage(err.message);}
});
for(const id of ['history-start','history-end'])$(id).addEventListener('change',()=>{invalidate();try{refreshRecurring();renderTransactions();estimate();alertMessage('');}catch(e){alertMessage(e.message);}});
$('daily').addEventListener('input',()=>{state.dailyManual=true;try{estimate();}catch{}if(!$('forecast').hidden)calculate();});
$('auto-daily').addEventListener('click',()=>{state.dailyManual=false;try{estimate();alertMessage('');if(!$('forecast').hidden)calculate();}catch(e){alertMessage(e.message);}});
$('search').addEventListener('input',()=>{state.page=0;renderTransactions();});$('prev').addEventListener('click',()=>{state.page--;renderTransactions();});$('next').addEventListener('click',()=>{state.page++;renderTransactions();});
$('continue').addEventListener('click',()=>{alertMessage('');try{if(!$('confirmed').checked)throw Error('Подтвердите проверку периода, операций и платежей.');const start=dateISO($('history-start').value),end=dateISO($('history-end').value);if(state.operations.some(t=>t.date<start||t.date>end))throw Error('В период выписки должны входить все загруженные операции.');estimate();cents($('daily').value);for(const r of state.recurring){if(r.active&&(!Number.isSafeInteger(r.amount)||r.amount<0||!Number.isInteger(r.day)||r.day<1||r.day>31))throw Error('Проверьте сумму и число регулярного платежа.');}$('from-display').value=$('from').value;$('forecast').hidden=false;$('step2').className='step done';$('step3').className='step active';$('history-badge').textContent=state.demo?'Учебные данные':'По вашей истории';calculate();$('forecast').scrollIntoView({behavior:'smooth'});}catch(e){alertMessage(e.message);}});
$('confirmed').addEventListener('change',()=>{if(!$('confirmed').checked)invalidate();});
function renderManual(){$('manual-list').innerHTML=state.manual.map(r=>`<div class="manual-row" data-id="${r.id}"><label>Название<input data-field="label" type="text" value="${esc(r.label)}" maxlength="100" placeholder="Например, ремонт" required></label><div class="fields"><label>Дата<input data-field="date" type="date" value="${esc(r.date)}" required></label><label>Сумма, ₽<input data-field="amount" type="number" min="0" step="0.01" value="${esc(r.amount)}" required></label></div><button data-remove="${r.id}" type="button" class="text-button remove">Убрать</button></div>`).join('');}
$('add-obligation').addEventListener('click',()=>{state.manual.push({id:crypto.randomUUID(),label:'',date:$('from').value,amount:''});renderManual();calculate();$('manual-list').lastElementChild?.querySelector('input').focus();});
$('manual-list').addEventListener('input',e=>{const r=state.manual.find(r=>r.id===e.target.closest('[data-id]')?.dataset.id);if(!r)return;r[e.target.dataset.field]=e.target.value;calculate();});
$('manual-list').addEventListener('click',e=>{if(!e.target.dataset.remove)return;state.manual=state.manual.filter(r=>r.id!==e.target.dataset.remove);renderManual();calculate();});
function clearResults(message){lastForecast=null;window.dispatchEvent(new CustomEvent('skebalance:calculation',{detail:{valid:false}}));for(const id of ['safe-amount','result-balance','result-mandatory','result-daily','result-before','result-reserve','after-amount','margin'])$(id).textContent='—';$('result-context').textContent=message;$('decision').className='decision';$('decision').textContent='Расчёт недоступен: '+message;$('buffer-fill').style.width='0%';$('schedule-list').textContent='';$('schedule-count').textContent='';}
function calculate(){
 try{if(!$('confirmed').checked)throw Error('Сначала подтвердите историю.');
 const from=dateISO($('from').value),to=dateISO($('to').value),end=dateISO($('history-end').value);
 const balance=cents($('balance').value),reserve=cents($('reserve').value),purchase=cents($('purchase').value),daily=cents($('daily').value);
 const obligations=state.manual.map(r=>{if(!r.label.trim())throw Error('Укажите название дополнительного платежа.');return {...r,amount:cents(r.amount),date:dateISO(r.date)};});
 const r=forecast({balance,from,to,daily,reserve,purchase,recurring:state.recurring,obligations});lastForecast=r;window.dispatchEvent(new CustomEvent('skebalance:calculation',{detail:{valid:true}}));
 $('safe-amount').textContent=fmt(r.limit);$('result-balance').textContent=fmt(balance);$('result-mandatory').textContent='− '+fmt(r.mandatory);$('result-daily').textContent='− '+fmt(r.everyday);$('result-before').textContent=fmt(r.before);$('result-reserve').textContent=fmt(reserve);$('after-amount').textContent=fmt(r.after);$('margin').textContent=(r.margin>0?'+ ':'')+fmt(r.margin);
 const gap=dayNumber(from)-dayNumber(end)-1;$('result-context').textContent=`До ${dt(to)} · ${r.days} дн. · ${fmt(daily)} в день`+(gap>0?` · история устарела на ${gap} дн.`:'');
 $('decision').className='decision '+r.status;$('decision').textContent=r.status==='deficit'?`После покупки не хватит ${fmt(-r.after)} на ожидаемые расходы.`:r.status==='reserve'?`Покупка уменьшит резерв на ${fmt(-r.margin)}. Чтобы сохранить запас, сократите её сумму.`:purchase===0?'Это расчётный лимит с сохранением выбранного резерва. Введите сумму покупки, чтобы проверить её.':'По расчёту после покупки денег хватит на ожидаемые расходы и выбранный резерв.';
 const width=reserve>0?Math.max(0,Math.min(100,r.after/reserve*50)):r.after>=0?100:0;$('buffer-fill').style.width=width+'%';$('buffer-fill').style.background=r.status==='deficit'?'#b65b4c':r.status==='reserve'?'#c59d59':'#91b770';
 const outside=obligations.filter(o=>o.date<from||o.date>=to);
 $('schedule-count').textContent=`(${r.schedule.length})`;$('schedule-list').innerHTML=r.schedule.map(o=>`<div class="schedule-entry"><time>${dt(o.date)}</time><span>${esc(o.label)}</span><strong>${esc(fmt(o.amount))}</strong></div>`).join('')||'<p class="muted">На этом горизонте обязательных платежей не указано.</p>';
 if(outside.length)$('schedule-list').innerHTML+='<p class="notice">За пределами периода не учтены: '+outside.map(o=>esc(o.label)+' ('+dt(o.date)+')').join(', ')+'.</p>';
 }catch(e){clearResults(e.message);}
}
for(const id of ['balance','reserve','purchase','to'])$(id).addEventListener('input',calculate);
$('from').addEventListener('change',()=>{invalidate();try{refreshRecurring();renderTransactions();estimate();alertMessage('');}catch(e){alertMessage(e.message);}});
document.querySelectorAll('[data-purchase]').forEach(b=>b.addEventListener('click',()=>{$('purchase').value=b.dataset.purchase;calculate();}));
$('reset').addEventListener('click',()=>{loadToken++;state={operations:[],recurring:[],manual:[],page:0,filename:'',demo:false,dailyManual:false,loaded:false,ordinaryKeys:[],confirmedKeys:[]};lastForecast=null;$('review').hidden=true;$('forecast').hidden=true;$('reset').hidden=true;$('confirmed').checked=false;$('balance').value='';$('reserve').value='';$('file').value='';$('transactions-body').textContent='';$('schedule-list').textContent='';$('recurring-list').textContent='';$('manual-list').textContent='';$('step1').className='step active';$('step2').className='step';$('step3').className='step';alertMessage('');window.scrollTo({top:0,behavior:'smooth'});});

function captureCalculation(){
 if(!lastForecast)throw Error('Сначала заполните данные и получите расчёт.');
 return cleanSnapshot({version:1,from:$('from').value,to:$('to').value,balance:cents($('balance').value),daily:cents($('daily').value),reserve:cents($('reserve').value),purchase:cents($('purchase').value),recurring:state.recurring,obligations:state.manual.map(r=>({...r,amount:cents(r.amount)}))});
}
function restoreCalculation(value){
 const snapshot=cleanSnapshot(value);loadToken++;
 state={operations:[],recurring:snapshot.recurring.map((r,i)=>({...r,id:'reg-'+i,operationIds:[],count:0,lastDate:snapshot.from})),ordinaryKeys:[],confirmedKeys:[],manual:snapshot.obligations.map(r=>({...r,id:crypto.randomUUID(),amount:(r.amount/100).toFixed(2)})),page:0,filename:'',demo:false,dailyManual:true,loaded:true,saved:true};
 for(const id of ['from','from-display'])$(id).value=snapshot.from;$('to').value=snapshot.to;$('history-start').value=snapshot.from;$('history-end').value=addDays(snapshot.from,-1);
 for(const id of ['balance','daily','reserve','purchase'])$(id).value=(snapshot[id]/100).toFixed(2);
 $('review').hidden=true;$('forecast').hidden=false;$('reset').hidden=false;$('confirmed').checked=true;$('from-display').readOnly=false;
 $('history-badge').textContent='Сохранённый расчёт';$('forecast-intro').textContent='Параметры восстановлены из аккаунта. Исходная выписка не сохранялась. Можно изменить дату, суммы и покупку.';
 $('step1').className='step';$('step2').className='step';$('step3').className='step active';renderManual();alertMessage('');calculate();$('forecast').scrollIntoView({behavior:'smooth'});
}
$('from-display').addEventListener('change',()=>{if(state.saved){$('from').value=$('from-display').value;$('history-end').value=addDays($('from').value,-1);calculate();}});
window.addEventListener('skebalance:signedout',()=>{if(state.loaded)$('reset').click();});
initAccount({capture:captureCalculation,restore:restoreCalculation}).catch(()=>{ $('account-connection').textContent='Вход временно недоступен. Расчёт можно использовать без аккаунта.'; });
