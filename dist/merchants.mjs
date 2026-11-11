// Local hints, not proof of a transaction's purpose or monthly obligation.
// Sources for category hints: https://www.goodline.ru/ and https://begemag.ru/.
// PLAYEROK was identified by the user as an online purchase.
export const merchantRules=[
 {key:'playerok',label:'PLAYEROK',category:'Интернет-покупки',aliases:['playerok','player ok','плеерок','плеер ок']},
 {key:'goodline',label:'Goodline',category:'Связь и интернет',aliases:['goodline','good line','гудлайн','гуд лайн']},
 {key:'begemag',label:'Бегемаг',category:'Продукты',aliases:['бегемаг','begemag']}
];
export function recognizeMerchant(description){
 const text=String(description||'').toLowerCase().replace(/ё/g,'е');
 for(const rule of merchantRules)for(const alias of rule.aliases){
  let at=text.indexOf(alias);
  while(at>=0){const before=text[at-1]||'',after=text[at+alias.length]||'';
   if(!/[\p{L}\p{N}]/u.test(before)&&!/[\p{L}\p{N}]/u.test(after))return rule;
   at=text.indexOf(alias,at+1);
  }
 }
 return null;
}
