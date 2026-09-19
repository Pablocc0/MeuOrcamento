import { createAuthClient } from '@neondatabase/neon-js/auth'
import { defaultSettings, initialPayments, updatedProducts, catalogProducts } from './data.js'

export const configured = Boolean(import.meta.env?.VITE_NEON_AUTH_URL)
export const neon = configured ? { auth: createAuthClient(import.meta.env.VITE_NEON_AUTH_URL) } : null

export const emptyState = () => ({ users: [], clients: [], products: [...updatedProducts, ...catalogProducts], payments: initialPayments, quotes: [], settings: defaultSettings })

export async function requestApi(path, method = 'GET', body) {
  const session = await neon.auth.getSession()
  const token = session.data?.session?.token
  if (session.error || !token) throw new Error('Sua sessão expirou. Saia e entre novamente.')
  let response
  try {
    response = await fetch(path, {
      method, cache: 'no-store', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
  } catch { throw new Error('Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.') }
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.message || 'Servidor indisponível. Execute npm run dev ou npm start na versão publicada.')
  return result
}

const requestState = (method = 'GET', body) => requestApi('/api/state', method, body)

export async function readRemote() {
  const result = await requestState()
  if (!result) throw new Error('Acesso não autorizado. Cadastre seu e-mail na tabela app_members no Neon.')
  return { state: { ...emptyState(), ...result.state, settings: { ...defaultSettings, ...result.state?.settings } }, version: Number(result.version) }
}

export async function changeRemote(transform) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await readRemote()
    const next = transform(current.state)
    const result = await requestState('PUT', { expected_version: current.version, next_state: next })
    if (result?.conflict) continue
    return { ...next, ...result?.state, settings: { ...defaultSettings, ...(result?.state?.settings || next.settings) } }
  }
  throw new Error('Os dados foram alterados em outro aparelho. Atualize e tente novamente.')
}

export function cleanBackup(value) {
  if (!value || !Array.isArray(value.clients) || !Array.isArray(value.quotes) || !Array.isArray(value.products) || !Array.isArray(value.payments)) throw new Error('Arquivo de backup inválido.')
  return {
    clients: value.clients,
    products: value.products,
    payments: value.payments,
    quotes: value.quotes,
    settings: { ...defaultSettings, ...value.settings },
    users: Array.isArray(value.users) ? value.users.map(({ id, name, email, role }) => ({ id, name, email, role })) : []
  }
}
