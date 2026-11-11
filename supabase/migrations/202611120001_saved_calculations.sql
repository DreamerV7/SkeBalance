-- Store explicit calculation inputs, never original statement files or transaction history.
create function public.is_valid_calculation_snapshot(x jsonb)
returns boolean
language plpgsql immutable strict
set search_path = ''
as $$
declare k text; r jsonb; n numeric; d1 date; d2 date;
begin
  if jsonb_typeof(x) <> 'object' or pg_column_size(x) > 65536 then return false; end if;
  if exists (select 1 from jsonb_object_keys(x) as t(key)
    where key not in ('version','from','to','balance','daily','reserve','purchase','recurring','obligations')) then return false; end if;
  if x->>'version' <> '1' or jsonb_typeof(x->'version') <> 'number' then return false; end if;
  if not (x ?& array['version','from','to','balance','daily','reserve','purchase','recurring','obligations']) then return false; end if;
  if jsonb_typeof(x->'from') <> 'string' or jsonb_typeof(x->'to') <> 'string' then return false; end if;
  if (x->>'from') !~ '^\d{4}-\d{2}-\d{2}$' or (x->>'to') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  d1 := (x->>'from')::date; d2 := (x->>'to')::date;
  if d1 < date '2000-01-01' or d2 > date '2100-12-31' or d2-d1 not between 1 and 366 then return false; end if;
  foreach k in array array['balance','daily','reserve','purchase'] loop
    if jsonb_typeof(x->k) <> 'number' then return false; end if;
    n := (x->>k)::numeric;
    if n <> trunc(n) or abs(n) > 10000000000000 or (k <> 'balance' and n < 0) then return false; end if;
  end loop;
  if jsonb_typeof(x->'recurring') <> 'array' or jsonb_typeof(x->'obligations') <> 'array' then return false; end if;
  if jsonb_array_length(x->'recurring') > 100 or jsonb_array_length(x->'obligations') > 100 then return false; end if;
  for r in select value from jsonb_array_elements(x->'recurring') loop
    if jsonb_typeof(r) <> 'object' or not (r ?& array['label','amount','day','active']) then return false; end if;
    if exists (select 1 from jsonb_object_keys(r) as t(key) where key not in ('label','amount','day','active')) then return false; end if;
    if jsonb_typeof(r->'label') <> 'string' or char_length(btrim(r->>'label')) not between 1 and 100 then return false; end if;
    if jsonb_typeof(r->'amount') <> 'number' or (r->>'amount')::numeric not between 0 and 10000000000000 or (r->>'amount')::numeric <> trunc((r->>'amount')::numeric) then return false; end if;
    if jsonb_typeof(r->'day') <> 'number' or (r->>'day')::numeric not between 1 and 31 or (r->>'day')::numeric <> trunc((r->>'day')::numeric) then return false; end if;
    if jsonb_typeof(r->'active') <> 'boolean' then return false; end if;
  end loop;
  for r in select value from jsonb_array_elements(x->'obligations') loop
    if jsonb_typeof(r) <> 'object' or not (r ?& array['label','amount','date']) then return false; end if;
    if exists (select 1 from jsonb_object_keys(r) as t(key) where key not in ('label','amount','date')) then return false; end if;
    if jsonb_typeof(r->'label') <> 'string' or char_length(btrim(r->>'label')) not between 1 and 100 then return false; end if;
    if jsonb_typeof(r->'amount') <> 'number' or (r->>'amount')::numeric not between 0 and 10000000000000 or (r->>'amount')::numeric <> trunc((r->>'amount')::numeric) then return false; end if;
    if jsonb_typeof(r->'date') <> 'string' or (r->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    if (r->>'date')::date not between date '2000-01-01' and date '2100-12-31' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table public.saved_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  snapshot jsonb not null check (public.is_valid_calculation_snapshot(snapshot)),
  created_at timestamptz not null default now()
);

create index saved_calculations_user_created_idx on public.saved_calculations(user_id, created_at desc);
alter table public.saved_calculations enable row level security;
alter table public.saved_calculations force row level security;

revoke all on public.saved_calculations from public, anon, authenticated;
grant select, insert, delete on public.saved_calculations to authenticated;
revoke all on function public.is_valid_calculation_snapshot(jsonb) from public, anon;
grant execute on function public.is_valid_calculation_snapshot(jsonb) to authenticated;

create policy "Read own calculations" on public.saved_calculations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own calculations" on public.saved_calculations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Delete own calculations" on public.saved_calculations
  for delete to authenticated using ((select auth.uid()) = user_id);

comment on table public.saved_calculations is 'Explicitly saved forecast inputs. No bank files or full transaction history.';
