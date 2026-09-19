import { createRemoteJWKSet, jwtVerify } from 'jose'
import { neon as postgres } from '@neondatabase/serverless'
import { createUserStore, createRegistrar, validateNewUser, validateMember } from './users.js'

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function sessionError(error) {
  const messages = {
    ERR_JWT_EXPIRED: 'Sua sessão expirou. Saia e entre novamente. [AUTH_EXPIRED]',
    ERR_JWS_INVALID: 'O app enviou uma sessão que não está no formato JWT. [AUTH_FORMAT]',
    ERR_JWT_INVALID: 'O app enviou um JWT inválido. [AUTH_FORMAT]',
    ERR_JWKS_NO_MATCHING_KEY: 'A chave da sessão não foi encontrada no Neon Auth. [AUTH_KEY]',
    ERR_JWS_SIGNATURE_VERIFICATION_FAILED: 'A assinatura da sessão não corresponde ao Neon Auth configurado. [AUTH_SIGNATURE]',
    ERR_JWKS_TIMEOUT: 'O servidor não conseguiu consultar as chaves do Neon Auth a tempo. Tente novamente. [AUTH_TIMEOUT]'
  }
  if (error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    const claim = ['iss', 'aud', 'sub', 'exp', 'iat'].includes(error.claim) ? error.claim : 'other'
    if (claim === 'iss') {
      // Only report the public issuer URL, never the JWT or personal claims.
      let issuer = 'ausente ou não é uma URL pública'
      try {
        const url = new URL(error.payload?.iss)
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
          issuer = `${url.origin}${url.pathname}`.slice(0, 300)
        }
      } catch { /* Keep a non-sensitive fallback. */ }
      return new ApiError(401, `Emissor recebido da sessão: ${issuer}. A API aceita somente os emissores do Neon Auth configurado. [AUTH_ISSUER]`)
    }
    return new ApiError(401, `A sessão não corresponde à configuração esperada (${claim}). [AUTH_CLAIM]`)
  }
  if (error instanceof TypeError && error.message === 'fetch failed') {
    return new ApiError(503, 'O servidor não conseguiu conectar ao Neon Auth. Confira a conexão do Mac. [AUTH_NETWORK]')
  }
  return new ApiError(401, messages[error.code] || 'Não foi possível validar a sessão. Saia e entre novamente. [AUTH_INVALID]')
}

export function createVerifier(authUrl, keySet) {
  const authBase = authUrl.replace(/\/$/, '')
  const origin = new URL(authBase).origin
  // Authenticated sessions use the origin; the anonymous endpoint uses authBase.
  // Keep keys pinned to this database's Auth URL, never to a token-supplied URL.
  const issuers = [origin, `${origin}/`, authBase]
  const keys = keySet || createRemoteJWKSet(new URL(`${authBase}/.well-known/jwks.json`))
  return async token => {
    const { payload } = await jwtVerify(token, keys, {
      issuer: issuers, audience: origin,
      algorithms: ['EdDSA', 'ES256', 'RS256'], requiredClaims: ['sub', 'exp', 'iat'],
      clockTolerance: 5
    })
    if (typeof payload.sub !== 'string' || !payload.sub || payload.role === 'anonymous') {
      throw new Error('Sessão autenticada obrigatória')
    }
    return payload.sub
  }
}

export function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
    !state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) {
    throw new ApiError(400, 'Estrutura de dados inválida.')
  }
  for (const name of ['clients', 'products', 'payments', 'quotes', 'users']) {
    if (!Array.isArray(state[name])) throw new ApiError(400, `Lista inválida: ${name}.`)
    const ids = new Set()
    for (const row of state[name]) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new ApiError(400, `Identificador inválido ou repetido em ${name}.`)
      ids.add(row.id)
    }
  }
  if (state.users.some(u => 'passwordHash' in u || 'password' in u)) throw new ApiError(400, 'Senhas locais não podem ser importadas.')
  const numbers = new Set()
  for (const quote of state.quotes) {
    const number = Number(quote.number)
    if (!/^\d+$/.test(String(quote.number)) || !Number.isSafeInteger(number) || number < 1 || numbers.has(number)) {
      throw new ApiError(400, 'Número de orçamento inválido ou duplicado.')
    }
    numbers.add(number)
  }
  return state
}

