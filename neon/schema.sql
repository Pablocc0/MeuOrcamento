-- Execute no SQL Editor da branch principal do projeto MeuOrcamento.
-- Neon Auth e Data API precisam estar habilitados antes de executar.
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
-- O Neon não cria o papel "anon" (nome usado por outros provedores).
-- PUBLIC remove permissões herdadas por qualquer papel; authenticated não terá acesso direto às tabelas.
revoke all on public.app_members, public.app_state from public, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anonymous') then
    execute 'revoke all on public.app_members, public.app_state from anonymous';
  end if;
end;
$$;

create or replace function public.app_read_state()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.app_members where user_id = auth.user_id()::text) then
    return null;
  end if;
  select jsonb_build_object('version', version, 'state', state) into result
    from public.app_state where id = 1;
  return result;
end;
$$;

create or replace function public.app_write_state(expected_version bigint, next_state jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_version bigint;
declare record_item jsonb;
declare number_text text;
declare numbers text[] := array[]::text[];
declare new_version bigint;
begin
  if not exists (select 1 from public.app_members where user_id = auth.user_id()::text) then
    raise exception 'Acesso não autorizado';
  end if;
  if jsonb_typeof(next_state) <> 'object'
    or jsonb_typeof(next_state->'clients') <> 'array'
    or jsonb_typeof(next_state->'products') <> 'array'
    or jsonb_typeof(next_state->'payments') <> 'array'
    or jsonb_typeof(next_state->'quotes') <> 'array'
    or jsonb_typeof(next_state->'settings') <> 'object' then
    raise exception 'Estrutura de dados inválida';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(next_state->'users', '[]'::jsonb)) as u where u ? 'passwordHash') then
    raise exception 'Senhas locais não podem ser enviadas ao Neon';
  end if;
  for record_item in select value from jsonb_array_elements(next_state->'quotes') loop
    number_text := record_item->>'number';
    if number_text is null or number_text !~ '^[0-9]+$' or number_text::numeric > 9007199254740991 then
      raise exception 'Número de orçamento inválido';
    end if;
    if number_text::numeric::text = any(numbers) then
      raise exception 'Número de orçamento duplicado';
    end if;
    numbers := array_append(numbers, number_text::numeric::text);
  end loop;
  select version into current_version from public.app_state where id = 1 for update;
  if current_version <> expected_version then
    return jsonb_build_object('conflict', true);
  end if;
  update public.app_state set state = next_state, version = version + 1
    where id = 1 returning version into new_version;
  return jsonb_build_object('version', new_version, 'state', next_state);
end;
$$;

revoke all on function public.app_read_state() from public;
revoke all on function public.app_write_state(bigint, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anonymous') then
    execute 'revoke all on function public.app_read_state() from anonymous';
    execute 'revoke all on function public.app_write_state(bigint, jsonb) from anonymous';
  end if;
end;
$$;
grant execute on function public.app_read_state() to authenticated;
grant execute on function public.app_write_state(bigint, jsonb) to authenticated;

-- Depois de criar sua conta pelo app, autorize SOMENTE seu usuário no SQL Editor:
-- insert into public.app_members (user_id, role)
-- select id, 'Administrador' from neon_auth."user" where email = 'SEU_EMAIL_AQUI'
-- on conflict (user_id) do update set role = excluded.role;
