import {recognizeMerchant} from './merchants.mjs';
export {recognizeMerchant} from './merchants.mjs';
export const DAY=86400000;
export function dateISO(value){
 const s=String(value??'').trim();let y,m,d;
 let a=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/);
 if(a)[,y,m,d]=a;else{a=s.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/);if(!a)throw Error('Не удалось прочитать дату: '+s.slice(0,35));[,d,m,y]=a;}
 const n=Date.UTC(+y,+m-1,+d),dt=new Date(n);
 if(dt.getUTCFullYear()!==+y||dt.getUTCMonth()!==+m-1||dt.getUTCDate()!==+d||+y<2000||+y>2100)throw Error('Некорректная дата: '+s.slice(0,35));
 return new Date(n).toISOString().slice(0,10);
}
export function dayNumber(s){return Date.parse(dateISO(s))/DAY;}
export function addDays(s,n){return new Date((dayNumber(s)+n)*DAY).toISOString().slice(0,10);}
export function cents(value){
 const s=String(value??'').trim().replace(/[\s\u00a0\u202f]/g,'').replace(/(?:₽|руб\.?|RUB)$/i,'').replace(/[−–]/g,'-').replace(',','.');
 if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s))throw Error('Нужна сумма в рублях с точностью до копейки.');
 const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||Math.abs(n)>1e13)throw Error('Слишком большая сумма.');return n;
}
export const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n?n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2:0;};
const head=s=>s.toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
export function splitCSV(text,delimiter){
 const rows=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted){quoted=false;closed=true;}else if(field.trim()===''&&!closed){quoted=true;}else throw Error('Неверные кавычки в CSV.');}
 else if(!quoted&&c===delimiter){row.push(field);field='';closed=false;}
 else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';closed=false;}
 else{if(closed&&!/\s/.test(c))throw Error('Текст после закрывающей кавычки CSV.');field+=c;}}
 if(quoted)throw Error('Незакрытая кавычка CSV.');row.push(field);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
