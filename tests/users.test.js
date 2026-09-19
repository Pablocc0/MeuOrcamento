import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createApi } from '../server/api.js'
import { createRegistrar, createUserStore, validateNewUser } from '../server/users.js'

const newUser = { name: 'Pessoa Teste', email: 'person@example.test', password: 'temporary-secret', role: 'Representante' }
async function request(api, method = 'GET', body, token = 'admin', path = '/api/users') {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : [])
  Object.assign(req, { url: path, method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'http://localhost:5174' } })
  const result = {}
  await api(req, { writeHead(status, headers) { Object.assign(result, { status, headers }) }, end(body) { result.body = JSON.parse(body) } })
  return result
}
function fixture() {
  const calls = []
  const userStore = {
    async role(id) { return id === 'admin' ? 'Administrador' : id === 'rep' ? 'Representante' : null },
    async list(id) { calls.push(['list', id]); return [{ id: 'admin', name: 'Admin', active: true }] },
    async emailExists() { return false },
    async update(...args) { calls.push(['update', ...args]) }
  }
  const options = { store: {}, userStore, verifyToken: async t => t, registerUser: async (input, origin) => { calls.push(['register', origin]); return 'new-id' } }
  return { calls, options, userStore, api: createApi(options) }
}

test('somente administrador lista, cria ou altera acessos', async () => {
  const { api, calls } = fixture()
  for (const token of ['rep', 'blocked']) for (const method of ['GET', 'POST', 'PUT']) {
    assert.equal((await request(api, method, newUser, token)).status, 403)
  }
  assert.deepEqual(calls, [])
  assert.equal((await request(api)).status, 200)
  assert.equal((await request(api, 'GET', undefined, 'rep', '/api/me')).body.role, 'Representante')
})

test('cadastro valida entrada, não troca sessão e autoriza a identidade devolvida pelo Neon', async () => {
  const { api, calls } = fixture()
  const result = await request(api, 'POST', { ...newUser, user_id: 'admin' })
  assert.equal(result.status, 201)
  assert.deepEqual(calls, [['register', 'http://localhost:5174'], ['update', 'admin', { id: 'new-id', role: 'Representante', active: true }]])
  assert.equal(result.headers['Set-Cookie'], undefined)
  assert.doesNotMatch(JSON.stringify(result), /temporary-secret|token/)
  for (const input of [{ ...newUser, password: 'short' }, { ...newUser, role: 'owner' }, { ...newUser, email: 'invalid' }]) {
    assert.throws(() => validateNewUser(input))
    assert.equal((await request(api, 'POST', input)).status, 400)
  }
})

test('bloqueia autoalteração, papéis inválidos e mudanças de autorização via estado do cliente', async () => {
  const { api, calls } = fixture()
  for (const body of [{ id: 'admin', role: 'Representante', active: false }, { id: 'other', role: 'owner', active: true }, { id: 'other', role: 'Administrador', active: 'true' }]) {
    assert.equal((await request(api, 'PUT', body)).status, 400)
  }
  assert.deepEqual(calls, [])
  assert.equal((await request(api, 'PUT', { id: 'rep', role: 'Representante', active: false })).status, 200)
  assert.deepEqual(calls[0], ['update', 'admin', { id: 'rep', role: 'Representante', active: false }])
})

test('cadastro existente e falha parcial orientam recuperação sem recriar conta', async () => {
  const { options, userStore, calls } = fixture()
  userStore.emailExists = async () => true
  assert.equal((await request(createApi(options), 'POST', newUser)).status, 409)
  assert.deepEqual(calls, [])
  userStore.emailExists = async () => false
  userStore.update = async () => { throw new Error('private database error') }
  const result = await request(createApi(options), 'POST', newUser)
  assert.equal(result.status, 409)
  assert.match(result.body.message, /Conta criada/)
  assert.doesNotMatch(result.body.message, /private/)
})

test('cadastro remoto não encaminha cookies nem aceita identidade inconsistente', async () => {
  let seen
  const registrar = createRegistrar('https://auth.example.test/db/auth/', async (url, init) => {
    seen = { url, init }
    return { ok: true, json: async () => ({ user: { id: 'new-id', email: newUser.email }, token: 'never-forward' }) }
  })
  assert.equal(await registrar(newUser, 'http://localhost:5174'), 'new-id')
  assert.equal(seen.url, 'https://auth.example.test/db/auth/sign-up/email')
  assert.equal(seen.init.headers.Cookie, undefined)
  assert.equal(seen.init.headers.Authorization, undefined)
  const mismatch = createRegistrar('https://auth.example.test', async () => ({ ok: true, json: async () => ({ user: { id: 'admin', email: 'other@example.test' } }) }))
  await assert.rejects(mismatch(newUser), /não confirmou/)
})

test('alteração de membros usa transação com bloqueio e revalidação do administrador', async () => {
  const sql = (strings, ...values) => ({ text: strings.join('?'), values })
  let queries
  sql.transaction = async q => { queries = q; return [[], [{ user_id: 'rep' }]] }
  const store = createUserStore(sql)
  await store.update('admin', { id: 'rep', role: 'Representante', active: false })
  assert.match(queries[0].text, /lock table public.app_members/)
  assert.match(queries[1].text, /delete from public.app_members/)
  assert.match(queries[1].text, /role = 'Administrador'/)
  await store.update('admin', { id: 'rep', role: 'Administrador', active: true })
  assert.match(queries[1].text, /on conflict/)
  assert.match(queries[1].text, /role = 'Administrador'/)
  await assert.rejects(store.update('admin', { id: 'admin', role: 'Representante', active: false }))
})
