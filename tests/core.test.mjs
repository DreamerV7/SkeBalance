import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dateISO,cents,parseCSV,splitCSV,parseSberLines,detectRecurring,dailyEstimate,occurrences,forecast,toCSV,classifyExpense,classifyIncome,merchant,recognizeMerchant} from '../dist/core.mjs';
const base={balance:3500000,from:'2026-11-12',to:'2026-11-30',daily:55000,reserve:500000,purchase:1200000,obligations:[{label:'Аренда',date:'2026-11-15',amount:1200000}]};
test('dates are strict and leap years are respected',()=>{assert.equal(dateISO('29.02.2024'),'2024-02-29');assert.throws(()=>dateISO('29.02.2026'));assert.throws(()=>dateISO('2026-13-01'));});
test('money parsing preserves cents and rejects ambiguity',()=>{assert.equal(cents('−1 234,56 ₽'),-123456);assert.equal(cents('0'),0);assert.throws(()=>cents(''));assert.throws(()=>cents('1.234'));assert.throws(()=>cents('1e5'));});
test('CSV parses quotes, BOM, decimals and preamble',()=>{const p=parseCSV('\uFEFFВыписка\r\nДата операции;Сумма;Категория;Описание\r\n01.10.2026;-1234,56;Еда;"Магазин; у дома"\r\n02.10.2026;+50000;Доход;Зарплата');assert.equal(p.operations.length,2);assert.equal(p.operations[0].amount,-123456);assert.equal(p.operations[0].description,'Магазин; у дома');});
test('CSV supports commas, tabs, explicit operation type and debit/credit',()=>{assert.equal(parseCSV('date,amount,type\n2026-01-01,500,debit').operations[0].amount,-50000);assert.equal(parseCSV('Дата\tПриход\tРасход\n01.01.2026\t\t300').operations[0].amount,-30000);});
test('CSV fails rather than silently dropping bad rows',()=>{assert.throws(()=>parseCSV('Дата;Сумма\n01.10.2026;-100\nнет;-200'),/Строка 3/);assert.throws(()=>parseCSV('Дата;Сумма;Валюта\n01.10.2026;-100;USD'),/рубл/);assert.throws(()=>splitCSV('"abc;123',';'));});
test('CSV roundtrip and spreadsheet formula injection safety',()=>{const ops=[{date:'2026-10-01',amount:-12345,category:'Еда',description:'=HYPERLINK("x")',balance:null}];const csv=toCSV(ops);assert.match(csv,/'=HYPERLINK/);assert.equal(parseCSV(csv).operations[0].amount,-12345);});
function pdfLines(){return ['Сбербанк','Выписка по счёту дебетовой карты','Валюта RUB','За период 01.10.2026 — 31.10.2026','Пополнение 50 000,00','Списание 550,00','02.10.2026 12:00 Продукты 550,00 49 450,00','02.10.2026 123456 Магазин у дома','01.10.2026 09:00 Доход +50 000,00 50 000,00','01.10.2026 654321 Зарплата','Дата формирования 01.11.2026'];}
test('Sber text layout parsing reconciles debit and credit totals',()=>{const p=parseSberLines(pdfLines());assert.equal(p.operations.length,2);assert.equal(p.operations[0].amount,5000000);assert.equal(p.operations[1].amount,-55000);assert.equal(p.periodEnd,'2026-10-31');});
test('Sber parser rejects mismatched totals and ambiguous columns',()=>{assert.throws(()=>parseSberLines(pdfLines().map(x=>x.replace('Списание 550,00','Списание 650,00'))),/не совпала/);assert.throws(()=>parseSberLines(pdfLines().map(x=>x.replace('550,00 49 450,00','550,00'))),/Неоднозначная/);assert.throws(()=>parseSberLines(['Сбербанк','скан']));});
function rent(){return ['2026-08-05','2026-09-05','2026-10-05'].map((date,i)=>({id:String(i),date,amount:-800000,description:'Аренда квартиры',category:'Жильё',ignored:false}));}
test('monthly detection needs three repeats and bounded amounts',()=>{assert.equal(detectRecurring(rent()).length,1);assert.equal(detectRecurring(rent().slice(0,2)).length,0);assert.equal(detectRecurring(rent().map((t,i)=>({...t,amount:i===1?-200000:-800000}))).length,0);});
test('transfers are not auto-confirmed monthly obligations',()=>{assert.equal(detectRecurring(rent().map(t=>({...t,category:'Перевод СБП'}))).length,0);});
test('daily mean uses calendar days and avoids double counting regular payments',()=>{const ops=[...rent(),{id:'food',date:'2026-10-12',amount:-310000,description:'Еда',ignored:false}];const estimate=dailyEstimate(ops,detectRecurring(ops),'2026-10-01','2026-10-31');assert.equal(estimate.days,31);assert.equal(estimate.daily,10000);});
test('ignored transfers do not change everyday spending',()=>{const a=dailyEstimate([{id:'t',date:'2026-10-01',amount:-100000,ignored:true}],[],'2026-10-01','2026-10-31');assert.equal(a.total,0);});
test('monthly schedule handles month end and income-day exclusion',()=>{assert.deepEqual(occurrences('2026-01-30','2026-03-01',31),['2026-01-31','2026-02-28']);assert.deepEqual(occurrences('2026-11-12','2026-11-20',20),[]);});
test('forecast matches independent reference arithmetic',()=>{const r=forecast(base);assert.equal(r.days,18);assert.equal(r.before,1310000);assert.equal(r.after,110000);assert.equal(r.limit,810000);assert.equal(r.margin,-390000);assert.equal(r.status,'reserve');});
test('changing purchase changes after, not original spending estimate',()=>{const a=forecast({...base,purchase:700000}),b=forecast({...base,purchase:2000000});assert.equal(a.after,610000);assert.equal(a.status,'ok');assert.equal(b.after,-690000);assert.equal(b.status,'deficit');assert.equal(a.everyday,b.everyday);});
test('reserve boundary, zero inputs and negative balance',()=>{assert.equal(forecast({...base,purchase:810000}).status,'ok');assert.equal(forecast({...base,daily:0,reserve:0,purchase:0,obligations:[]}).after,3500000);assert.equal(forecast({...base,balance:-100}).limit,0);});
test('invalid/missing amounts and reversed dates block forecast',()=>{assert.throws(()=>forecast({...base,daily:-1}));assert.throws(()=>forecast({...base,reserve:NaN}));assert.throws(()=>forecast({...base,to:base.from}));assert.throws(()=>forecast({...base,to:'2028-01-01'}));});
test('recurring and manual schedules use dates within horizon',()=>{const r=forecast({...base,recurring:[{label:'Подписка',amount:50000,day:20,active:true}],obligations:[{label:'В день дохода',date:'2026-11-30',amount:500000},{label:'До расчёта',date:'2026-11-10',amount:99999}]});assert.equal(r.mandatory,50000);assert.equal(r.schedule.length,1);});
test('inactive monthly obligations are excluded from forecast',()=>{assert.equal(forecast({...base,obligations:[],recurring:[{label:'Закрыта',amount:50000,day:20,active:false}]}).mandatory,0);});
test('QR payments identify merchants without treating SBP as a personal transfer',()=>{
 for(const [description,category] of [['PLAYEROK. Операция по карте ****0000','Интернет-покупки'],['Goodline. Операция по карте ****0000','Связь и интернет'],['Бегемаг-22. Операция по карте ****0000','Продукты']]){
  const c=classifyExpense({description,category:'Оплата по QR–коду СБП',amount:-10000});assert.equal(c.category,category);assert.equal(c.reviewTransfer,false);
 }
 assert.equal(classifyExpense({description:'ООО МПЦ РИУ',category:'Оплата по QR–коду СБП'}).reviewTransfer,false);
 assert.equal(classifyExpense({description:'SBOL. Операция по карте ****0000',category:'Перевод на карту'}).reviewTransfer,true);
});
test('known merchant aliases group across card suffixes but do not match substrings',()=>{
 assert.equal(merchant({description:'Goodline. Операция по карте ****0000'}),merchant({description:'ГУДЛАЙН. Операция по карте ****9999'}));
 assert.equal(recognizeMerchant('NOTPLAYEROK'),null);assert.equal(recognizeMerchant('PLAYEROK.COM').key,'playerok');
 assert.notEqual(merchant({id:'a',description:'SBOL. Операция по карте ****0000'}),merchant({id:'b',description:'SBOL. Операция по карте ****0000'}));
});
test('organization QR payments can recur, one-off purchases need manual confirmation',()=>{
 const ops=rent().map(t=>({...t,description:'ООО МПЦ РИУ',category:'Оплата по QR–коду СБП'}));assert.equal(detectRecurring(ops).length,1);
 const single=ops.slice(0,1);assert.equal(detectRecurring(single).length,0);const r=detectRecurring(single,[merchant(single[0])]);assert.equal(r.length,1);assert.equal(r[0].confirmed,true);
 assert.equal(dailyEstimate(single,r,'2026-08-01','2026-08-31').total,0);
 const transfers=rent().map(t=>({...t,description:'SBOL. Операция по карте ****0000',category:'Перевод на карту'}));assert.equal(detectRecurring(transfers).length,0);
});
test('scholarships are income and incoming transfers are receipts, neither are spending',()=>{
 const scholarship={id:'income',date:'2026-10-02',amount:2000000,description:'Стипендия учащимся',category:'Прочие операции'};
 assert.equal(classifyIncome(scholarship),'Доход · стипендия');assert.equal(classifyIncome({description:'SBOL',category:'Перевод на карту'}),'Поступление · перевод');assert.equal(dailyEstimate([scholarship],[],'2026-10-01','2026-10-31').total,0);
});
test('category breakdown reconciles spending and respects edits, regular and ignored rows',()=>{
 const ops=[{id:'shop',date:'2026-10-01',amount:-30000,description:'PLAYEROK',category:'Оплата по QR–коду СБП'}, {id:'transfer',date:'2026-10-02',amount:-60000,description:'SBOL',category:'Перевод на карту'}, {id:'ignored',date:'2026-10-02',amount:-99999,ignored:true}, {id:'regular',date:'2026-10-03',amount:-99999}];
 const r=dailyEstimate(ops,[{operationIds:['regular']}],'2026-10-01','2026-10-30');assert.equal(r.total,90000);assert.equal(r.categories.reduce((s,c)=>s+c.total,0),r.total);assert.equal(r.categories.find(c=>c.category==='Интернет-покупки').daily,1000);
 assert.equal(classifyExpense({...ops[1],categoryOverride:'Образование'}).category,'Образование');assert.equal(classifyExpense({...ops[1],categoryOverride:'<invalid>'}).category,'Переводы на карту');
});
