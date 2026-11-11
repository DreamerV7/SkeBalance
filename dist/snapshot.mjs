import {dateISO,forecast} from './core.mjs';
const integer=(n,label,negative=false)=>{if(!Number.isSafeInteger(n)||(!negative&&n<0)||Math.abs(n)>1e13)throw Error('Проверьте '+label+'.');return n;};
const label=s=>{if(typeof s!=='string'||!s.trim()||s.length>100)throw Error('Название платежа должно содержать от 1 до 100 символов.');return s.trim();};
export function cleanSnapshot(x){
 if(!x||x.version!==1)throw Error('Версия сохранённого расчёта не поддерживается.');
 const from=dateISO(x.from),to=dateISO(x.to);
 if(!Array.isArray(x.recurring)||!Array.isArray(x.obligations)||x.recurring.length>100||x.obligations.length>100)throw Error('Не более 100 платежей каждого типа.');
 const recurring=x.recurring.map(r=>{if(!Number.isInteger(r.day)||r.day<1||r.day>31||typeof r.active!=='boolean')throw Error('Проверьте дату регулярного платежа.');return {label:label(r.label),amount:integer(r.amount,'сумму платежа'),day:r.day,active:r.active};});
 const obligations=x.obligations.map(r=>({label:label(r.label),amount:integer(r.amount,'сумму платежа'),date:dateISO(r.date)}));
 const result={version:1,from,to,balance:integer(x.balance,'баланс',true),daily:integer(x.daily,'ежедневные расходы'),reserve:integer(x.reserve,'резерв'),purchase:integer(x.purchase,'покупку'),recurring,obligations};
 forecast(result);return result;
}
export function resultForSnapshot(x){return forecast(cleanSnapshot(x));}
