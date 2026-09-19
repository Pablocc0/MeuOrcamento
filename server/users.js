import { ApiError } from './api.js'

const roles = ['Administrador', 'Representante']
export function validateMember(input) {
  if (!input || typeof input.id !== 'string' || !input.id || input.id.length > 200 ||
      typeof input.active !== 'boolean' || !roles.includes(input.role)) {
    throw new ApiError(400, 'Informe usuário, perfil e situação válidos.')
  }
  return { id: input.id, role: input.role, active: input.active }
}

export function validateNewUser(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = input?.password
  if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' || password.length < 8 || password.length > 128 || !roles.includes(input?.role)) {
    throw new ApiError(400, 'Informe nome, e-mail, perfil e uma senha de 8 a 128 caracteres.')
  }
  return { name, email, password, role: input.role }
}

export function createUserStore(sql) {
  return {
    async role(id) {
      const rows = await sql`select role from public.app_members where user_id = ${id}`
      return rows[0]?.role || null
    },
    async list(actor) {
      return sql`select u.id::text as id, u.name, u.email, m.role,
        (m.user_id is not null) as active from neon_auth."user" u
        left join public.app_members m on m.user_id = u.id::text
        where exists (select 1 from public.app_members where user_id = ${actor} and role = 'Administrador')
        order by lower(u.name), lower(u.email)`
    },
    async emailExists(email) {
      const rows = await sql`select id from neon_auth."user" where lower(email) = ${email} limit 1`
      return rows.length > 0
    },
    async update(actor, input) {
      const { id, role, active } = validateMember(input)
      if (id === actor) throw new ApiError(400, 'Você não pode alterar o próprio acesso ou perfil.')
      // Serialize membership changes; an administrator revoked concurrently cannot
      // finish a later mutation. Self changes are forbidden, preserving an admin.
      const [, rows] = await sql.transaction([
        sql`lock table public.app_members in share row exclusive mode`,
        active ? sql`insert into public.app_members (user_id, role)
          select u.id::text, ${role} from neon_auth."user" u where u.id::text = ${id}
          and exists (select 1 from public.app_members where user_id = ${actor} and role = 'Administrador')
          on conflict (user_id) do update set role = excluded.role returning user_id`
          : sql`delete from public.app_members where user_id = ${id}
          and exists (select 1 from public.app_members where user_id = ${actor} and role = 'Administrador')
          returning user_id`
      ])
      if (!rows.length) throw new ApiError(409, 'Acesso alterado ou usuário indisponível. Atualize a lista.')
    }
  }
}

export function createRegistrar(authUrl, fetcher = fetch) {
  return async ({ name, email, password }, origin) => {
    let response
    try {
      response = await fetcher(`${authUrl.replace(/\/$/, '')}/sign-up/email`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify({ name, email, password })
      })
    } catch {
      throw new ApiError(502, 'Não foi possível confirmar a criação no Neon Auth. Atualize a lista antes de tentar novamente.')
    }
    const result = await response.json().catch(() => null)
    if (!response.ok || typeof result?.user?.id !== 'string' || result.user.email?.toLowerCase() !== email) {
      throw new ApiError(502, 'O Neon Auth não confirmou o cadastro. Confira os domínios permitidos e atualize a lista; se a conta existir, autorize-a por lá.')
    }
    // Never forward cookies or tokens from signup: the administrator stays logged in.
    return result.user.id
  }
}
