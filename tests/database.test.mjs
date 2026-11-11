import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const snap={version:1,from:'2026-11-12',to:'2026-11-30',balance:3500000,daily:55000,reserve:500000,purchase:1200000,recurring:[],obligations:[]};
test('PostgreSQL policies isolate accounts, reject impersonation and disallow bank history',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth, public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; insert into auth.users values ('${A}'),('${B}');`);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/202611120001_saved_calculations.sql',import.meta.url),'utf8'));
  await db.exec(`set role anon`);await assert.rejects(db.query('select * from public.saved_calculations'),/permission denied/);await db.exec('reset role');
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${A}',false)`);
  const first=await db.query('insert into public.saved_calculations(name,snapshot) values ($1,$2) returning id,user_id',['Первый',JSON.stringify(snap)]);assert.equal(first.rows[0].user_id,A);
  await assert.rejects(db.query('insert into public.saved_calculations(user_id,name,snapshot) values ($1,$2,$3)',[B,'Чужой',JSON.stringify(snap)]),/row-level security/);
  await assert.rejects(db.query('insert into public.saved_calculations(name,snapshot) values ($1,$2)',['Выписка',JSON.stringify({...snap,operations:[{description:'Private'}]})]),/check constraint/);
  await assert.rejects(db.query('insert into public.saved_calculations(name,snapshot) values ($1,$2)',['Неверный',JSON.stringify({...snap,recurring:[{label:'Связь',day:1.5,amount:100,active:true}]})]),/check constraint/);
  await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);assert.equal((await db.query('select * from public.saved_calculations')).rows.length,0);
  assert.equal((await db.query('delete from public.saved_calculations where id=$1 returning id',[first.rows[0].id])).rows.length,0);
  await db.query('insert into public.saved_calculations(name,snapshot) values ($1,$2)',['Второй',JSON.stringify(snap)]);
  await db.exec(`select set_config('request.jwt.claim.sub','${A}',false)`);assert.equal((await db.query('select name from public.saved_calculations')).rows[0].name,'Первый');
  await assert.rejects(db.query('update public.saved_calculations set user_id=$1',[B]),/permission denied/);
  assert.equal((await db.query('delete from public.saved_calculations returning id')).rows.length,1);
  await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);assert.equal((await db.query('select name from public.saved_calculations')).rows[0].name,'Второй');
 }finally{await db.close();}
});
