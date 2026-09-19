import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose'
import { createApi, createVerifier, validateState } from '../server/api.js'

const issuer = 'https://auth.example.test/database/auth'
const audience = 'https://auth.example.test'
const pair = await generateKeyPair('EdDSA')
const jwk = { ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'EdDSA' }
const verify = createVerifier(issuer, createLocalJWKSet({ keys: [jwk] }))
const sign = (claims = {}, key = pair.privateKey) => new SignJWT({ sub: 'member', role: 'authenticated', ...claims })
  .setProtectedHeader({ alg: 'EdDSA', kid: 'test-key' }).setIssuer(claims.iss || issuer)
  .setAudience(claims.aud || audience).setIssuedAt().setExpirationTime(claims.exp || '5m').sign(key)

test('valida EdDSA e rejeita assinatura, emissor, destinatário e validade incorretos', async () => {
  assert.equal(await verify(await sign()), 'member')
  const wrong = await generateKeyPair('EdDSA')
  for (const token of [await sign({}, wrong.privateKey), await sign({ iss: 'https://other.test/auth' }),
    await sign({ aud: 'https://other.test' }), await sign({ exp: 1 }), await sign({ role: 'anonymous' }), await sign({ sub: '' })]) {
    await assert.rejects(verify(token))
  }
})

test('aceita emissor do domínio Neon sem relaxar assinatura, audiência ou isolamento', async () => {
  const wrong = await generateKeyPair('EdDSA')
  for (const iss of [audience, `${audience}/`]) {
    assert.equal(await verify(await sign({ iss })), 'member')
    await assert.rejects(verify(await sign({ iss }, wrong.privateKey)))
    await assert.rejects(verify(await sign({ iss, aud: 'https://other.test' })))
    await assert.rejects(verify(await sign({ iss, exp: 1 })))
    await assert.rejects(verify(await sign({ iss, role: 'anonymous' })))
  }
  for (const iss of [`${audience}/other/auth`, `${audience}.evil.test`, `http://auth.example.test`]) {
    await assert.rejects(verify(await sign({ iss })))
  }
})

async function request(api, { method = 'GET', token, body, path = '/api/state' } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.url = path
  req.method = method
  req.headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
  const result = {}
  await api(req, { writeHead(status, headers) { result.status = status; result.headers = headers }, end(text) { result.body = JSON.parse(text) } })
  return result
}

const state = { clients: [], products: [], payments: [], quotes: [], users: [], settings: {} }
const memberStore = { async read(id) { return id === 'member' ? { state, version: 0 } : null } }

test('diagnóstico de sessão distingue erros sem expor token ou mensagens internas', async () => {
  for (const [code, claim, expected] of [
    ['ERR_JWT_EXPIRED', undefined, 'AUTH_EXPIRED'],
    ['ERR_JWS_INVALID', undefined, 'AUTH_FORMAT'],
    ['ERR_JWT_CLAIM_VALIDATION_FAILED', 'aud', 'AUTH_CLAIM'],
    ['ERR_JWKS_NO_MATCHING_KEY', undefined, 'AUTH_KEY']
  ]) {
    const api = createApi({ store: memberStore, verifyToken: async () => {
      throw Object.assign(new Error('private-token'), { code, claim })
    } })
    const result = await request(api, { token: 'private-token' })
    assert.equal(result.status, 401)
    assert.ok(result.body.message.includes(expected))
    assert.doesNotMatch(JSON.stringify(result.body), /private-token/)
  }
})

test('API exige token válido e associação mesmo depois da autenticação', async () => {
  const api = createApi({ verifyToken: verify, store: memberStore })
  assert.equal((await request(api)).status, 401)
  assert.equal((await request(api, { token: 'invalid' })).status, 401)
  assert.equal((await request(api, { token: await sign({ sub: 'outsider' }) })).status, 403)
  const ok = await request(api, { token: await sign() })
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['Cache-Control'], 'no-store')
  assert.deepEqual(ok.body, { state, version: 0 })
})

test('emissor divergente mostra apenas URL pública e continua bloqueado', async () => {
  const api = createApi({ verifyToken: verify, store: memberStore })
  const result = await request(api, { token: await sign({ iss: 'https://other.test/auth?secret=private' }) })
  assert.equal(result.status, 401)
  assert.match(result.body.message, /https:\/\/other.test\/auth/)
  assert.match(result.body.message, /AUTH_ISSUER/)
  assert.doesNotMatch(result.body.message, /secret|private/)
})

test('gravação exige versão válida e encaminha identidade verificada ao banco', async () => {
  let seen
  const api = createApi({ verifyToken: verify, store: { async write(...args) { seen = args; return { conflict: true } } } })
  const token = await sign()
  assert.equal((await request(api, { token, method: 'PUT', body: { expected_version: -1, next_state: state } })).status, 400)
  const result = await request(api, { token, method: 'PUT', body: { expected_version: 4, next_state: state, user_id: 'attacker' } })
  assert.deepEqual(result.body, { conflict: true })
  assert.deepEqual(seen, ['member', 4, state])
})

test('rejeita números duplicados, dados inválidos e senhas em backups', () => {
  assert.equal(validateState(state), state)
  for (const invalid of [null, { ...state, clients: null }, { ...state, clients: [{ id: '1' }, { id: '1' }] },
    { ...state, quotes: [{ id: '1', number: '0050' }, { id: '2', number: '50' }] },
    { ...state, users: [{ id: '1', passwordHash: 'secret' }] }]) assert.throws(() => validateState(invalid))
})

test('erros de conexão não expõem dados ou credenciais', async () => {
  const api = createApi({ verifyToken: verify, store: { async read() { throw new Error('postgresql://user:secret@host/private') } } })
  const result = await request(api, { token: await sign() })
  assert.equal(result.status, 500)
  assert.doesNotMatch(JSON.stringify(result.body), /secret|postgresql:/)
})

test('servidor sem configuração não permite acesso nem gravação', async () => {
  const api = createApi()
  assert.equal((await request(api)).status, 503)
  assert.deepEqual((await request(api, { path: '/api/health' })).body, { configured: false })
})
