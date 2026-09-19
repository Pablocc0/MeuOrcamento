-- Para instalações novas com a API Node. Instalações que já executaram schema.sql
-- possuem estas tabelas e não precisam de uma nova migração.
begin;
create table if not exists public.app_members (
  user_id text primary key,
  role text not null default 'Representante' check (role in ('Administrador', 'Representante'))
);
create table if not exists public.app_state (
  id integer primary key check (id = 1),
  version bigint not null default 0,
  state jsonb not null default '{}'::jsonb
);
insert into public.app_state (id) values (1) on conflict do nothing;
alter table public.app_members enable row level security;
alter table public.app_state enable row level security;
revoke all on public.app_members, public.app_state from public;
do $$
declare role_name text;
begin
  for role_name in select rolname from pg_roles where rolname in ('anonymous', 'anon', 'authenticated') loop
    execute format('revoke all on public.app_members, public.app_state from %I', role_name);
  end loop;
end;
$$;
commit;