const aliases={date:['дата','датаоперации','датаивремяоперации','date'],amount:['сумма','суммаоперации','суммаввалютесчета','amount'],debit:['списание','расход','суммасп исания','суммасписания','debit'],credit:['пополнение','приход','зачисление','credit'],category:['категория','категорияоперации','category'],description:['описание','описаниеоперации','назначениеплатежа','description'],balance:['остаток','остатоксредств','остатокпослеоперации','balance'],type:['тип','типоперации','type'],currency:['валюта','валютасчета','currency']};
for(const k in aliases)aliases[k]=aliases[k].map(head);
function findColumns(row){const h=row.map(head),cols={};for(const k in aliases)cols[k]=h.findIndex(x=>aliases[k].includes(x));return cols;}
export function parseCSV(text){
 let chosen;
 for(const sep of [';','\t',',']){let rows;try{rows=splitCSV(text.replace(/^\uFEFF/,''),sep);}catch{continue;}
 for(let i=0;i<Math.min(rows.length,35);i++){const c=findColumns(rows[i]);if(c.date>=0&&(c.amount>=0||(c.debit>=0&&c.credit>=0))){chosen={rows,cols:c,start:i};break;}}if(chosen)break;}
 if(!chosen)throw Error('Не найдены столбцы «Дата операции» и «Сумма». Используйте CSV-шаблон на странице.');
 const {rows,cols:c,start}=chosen;const operations=[];let skipped=0;
 for(let i=start+1;i<rows.length;i++){
  const r=rows[i];if(r.every(s=>!s.trim()))continue;
  const get=k=>(r[c[k]]??'').trim();
  try{
   if(c.currency>=0&&get('currency')&&!/^(RUB|RUR|₽|РУБ\.?)$/i.test(get('currency')))throw Error('Поддерживается только рублёвый счёт.');
   let amount;
   if(c.amount>=0){amount=cents(get('amount'));const t=get('type').toLowerCase();if(/расход|списание|debit/.test(t))amount=-Math.abs(amount);else if(/доход|приход|зачисление|пополнение|credit/.test(t))amount=Math.abs(amount);}
   else{const d=get('debit')?cents(get('debit')):0,cr=get('credit')?cents(get('credit')):0;if(d<0||cr<0||(d&&cr)||(!get('debit')&&!get('credit')))throw Error('Неоднозначные колонки прихода и расхода.');amount=cr-d;}
   operations.push({id:'op-'+operations.length,date:dateISO(get('date')),amount,category:get('category')||'Без категории',description:get('description')||get('category')||'Без описания',balance:c.balance>=0&&get('balance')?cents(get('balance')):null,ignored:false});
  }catch(e){throw Error('Строка '+(i+1)+': '+e.message+' Импорт остановлен, строки не пропущены.');}
 }
 if(!operations.length)throw Error('В файле нет операций.');if(operations.length>20000)throw Error('Не более 20 000 операций за один импорт.');
 return {operations:operations.sort((a,b)=>a.date.localeCompare(b.date)),periodStart:null,periodEnd:null,warnings:['Для CSV проверьте границы периода по самой выписке: они не всегда совпадают с датами первой и последней операций.'],skipped};
}
// Extract one specific debit-card/payment-account text layout; reject partial parses.
export function parseSberLines(lines){
 const text=lines.join('\n'),flat=text.replace(/\s+/g,' ');
 if(!/сбер/i.test(text)||!/выписка по (?:сч[её]ту дебетовой карты|плат[её]жному сч[её]ту)/i.test(flat))throw Error('Этот шаблон PDF пока не поддержан. Нужна текстовая выписка по дебетовой карте или платёжному счёту Сбера.');
 const currency=flat.match(/Валюта(?:\s+сч[её]та)?\s*[:—-]?\s*([A-ZА-Я₽]+)/i)?.[1];if(currency&&!/^(RUB|RUR|РУБ|РОССИЙСК|₽)/i.test(currency))throw Error('Поддерживается рублёвая выписка.');
 const period=flat.match(/За период\s+(\d{2}\.\d{2}\.\d{4})\s*[—–-]\s*(\d{2}\.\d{2}\.\d{4})/i);
 const operations=[];let current=null,headerCount=0;
 const skip=/Выписка по|ДАТА ОПЕРАЦИИ|КАТЕГОРИЯ|СУММА В ВАЛЮТЕ|ОСТАТОК СРЕДСТВ|В валюте сч[её]та|Продолжение на следующей|Дата обработки|и код авторизации|Описание операции|Страница\s+\d|www\.sber|Для проверки|Дата формирования/i;
 const money=/[+-]?\s*\d(?:[\d \u00a0\u202f]*\d)?,\d{2}/g;
 for(const raw of lines){const line=raw.trim();if(/Дата формирования/i.test(line))break;if(!line||skip.test(line))continue;
  const h=line.match(/^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})(?:\s|$)/);
  if(h){headerCount++;const tail=line.slice(h[0].length);const amounts=[...tail.matchAll(money)];if(amounts.length!==2)throw Error('Неоднозначная строка операции в PDF. Прогноз не построен: сначала нужно адаптировать импорт под этот файл.');
   if(current)operations.push(current);const a=amounts[0][0].trim();current={id:'op-'+operations.length,date:dateISO(h[1]),amount:(a.startsWith('+')?1:-1)*Math.abs(cents(a)),category:tail.slice(0,amounts[0].index).trim()||'Без категории',description:'',balance:cents(amounts[1][0]),ignored:false};
  }else if(current){const proc=line.match(/^\d{2}\.\d{2}\.\d{4}\s+\d{5,6}\s*(.*)$/);if(proc)current.description=proc[1];else if(/^\d{2}\.\d{2}\.\d{4}/.test(line))throw Error('Не распознана строка с датой в таблице PDF. Импорт остановлен.');else current.description=(current.description+' '+line).trim();}
 }
 if(current)operations.push(current);if(!operations.length||operations.length!==headerCount)throw Error('Не удалось прочитать операции. Сканированные PDF не поддерживаются.');
 operations.forEach(t=>{t.description=t.description||t.category;});
 const warnings=['Импорт PDF экспериментальный. Сверьте операции и итоги с выпиской перед расчётом.'];
 const debitMatch=flat.match(/Списание\s+([\d \u00a0\u202f]+,\d{2})/i),creditMatch=flat.match(/Пополнение\s+([\d \u00a0\u202f]+,\d{2})/i);
 const debit=operations.filter(t=>t.amount<0).reduce((s,t)=>s-t.amount,0),credit=operations.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
 if(debitMatch&&cents(debitMatch[1])!==debit)throw Error('Сумма списаний не совпала с итогом выписки. Прогноз заблокирован: нужен другой шаблон импорта.');
 if(creditMatch&&cents(creditMatch[1])!==credit)throw Error('Сумма поступлений не совпала с итогом выписки. Прогноз заблокирован: нужен другой шаблон импорта.');
 if(!debitMatch||!creditMatch)warnings.push('Итоги списаний или пополнений не найдены: автоматическая сверка неполная.');
 return {operations:operations.sort((a,b)=>a.date.localeCompare(b.date)),periodStart:period?dateISO(period[1]):null,periodEnd:period?dateISO(period[2]):null,warnings};
}
export const expenseCategories=['Продукты','Кафе и рестораны','Транспорт','Жильё и ЖКХ','Связь и интернет','Здоровье','Образование','Подписки','Одежда и аксессуары','Интернет-покупки','Покупки','Оплата по QR / СБП','Переводы на карту','Прочие расходы'];
export function classifyIncome(t){
 const text=(String(t.category||'')+' '+String(t.description||'')).toLowerCase().replace(/ё/g,'е');
 if(/стипенди/.test(text))return 'Доход · стипендия';
 if(/зарплат|заработн/.test(text))return 'Доход · зарплата';
 if(/возврат|refund/.test(text))return 'Поступление · возврат';
 if(/перевод|transfer|sbol|сбп/.test(text))return 'Поступление · перевод';
 return 'Поступление';
}
export function classifyExpense(t){
 const text=(String(t.category||'')+' '+String(t.description||'')).toLowerCase().replace(/ё/g,'е');
 const known=recognizeMerchant(t.description),playerok=known?.key==='playerok';
 const qr=/(?:\bqr\b|куар|qr[- ]?код|сбп)/i.test(text);
 const payment=Boolean(known)||/оплата|покупка|платеж|purchase|payment/i.test(text)||/(?:^|\s)(?:ооо|ао|ип)(?:\s|$)/u.test(text);
 const transfer=/перевод|transfer/i.test(text)||(qr&&!payment);
 let category;
 if(known)category=known.category;
 else if(transfer&&!payment)category='Переводы на карту';
 else if(/продукт|супермаркет|бакале|пятероч|перекрест|магнит|вкусвилл/.test(text))category='Продукты';
 else if(/ресторан|кафе|кофейн|coffee|фастфуд|столов/.test(text))category='Кафе и рестораны';
 else if(/транспорт|такси|метро|автобус|бензин|азс/.test(text))category='Транспорт';
 else if(/жиль|жкх|коммунал|аренда|квартплат/.test(text))category='Жильё и ЖКХ';
 else if(/связь|интернет|телефон|мобильн/.test(text))category='Связь и интернет';
 else if(/здоров|аптек|медицин|клиник/.test(text))category='Здоровье';
 else if(/образован|обучени|университет|институт|школ/.test(text))category='Образование';
 else if(/подписк/.test(text))category='Подписки';
 else if(/одежд|аксессуар|обувь|обувн/.test(text))category='Одежда и аксессуары';
 else if(/интернет.?магазин|интернет.?покуп|маркетплейс/.test(text))category='Интернет-покупки';
 else if(qr&&payment)category='Оплата по QR / СБП';
 else if(transfer)category='Переводы на карту';
 else if(/покуп|магазин|оплата|платеж/.test(text))category='Покупки';
 else category=t.category&&t.category!=='Без категории'?t.category:'Прочие расходы';
 if(expenseCategories.includes(t.categoryOverride))category=t.categoryOverride;
 return {category,reviewTransfer:category==='Переводы на карту',payment:playerok||payment||Boolean(t.categoryOverride&&category!=='Переводы на карту'),merchant:known?.label||null,source:t.categoryOverride?'Ваша категория':known?'Словарь получателей':'Описание и категория банка'};
}
export function merchant(t){
 const known=recognizeMerchant(t.description);if(known)return 'known:'+known.key;
 const normalized=String(t.description||t.category||'').toLowerCase().replace(/ё/g,'е').replace(/операция по карте\s*[*\d]+/g,'').replace(/(?:карта|счет|card)\s*[*\d]+/g,'').replace(/\b\d{2}:\d{2}\b/g,'').replace(/(?:оплата|платеж|перевод)\s+(?:по\s+)?(?:qr|сбп)(?:[ -]код[ау]?)?/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 // SBOL identifies a bank channel, not the actual recipient.
 if(/^(?:sbol|сбол|перевод|перевод на карту|без описания)$/.test(normalized))return 'unknown:'+t.id;
 return normalized;
}
export const spendingRoles={daily:'Повседневные',scheduled:'Платёж отдельно',occasional:'Разовые покупки',transfer:'Переводы'};
const scheduledCategories=new Set(['Жильё и ЖКХ','Связь и интернет','Подписки']);
export function recognizeSpending(operations,start,end){
 const days=dayNumber(end)-dayNumber(start)+1,groups=new Map(),categoryGroups=new Map(),result=new Map();
 for(const t of operations){if(t.amount>=0||t.ignored||t.date<start||t.date>end)continue;const c=classifyExpense(t),key=c.reviewTransfer?'transfer:'+t.id:merchant(t);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);if(!categoryGroups.has(c.category))categoryGroups.set(c.category,[]);categoryGroups.get(c.category).push(t);}
 function pattern(items){const dates=[...new Set(items.map(t=>t.date))].sort(),gaps=dates.slice(1).map((d,i)=>dayNumber(d)-dayNumber(dates[i])),activeWeeks=new Set(dates.map(d=>Math.floor((dayNumber(d)-dayNumber(start))/7))).size,observedWeeks=Math.max(1,Math.ceil(days/7));return {dates,activeWeeks,observedWeeks,frequent:dates.length>=3&&dayNumber(dates.at(-1))-dayNumber(dates[0])>=7&&activeWeeks>=2&&activeWeeks/observedWeeks>=0.5&&median(gaps)<=10};}
 const categoryPatterns=new Map([...categoryGroups].map(([category,items])=>[category,pattern(items)]));
 for(const items of groups.values()){
  const dates=[...new Set(items.map(t=>t.date))].sort(),gaps=dates.slice(1).map((d,i)=>dayNumber(d)-dayNumber(dates[i]));
  const activeWeeks=new Set(dates.map(d=>Math.floor((dayNumber(d)-dayNumber(start))/7))).size;
  const observedWeeks=Math.max(1,Math.ceil(days/7));
  const frequent=dates.length>=3&&dates.at(-1)!==dates[0]&&dayNumber(dates.at(-1))-dayNumber(dates[0])>=7&&activeWeeks>=2&&activeWeeks/observedWeeks>=0.5&&median(gaps)<=10;
  for(const t of items){const c=classifyExpense(t);let role,reason,confidence='средняя';
   const categoryPattern=categoryPatterns.get(c.category),categoryFrequent=['Продукты','Кафе и рестораны','Транспорт','Одежда и аксессуары','Интернет-покупки','Покупки'].includes(c.category)&&categoryPattern.frequent;
   if(spendingRoles[t.spendingRole]){role=t.spendingRole;reason='Тип расхода выбран вами';confidence='ваш выбор';}
   else if(c.reviewTransfer){role='transfer';reason='Перевод: частота не доказывает покупку или обязательство';}
   else if(scheduledCategories.has(c.category)){role='scheduled';reason='Похож на отдельный счёт или обязательный платёж; проверьте будущую дату';}
   else if(frequent||categoryFrequent){role='daily';const p=categoryFrequent?categoryPattern:{activeWeeks,observedWeeks,dates};reason=`${categoryFrequent?'Категория':'Получатель'}: траты в ${p.activeWeeks} из ${p.observedWeeks} недель, ${p.dates.length} дней с тратами`;}
   else if(['Продукты','Транспорт'].includes(c.category)){role='daily';reason='Текущие потребности: среднее учитывает и дни без покупок';}
   else if(c.category==='Кафе и рестораны'&&days<28){role='daily';reason='Короткая история: питание предварительно оставлено в повседневных';confidence='низкая';}
   else if(['Кафе и рестораны','Одежда и аксессуары','Интернет-покупки','Покупки','Здоровье','Образование'].includes(c.category)){role='occasional';reason='Нет устойчивой частоты по неделям; проверьте, ожидаются ли новые траты';confidence=days<28?'низкая':'средняя';}
   else{role='daily';reason='Назначение неясно: предварительно включено в бюджет, проверьте тип';confidence='низкая';}
   result.set(t.id,{role,reason,confidence,count:items.length,activeDays:dates.length,weekly:Math.round(items.length/days*70)/10,average:Math.round(items.reduce((s,t)=>s-t.amount,0)/items.length)});
  }
 }
 return result;
}
export function detectRecurring(operations,confirmedKeys=[]){
 const groups=new Map();for(const t of operations){if(t.amount>=0||t.ignored)continue;const key=merchant(t),confirmed=confirmedKeys.includes(key),classification=classifyExpense(t);if(!key||/без описания/i.test(key)||(!confirmed&&(classification.reviewTransfer||['daily','occasional','transfer'].includes(t.spendingRole)||['Продукты','Кафе и рестораны','Транспорт','Одежда и аксессуары','Интернет-покупки','Покупки'].includes(classification.category))))continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 const result=[];
 for(const [key,items] of groups){const a=[...items].sort((x,y)=>x.date.localeCompare(y.date)),confirmed=confirmedKeys.includes(key);if(!confirmed&&a.length<3)continue;const gaps=a.slice(1).map((t,i)=>dayNumber(t.date)-dayNumber(a[i].date));if(!confirmed&&(!gaps.every(n=>(n>=25&&n<=35)||(n>=55&&n<=65))||gaps.filter(n=>n>40).length>1))continue;
 const amounts=a.map(t=>Math.abs(t.amount)),m=median(amounts);if(!confirmed&&Math.max(...amounts.map(n=>Math.abs(n-m)/m))>0.2)continue;
 result.push({id:'reg-'+result.length,key,label:a.at(-1).description,amount:Math.round(m),day:+a.at(-1).date.slice(8),lastDate:a.at(-1).date,operationIds:a.map(t=>t.id),count:a.length,confirmed,active:true});}
 return result;
}
export function occurrences(from,to,day){
 if(!Number.isInteger(day)||day<1||day>31)throw Error('День платежа от 1 до 31.');let y=+from.slice(0,4),m=+from.slice(5,7)-1;const end=dayNumber(to),result=[];
 for(let i=0;i<25;i++){const last=new Date(Date.UTC(y,m+1,0)).getUTCDate(),d=new Date(Date.UTC(y,m,Math.min(day,last))).toISOString().slice(0,10);if(dayNumber(d)>=end)break;if(d>=from)result.push(d);m++;if(m===12){m=0;y++;}}
 return result;
}
export function dailyEstimate(operations,recurring,start,end){
 const days=dayNumber(end)-dayNumber(start)+1;if(days<1)throw Error('Конец истории должен быть не раньше начала.');
 const excluded=new Set(recurring.flatMap(r=>r.operationIds)),recognition=recognizeSpending(operations,start,end);
 const relevant=operations.filter(t=>t.date>=start&&t.date<=end&&t.amount<0&&!t.ignored);
 const included=relevant.filter(t=>!excluded.has(t.id)&&recognition.get(t.id)?.role==='daily'),groups=new Map();
 for(const t of included){const category=classifyExpense(t).category,r=groups.get(category)||{category,total:0,count:0};r.total-=t.amount;r.count++;groups.set(category,r);}
 const total=included.reduce((s,t)=>s-t.amount,0);
 const separated=new Map();for(const t of relevant){if(excluded.has(t.id))continue;const a=recognition.get(t.id);if(a.role==='daily')continue;const category=classifyExpense(t).category,key=a.role+':'+(a.role==='scheduled'?merchant(t):category),r=separated.get(key)||{key,merchantKey:merchant(t),role:a.role,label:a.role==='scheduled'?t.description:category,category,total:0,count:0,operationIds:[]};r.total-=t.amount;r.count++;r.operationIds.push(t.id);separated.set(key,r);}
 const other=[...separated.values()],regularTotal=relevant.filter(t=>excluded.has(t.id)).reduce((s,t)=>s-t.amount,0);
 return {days,total,daily:Math.round(total/days),recognition,separated:other,regularTotal,otherTotal:other.reduce((s,r)=>s+r.total,0),categories:[...groups.values()].sort((a,b)=>b.total-a.total).map(r=>({...r,daily:Math.round(r.total/days),weekly:Math.round(r.count/days*70)/10,average:Math.round(r.total/r.count)}))};
}
export function forecast({balance,from,to,daily,reserve,purchase,recurring=[],obligations=[]}){
 dateISO(from);dateISO(to);const days=dayNumber(to)-dayNumber(from);if(days<1||days>366)throw Error('Дата дохода должна быть позже даты расчёта, в пределах года.');
 if(![balance,daily,reserve,purchase].every(Number.isSafeInteger)||[daily,reserve,purchase].some(n=>n<0))throw Error('Проверьте суммы: расходы, резерв и покупка не могут быть отрицательными.');
 const schedule=[];
 for(const r of recurring){if(!r.active)continue;if(!Number.isSafeInteger(r.amount)||r.amount<0)throw Error('Проверьте сумму регулярного платежа.');for(const date of occurrences(from,to,r.day))schedule.push({label:r.label,date,amount:r.amount,source:'regular'});}
 for(const r of obligations){if(!Number.isSafeInteger(r.amount)||r.amount<0)throw Error('Проверьте сумму обязательного платежа.');dateISO(r.date);if(r.date>=from&&r.date<to)schedule.push({...r,source:'manual'});}
 const mandatory=schedule.reduce((s,r)=>s+r.amount,0),everyday=daily*days,before=balance-mandatory-everyday,after=before-purchase,limit=Math.max(0,before-reserve),margin=after-reserve;
 if(![mandatory,everyday,before,after,limit,margin].every(Number.isSafeInteger))throw Error('Суммы слишком велики.');
 return {days,mandatory,everyday,before,after,limit,margin,schedule:schedule.sort((a,b)=>a.date.localeCompare(b.date)),status:after<0?'deficit':after<reserve?'reserve':'ok'};
}
export function toCSV(operations){
 const safe=x=>{let s=String(x??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return '\uFEFFдата;сумма;категория;описание;остаток\r\n'+operations.map(t=>[t.date,(t.amount/100).toFixed(2),t.category,t.description,t.balance===null?'':(t.balance/100).toFixed(2)].map((x,i)=>i===1||i===4?'"'+x+'"':safe(x)).join(';')).join('\r\n');
}
