import { useEffect, useState } from 'react'
import { requestApi } from './neon.js'
import './users.css'

const roles = ['Representante', 'Administrador']

function UserCard({ user, self, busy, onSave }) {
  const [role, setRole] = useState(user.role || 'Representante')
  const [active, setActive] = useState(user.active)
  return <form className="user-card" onSubmit={event => {
    event.preventDefault()
    if (!active && user.active && !confirm(`Bloquear o acesso de ${user.name}? O histórico será preservado.`)) return
    if (role === 'Administrador' && user.role !== role && !confirm(`Permitir que ${user.name} gerencie o acesso de outros usuários?`)) return
    onSave({ id: user.id, role, active })
  }}>
    <div><strong>{user.name || 'Sem nome'}{self && ' (você)'}</strong><small>{user.email}</small>
      <span className={`badge ${user.active ? 'badge-approved' : 'badge-cancelled'}`}>{user.active ? 'Autorizado' : 'Sem acesso'}</span></div>
    <label className="field"><span>Perfil</span><select disabled={self || busy} value={role} onChange={e => setRole(e.target.value)}>{roles.map(r => <option key={r}>{r}</option>)}</select></label>
    <label className="field"><span>Acesso ao aplicativo</span><select disabled={self || busy} value={String(active)} onChange={e => setActive(e.target.value === 'true')}><option value="true">Autorizado</option><option value="false">Sem acesso</option></select></label>
    {!self && <button className="secondary" disabled={busy || (active === user.active && role === (user.role || 'Representante'))}>Salvar acesso</button>}
  </form>
}

export default function UsersPanel() {
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [revision, setRevision] = useState(0)
  async function load() {
    const current = await requestApi('/api/me')
    setMe(current)
    if (current.role === 'Administrador') {
      const result = await requestApi('/api/users')
      setUsers(result.users)
      setRevision(n => n + 1)
    } else setUsers([])
  }
  useEffect(() => {
    load().catch(e => setMessage(e.message)).finally(() => setLoading(false))
  }, [])
  async function refresh() {
    setBusy(true); setMessage('')
    try { await load() } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }
  async function save(input) {
    setBusy(true); setMessage('')
    try {
      await requestApi('/api/users', 'PUT', input)
      await load()
      setMessage('Acesso atualizado. O histórico do usuário foi preservado.')
    } catch (e) { setMessage(e.message) } finally { setBusy(false) }
  }
  async function create(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    if (values.role === 'Administrador' && !confirm('Este usuário poderá cadastrar, autorizar e bloquear outros usuários. Confirmar?')) return
    setBusy(true); setMessage('')
    try {
      await requestApi('/api/users', 'POST', values)
      form.reset()
      setCreating(false)
      await load()
      setMessage('Conta criada e autorizada. Informe o acesso à pessoa por um canal seguro. O Neon pode solicitar confirmação de e-mail.')
    } catch (e) { setMessage(e.message) }
    finally { values.password = ''; if (form.elements.password) form.elements.password.value = ''; setBusy(false) }
  }
  if (!loading && me && me.role !== 'Administrador') return null
  return <section className="panel settings-panel">
    <h2>Usuários</h2>
    {message && <div className="notice" role="status">{message}</div>}
    {loading ? <p>Conferindo permissões...</p> : me?.role === 'Administrador' ? <>
      <p>Administradores gerenciam acessos. Representantes utilizam os dados comerciais compartilhados. Bloquear remove o acesso ao app, sem excluir a conta no Neon ou os orçamentos.</p>
      <div className="button-row"><button className="primary" disabled={busy} onClick={() => setCreating(!creating)}>{creating ? 'Cancelar cadastro' : 'Novo usuário'}</button><button className="secondary" disabled={busy} onClick={refresh}>Atualizar lista</button></div>
      {creating && <form className="new-user-form" onSubmit={create}>
        <div className="form-grid">
          <label className="field"><span>Nome *</span><input name="name" autoComplete="off" required maxLength={120} disabled={busy}/></label>
          <label className="field"><span>E-mail *</span><input name="email" type="email" autoComplete="off" required maxLength={254} disabled={busy}/></label>
          <label className="field"><span>Senha inicial *</span><input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} disabled={busy}/></label>
          <label className="field"><span>Perfil</span><select name="role" disabled={busy}>{roles.map(r => <option key={r}>{r}</option>)}</select></label>
        </div>
        <p>A senha é enviada ao Neon Auth e não fica salva no backup. Sua sessão de administrador será mantida.</p>
        <button className="primary" disabled={busy}>{busy ? 'Aguarde...' : 'Cadastrar e autorizar'}</button>
      </form>}
      <label className="field"><span>Buscar usuário</span><input type="search" placeholder="Nome ou e-mail" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="user-list">{users.filter(u => `${u.name} ${u.email}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(u => <UserCard key={`${u.id}-${revision}`} user={u} self={u.id === me.id} busy={busy} onSave={save}/>)}</div>
      {!users.length && <p>Nenhuma conta encontrada.</p>}
      <p>Quem usar “Criar conta” na tela de login aparece aqui como “Sem acesso”, até ser autorizado. Seu próprio perfil é protegido contra alterações.</p>
    </> : <button className="secondary" disabled={busy} onClick={refresh}>Tentar novamente</button>}
  </section>
}