export function createStore(databaseUrl) {
  const sql = postgres(databaseUrl)
  return {
    async read(userId) {
      const rows = await sql`select s.version, s.state from public.app_state s
        where s.id = 1 and exists (select 1 from public.app_members m where m.user_id = ${userId})`
      return rows[0] ? { state: rows[0].state, version: Number(rows[0].version) } : null
    },
    async write(userId, version, state) {
      const rows = await sql`update public.app_state s set state = ${JSON.stringify(state)}::jsonb, version = s.version + 1
        where s.id = 1 and s.version = ${version}
        and exists (select 1 from public.app_members m where m.user_id = ${userId})
        returning s.state, s.version`
      if (rows[0]) return { state: rows[0].state, version: Number(rows[0].version) }
      if (!await this.read(userId)) throw new ApiError(403, 'Acesso não autorizado. Autorize sua conta em app_members no Neon.')
      return { conflict: true }
    }
  }
}

async function readJson(req) {
  const limit = 10 * 1024 * 1024
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new ApiError(415, 'Envie os dados em JSON.')
  if (Number(req.headers['content-length']) > limit) throw new ApiError(413, 'Backup maior que 10 MB.')
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > limit) throw new ApiError(413, 'Backup maior que 10 MB.')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new ApiError(400, 'JSON inválido.') }
}

export function createApi({ authUrl, databaseUrl, verifyToken, store, userStore, registerUser } = {}) {
  const verify = verifyToken || (authUrl ? createVerifier(authUrl) : null)
  const db = store || (databaseUrl ? createStore(databaseUrl) : null)
  const members = userStore || (databaseUrl ? createUserStore(postgres(databaseUrl)) : null)
  const register = registerUser || (authUrl ? createRegistrar(authUrl) : null)
  return async (req, res, next = () => { res.statusCode = 404; res.end() }) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (!path.startsWith('/api/')) return next()
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(body))
    }
    if (path === '/api/health' && req.method === 'GET') return send(verify && db ? 200 : 503, { configured: Boolean(verify && db) })
    if (!['/api/state', '/api/me', '/api/users'].includes(path)) return send(404, { message: 'Rota não encontrada.' })
    const methods = path === '/api/users' ? ['GET', 'POST', 'PUT'] : path === '/api/me' ? ['GET'] : ['GET', 'PUT']
    if (!methods.includes(req.method)) return send(405, { message: 'Método não permitido.' })
    if (!verify || !db) return send(503, { message: 'Configure DATABASE_URL no servidor e reinicie o app. Use a connection string de Connect no Neon, sem prefixo VITE_.' })
    try {
      const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')
      if (!match) throw new ApiError(401, 'Entre novamente para acessar os dados.')
      let userId
      try { userId = await verify(match[1]) }
      catch (error) { throw sessionError(error) }
      if (path === '/api/me' || path === '/api/users') {
        if (!members) throw new ApiError(503, 'Gerenciamento de usuários indisponível.')
        const role = await members.role(userId)
        if (!role) throw new ApiError(403, 'Seu acesso não está autorizado.')
        if (path === '/api/me') return send(200, { id: userId, role })
        if (role !== 'Administrador') throw new ApiError(403, 'Somente administradores podem gerenciar usuários.')
        if (req.method === 'GET') return send(200, { users: await members.list(userId) })
        const input = await readJson(req)
        if (req.method === 'PUT') {
          const member = validateMember(input)
          if (member.id === userId) throw new ApiError(400, 'Você não pode alterar o próprio acesso ou perfil.')
          await members.update(userId, member)
          return send(200, { ok: true })
        }
        const account = validateNewUser(input)
        if (await members.emailExists(account.email)) throw new ApiError(409, 'E-mail já cadastrado. Atualize a lista para autorizar ou editar o acesso.')
        if (!register) throw new ApiError(503, 'Cadastro indisponível.')
        const id = await register(account, req.headers.origin)
        try { await members.update(userId, { id, role: account.role, active: true }) }
        catch { throw new ApiError(409, 'Conta criada no Neon Auth, mas não autorizada. Atualize a lista e autorize o acesso.') }
        return send(201, { ok: true })
      }
      if (req.method === 'GET') {
        const result = await db.read(userId)
        if (!result) throw new ApiError(403, 'Acesso não autorizado. Autorize sua conta em app_members no Neon.')
        return send(200, result)
      }
      const body = await readJson(req)
      if (!Number.isSafeInteger(body?.expected_version) || body.expected_version < 0) throw new ApiError(400, 'Versão dos dados inválida.')
      return send(200, await db.write(userId, body.expected_version, validateState(body.next_state)))
    } catch (error) {
      // Never return driver errors: they can contain SQL, connection strings or client data.
      return send(error.status || 500, { message: error instanceof ApiError ? error.message : 'Não foi possível acessar o banco. Confira DATABASE_URL, o banco selecionado e a execução do schema.sql.' })
    }
  }
}
