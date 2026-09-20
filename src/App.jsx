import { useEffect, useMemo, useState } from 'react'
import { LayoutDashboard, Users, Package, FileText, Wallet, CreditCard, Settings, Plus, Pencil, Trash2, LogOut, Download, Share2, Check, Search, ArrowLeft, Save } from 'lucide-react'
import { billingStatus, commissionTotal as quoteCommission, displayDate, emptyQuote, installmentPlan, invoiceTotal, money, nextOrderNumber, today, totals, uid } from './data.js'
import { makeQuotePdf, sharePdf } from './pdf.js'
import { changeRemote, cleanBackup, configured, emptyState, neon, readRemote } from './neon.js'
import UsersPanel from './UsersPanel.jsx'
import { MoneyInput, SearchSelect } from './FormInputs.jsx'
import { alphabetical, documentText, phoneText } from './input-format.js'

const digits = value => String(value || '').replace(/\D/g, '')
const numeric = value => Number(String(value || '').replace(',', '.')) || 0
const byName = alphabetical
const statusColor = { 'Rascunho': 'draft', 'Enviado': 'sent', 'Aprovado': 'approved', 'Faturamento parcial': 'partial', 'Faturado': 'billed', 'Cancelado': 'cancelled' }
function StatusBadge({ status }) { return <span className={`badge badge-${statusColor[status] || 'draft'}`}>{status}</span> }

function Field({ label, value, onChange, type = 'text', required = false, children, ...props }) {
  const monetary = type === 'money'
  const telephone = label === 'Telefone'
  return <label className="field"><span>{label}{required && ' *'}</span>{children || (monetary
    ? <MoneyInput value={value} onChange={onChange} required={required} {...props}/>
    : <input {...props} type={telephone ? 'tel' : type} inputMode={telephone ? 'tel' : props.inputMode} value={telephone ? phoneText(value) : value ?? ''} onChange={event => onChange(telephone ? phoneText(event.target.value) : event.target.value)} required={required}/>)}</label>
}
function Empty({ text }) { return <div className="empty">{text}</div> }
function Modal({ title, onClose, children, wide = false }) { return <div className="overlay" onMouseDown={onClose}><div className={`modal ${wide ? 'wide' : ''}`} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}>×</button></div>{children}</div></div> }

export default function App() {
  const [db, setDb] = useState(emptyState)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(configured)
  const [access, setAccess] = useState(false)
  const [signUp, setSignUp] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [modal, setModal] = useState(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { if (!configured) return; let active = true; (async () => { try { const result = await neon.auth.getSession(); if (!active) return; const authUser = result.data?.user; if (authUser) { setUser(authUser); try { const remote = await readRemote(); if (active) { setDb(remote.state); setAccess(true) } } catch (error) { if (active) setNotice(error.message) } } } catch (error) { if (active) setNotice(error.message) } finally { if (active) setLoading(false) } })(); return () => { active = false } }, [])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer) } }, [notice])
  async function commit(transform, message) { try { const next = await changeRemote(transform); setDb(next); if (message) setNotice(message); return true } catch (error) { setNotice(error.message); return false } }
  const saveCollection = async (key, item) => { if (await commit(current => ({ ...current, [key]: current[key].some(existing => existing.id === item.id) ? current[key].map(existing => existing.id === item.id ? item : existing) : [...current[key], item] }), 'Salvo com sucesso.')) setModal(null) }
  const updateQuote = (id, transform, message) => commit(state => ({ ...state, quotes: state.quotes.map(q => q.id === id ? transform(q) : q) }), message)
  async function saveQuote(quote) {
    if (!quote.clientId || !quote.items.length) return setNotice('Selecione cliente e pelo menos um produto.')
    if (invoiceTotal(quote) > totals(quote).total + .009) return setNotice('O novo total não pode ser menor que o valor já faturado.')
    const client = db.clients.find(c => c.id === quote.clientId)
    const saved = { ...quote, clientSnapshot: client, userId: quote.userId || user.id }
    if (invoiceTotal(saved) > .009) saved.status = billingStatus(saved)
    if (await commit(current => {
      if (current.quotes.some(q => q.id === saved.id)) return { ...current, quotes: current.quotes.map(q => q.id === saved.id ? saved : q) }
      const number = nextOrderNumber(current.settings, current.quotes)
      return { ...current, quotes: [...current.quotes, { ...saved, number }], settings: { ...current.settings, lastOrderNumber: Number(number), orderSequenceConfigured: true } }
    }, 'Orçamento salvo com numeração sequencial.')) setModal(null)
  }
  const remove = (key, item) => { if (key === 'clients' && db.quotes.some(q => q.clientId === item.id)) return setNotice('Cliente usado em orçamento: mantenha o cadastro para preservar o histórico.'); if (!confirm(`Excluir ${item.name || item.number}?`)) return; commit(current => ({ ...current, [key]: current[key].filter(x => x.id !== item.id) }), 'Registro excluído.') }
  const clientFor = quote => db.clients.find(c => c.id === quote.clientId) || quote.clientSnapshot || {}
  const filtered = list => list.filter(item => JSON.stringify(item).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  const quotesTotal = db.quotes.filter(q => q.status !== 'Cancelado').reduce((sum, q) => sum + totals(q).total, 0)
  const billedTotal = db.quotes.reduce((sum, q) => sum + (q.invoices || []).reduce((n, inv) => n + Number(inv.amount || 0), 0), 0)
  const commissionTotal = db.quotes.reduce((sum, q) => sum + (q.invoices || []).reduce((n, inv) => n + Number(inv.amount || 0) * Number(inv.rate || 0) / 100, 0), 0)

  async function handleAuth(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim().toLowerCase()
    const password = String(form.get('password'))
    if (!email || password.length < 8) return setNotice('Informe e-mail e senha de pelo menos 8 caracteres.')
    try {
      const result = signUp ? await neon.auth.signUp.email({ email, password, name: String(form.get('name')).trim() }) : await neon.auth.signIn.email({ email, password })
      if (result.error) throw new Error(result.error.message)
      const current = await neon.auth.getSession()
      if (!current.data?.user) return setNotice('Conta criada. Confirme seu e-mail, se solicitado, e entre novamente.')
      setUser(current.data.user)
      try { const remote = await readRemote(); setDb(remote.state); setAccess(true) } catch (error) { setNotice(error.message) }
    } catch (error) { setNotice(error.message) }
  }
  async function logout() { await neon.auth.signOut(); setUser(null); setAccess(false); setDb(emptyState()); setPage('dashboard') }
  function exportBackup() { const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); const url = URL.createObjectURL(blob); a.href = url; a.download = `meu-orcamento-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000) }
  async function importBackup(event) { const file = event.target.files?.[0]; if (!file) return; try { const next = cleanBackup(JSON.parse(await file.text())); if (!confirm('Substituir TODOS os dados do Neon pelo backup? Esta ação afeta todos os aparelhos.')) return; await commit(() => next, 'Backup importado no Neon.'); } catch (error) { setNotice(error.message) } event.target.value = '' }
  async function handlePdf(quote) { try { const doc = makeQuotePdf(quote, clientFor(quote), db.settings, db.users.find(u => u.id === quote.userId) || user); const result = await sharePdf(doc, `Pedido-${quote.number || 'sem-numero'}.pdf`); if (result === 'downloaded') setNotice('PDF baixado. Anexe-o ao e-mail ou WhatsApp.'); } catch (error) { setNotice(`Não foi possível gerar o PDF: ${error.message}`) } }

  if (!configured) return <div className="auth-wrap"><div className="auth-card"><h1>Configure o Neon</h1><p>Preencha VITE_NEON_AUTH_URL e DATABASE_URL no arquivo .env do projeto e reinicie o app. Consulte o README.</p></div></div>
  if (loading) return <div className="auth-wrap"><div className="auth-card">Conectando ao Neon...</div></div>
  if (!user) return <div className="auth-wrap"><form className="auth-card" onSubmit={handleAuth}><div className="brand-mark">J</div><h1>Meu Orçamento</h1><p>Representações JUREL · Neon Auth</p>{signUp && <label className="field"><span>Seu nome *</span><input name="name" required/></label>}<label className="field"><span>E-mail *</span><input name="email" type="email" required/></label><label className="field"><span>Senha *</span><input name="password" type="password" minLength="8" required/></label><button className="primary" type="submit">{signUp ? 'Criar conta' : 'Entrar'}</button><button type="button" className="link" onClick={() => setSignUp(!signUp)}>{signUp ? 'Já tenho conta' : 'Criar conta'}</button><small>Seus dados de trabalho serão armazenados no Neon após a autorização da conta.</small>{notice && <div className="notice">{notice}</div>}</form></div>
  if (!access) return <div className="auth-wrap"><div className="auth-card"><h1>Aguardando autorização</h1><p>Conta: {user.email}. Peça ao administrador para autorizar seu acesso em Configurações → Usuários. Depois toque em Atualizar.</p><button className="primary" onClick={async () => { try { const remote = await readRemote(); setDb(remote.state); setAccess(true); setNotice('Acesso autorizado.') } catch (error) { setNotice(error.message) } }}>Atualizar</button><button className="secondary" onClick={logout}>Sair</button>{notice && <div className="notice">{notice}</div>}</div></div>

  const nav = [['dashboard', LayoutDashboard, 'Visão geral'], ['quotes', FileText, 'Orçamentos'], ['clients', Users, 'Clientes'], ['products', Package, 'Produtos'], ['payments', CreditCard, 'Pagamentos'], ['finance', Wallet, 'Financeiro'], ['settings', Settings, 'Configurações']]
  return <div className="app-shell"><aside className="sidebar"><div className="logo"><div className="brand-mark">J</div><div><strong>Meu Orçamento</strong><small>JUREL · Grupo Kalfix</small></div></div><nav>{nav.map(([id, Icon, label]) => <button key={id} className={page === id ? 'selected' : ''} onClick={() => { setPage(id); setQuery('') }}><Icon size={19}/>{label}</button>)}</nav><div className="sidebar-bottom"><span>{user.name}</span><button onClick={logout}><LogOut size={18}/> Sair</button></div></aside><main><header className="topbar"><div><small>JUREL / {nav.find(n => n[0] === page)?.[2]}</small><h1>{nav.find(n => n[0] === page)?.[2]}</h1></div><div className="top-user">{user.name.slice(0, 1).toUpperCase()}</div></header>{notice && <div className="notice">{notice}</div>}
    {page === 'dashboard' && <><div className="hero"><div><span>PAINEL COMERCIAL</span><h2>Olá, {user.name.split(' ')[0]}.</h2><p>Orçamentos, faturamento e comissão em um só lugar.</p></div><button className="white-btn" onClick={() => setModal({ type: 'quote', item: emptyQuote() })}><Plus size={18}/> Novo orçamento</button></div><div className="stats"><div><small>Orçamentos</small><strong>{db.quotes.length}</strong></div><div><small>Valor em orçamentos</small><strong>{money(quotesTotal)}</strong></div><div><small>Faturado informado</small><strong>{money(billedTotal)}</strong></div><div><small>Comissão sobre faturado</small><strong>{money(commissionTotal)}</strong></div></div><section className="panel"><div className="panel-head"><h2>Últimos orçamentos</h2><button className="link" onClick={() => setPage('quotes')}>Ver todos →</button></div><QuoteList quotes={db.quotes.slice().reverse().slice(0, 6)} clientFor={clientFor} onOpen={q => setModal({ type: 'quote-view', item: q })}/></section></>}
    {page === 'clients' && <><Toolbar query={query} setQuery={setQuery} add={() => setModal({ type: 'client', item: { id: uid(), name: '', tradeName: '', documentType: 'CNPJ', document: '', address: '', district: '', city: '', state: 'MA', stateRegistration: '', phone: '', contact: '', email: '', notes: '', active: true } })} label="Novo cliente"/><section className="panel"><div className="panel-head"><h2>Clientes ({filtered(db.clients).length})</h2><small>Importados do DOCX; confira os dados antes de enviar.</small></div><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>CPF/CNPJ</th><th>Cidade</th><th>Contato</th><th></th></tr></thead><tbody>{filtered(db.clients).sort(byName).map(c => <tr key={c.id}><td><strong>{c.tradeName || c.name}</strong><small>{c.tradeName && c.name}</small></td><td>{c.document || '—'}</td><td>{c.city || '—'}/{c.state || '—'}</td><td>{c.phone || '—'}</td><td className="actions"><button onClick={() => setModal({ type: 'client', item: c })}><Pencil size={16}/></button><button onClick={() => remove('clients', c)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div></section></>}
    {page === 'products' && <><Toolbar query={query} setQuery={setQuery} add={() => setModal({ type: 'product', item: { id: uid(), code: '', name: '', unit: 'UN', cash: 0, term: 0, active: true, review: false } })} label="Novo produto"/><section className="panel"><div className="panel-head"><h2>Produtos ({filtered(db.products).length})</h2><small>Itens com “revisar” vieram do PDF antigo.</small></div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Unid.</th><th>À vista</th><th>A prazo</th><th></th></tr></thead><tbody>{filtered(db.products).sort(byName).map(p => <tr key={p.id}><td><strong>{p.name}</strong><small>{p.code || ''} {p.review && <em>Revisar preço</em>}</small></td><td>{p.unit}</td><td>{money(p.cash)}</td><td>{money(p.term)}</td><td className="actions"><button onClick={() => setModal({ type: 'product', item: p })}><Pencil size={16}/></button><button onClick={() => remove('products', p)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div></section></>}
    {page === 'payments' && <><Toolbar query={query} setQuery={setQuery} add={() => setModal({ type: 'payment', item: { id: uid(), name: '', terms: '' } })} label="Nova condição"/><section className="panel"><div className="panel-head"><h2>Condições de pagamento</h2><small>O texto da condição aparece no rodapé e nos dados do PDF.</small></div><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Prazos</th><th></th></tr></thead><tbody>{filtered(db.payments).map(p => <tr key={p.id}><td><strong>{p.name}</strong></td><td>{p.terms}</td><td className="actions"><button onClick={() => setModal({ type: 'payment', item: p })}><Pencil size={16}/></button><button onClick={() => remove('payments', p)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div></section></>}
    {page === 'quotes' && <><Toolbar query={query} setQuery={setQuery} add={() => setModal({ type: 'quote', item: emptyQuote() })} label="Novo orçamento"/><section className="panel"><div className="panel-head"><h2>Orçamentos ({filtered(db.quotes).length})</h2><small>Clique para ver PDF, faturamentos e comissões.</small></div><QuoteList quotes={filtered(db.quotes).slice().reverse()} clientFor={clientFor} onOpen={q => setModal({ type: 'quote-view', item: q })}/></section></>}
    {page === 'finance' && <FinancePanel quotes={db.quotes} clientFor={clientFor} onOpen={q => setModal({ type: 'quote-view', item: q })} quotesTotal={quotesTotal} billedTotal={billedTotal} commissionTotal={commissionTotal}/>}
    {page === 'settings' && <UsersPanel/>}
    {page === 'settings' && <><section className="panel settings-panel"><div className="panel-head"><h2>Dados da representação</h2></div><SettingsForm item={db.settings} quotes={db.quotes} onSave={settings => commit(current => ({ ...current, settings }), 'Configurações salvas.')}/></section><section className="panel settings-panel"><h2>Acesso e dados</h2><p>Login pelo Neon Auth. Administradores gerenciam as autorizações na seção Usuários, acima.</p><div className="button-row"><button className="secondary" onClick={exportBackup}><Download size={17}/> Exportar backup</button><label className="secondary upload"><input type="file" accept="application/json" onChange={importBackup}/> Importar backup para o Neon</label></div></section></>}
  </main>
  {modal?.type === 'client' && <Modal title={db.clients.some(x => x.id === modal.item.id) ? 'Editar cliente' : 'Novo cliente'} onClose={() => setModal(null)} wide><EntityForm key={modal.item.id} item={modal.item} fields={[["name", "Razão social / Nome"], ["tradeName", "Nome fantasia"], ["documentType", "Tipo", 'select', ['CNPJ', 'CPF']], ["document", "CNPJ / CPF"], ["stateRegistration", "Inscrição estadual"], ["contact", "Contato"], ["phone", "Telefone"], ["email", "E-mail", 'email'], ["address", "Endereço"], ["district", "Bairro"], ["city", "Cidade"], ["state", "UF"], ["notes", "Observações"]]} onSave={x => { if (!x.name && !x.tradeName) return setNotice('Informe o nome do cliente.'); if (x.document && digits(x.document).length !== (x.documentType === 'CPF' ? 11 : 14)) return setNotice(x.documentType === 'CPF' ? 'CPF precisa ter 11 dígitos.' : 'CNPJ precisa ter 14 dígitos.'); saveCollection('clients', x) }}/></Modal>}
  {modal?.type === 'product' && <Modal title="Produto" onClose={() => setModal(null)}><EntityForm key={modal.item.id} item={modal.item} fields={[["code", "Código"], ["name", "Nome do produto"], ["unit", "Unidade"], ["cash", "Valor à vista", 'money'], ["term", "Valor a prazo", 'money']]} onSave={x => { if (!x.name) return setNotice('Informe o nome do produto.'); saveCollection('products', { ...x, cash: numeric(x.cash), term: numeric(x.term), review: false }) }}/></Modal>}
  {modal?.type === 'payment' && <Modal title="Condição de pagamento" onClose={() => setModal(null)}><EntityForm key={modal.item.id} item={modal.item} fields={[["name", "Nome"], ["terms", "Prazos no PDF (ex.: 30/60/90/DD)"]]} onSave={x => { if (!x.name || !x.terms) return setNotice('Informe nome e prazos.'); saveCollection('payments', x) }}/></Modal>}
  {modal?.type === 'quote' && <Modal title={db.quotes.some(q => q.id === modal.item.id) ? `Editar pedido #${modal.item.number}` : 'Novo orçamento'} onClose={() => setModal(null)} wide><QuoteForm key={modal.item.id} item={modal.item} db={db} user={user} onSave={saveQuote} onNewPayment={terms => { const p = { id: uid(), name: terms, terms }; commit(current => ({ ...current, payments: [...current.payments, p] }), 'Condição salva.'); return p.id }}/></Modal>}
  {modal?.type === 'quote-view' && <Modal title={`Pedido #${modal.item.number}`} onClose={() => setModal(null)} wide><QuoteDetail quote={db.quotes.find(q => q.id === modal.item.id) || modal.item} client={clientFor(modal.item)} settings={db.settings} onPdf={() => handlePdf(db.quotes.find(q => q.id === modal.item.id) || modal.item)} onEdit={() => setModal({ type: 'quote', item: db.quotes.find(q => q.id === modal.item.id) || modal.item })} onInvoice={invoice => updateQuote(modal.item.id, q => { const updated = { ...q, invoices: [...(q.invoices || []), invoice] }; updated.status = billingStatus(updated); return updated }, 'Faturamento registrado.')} onRemoveInvoice={id => updateQuote(modal.item.id, q => { const updated = { ...q, invoices: (q.invoices || []).filter(x => x.id !== id) }; updated.status = billingStatus(updated); return updated }, 'Faturamento excluído.')} onStatus={status => updateQuote(modal.item.id, q => invoiceTotal(q) > .009 ? q : { ...q, status }, 'Situação atualizada.')} /></Modal>}
  </div>
}

function Toolbar({ query, setQuery, add, label }) { return <div className="toolbar"><label className="search"><Search size={18}/><input placeholder="Buscar..." value={query} onChange={event => setQuery(event.target.value)}/></label><button className="primary" onClick={add}><Plus size={18}/>{label}</button></div> }
function QuoteList({ quotes, clientFor, onOpen }) { if (!quotes.length) return <Empty text="Nenhum orçamento cadastrado ainda."/>; return <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Total</th><th>Situação</th><th></th></tr></thead><tbody>{quotes.map(q => <tr key={q.id}><td><strong>#{q.number || '—'}</strong></td><td>{clientFor(q).tradeName || clientFor(q).name || 'Cliente removido'}</td><td>{displayDate(q.date)}</td><td>{money(totals(q).total)}</td><td><StatusBadge status={q.status}/></td><td><button className="small-btn" onClick={() => onOpen(q)}>Abrir</button></td></tr>)}</tbody></table></div> }
function EntityForm({ item, fields, onSave }) {
  const [form, setForm] = useState(item)
  return <form onSubmit={event => { event.preventDefault(); onSave(form) }}><div className="form-grid">{fields.map(([key, label, type, options]) =>
    <Field key={key} label={label} value={key === 'document' ? documentText(form[key], form.documentType) : form[key]}
      onChange={value => setForm({ ...form, [key]: key === 'document' ? documentText(value, form.documentType) : value })}
      inputMode={key === 'document' ? 'numeric' : undefined} type={type === 'number' ? 'number' : type || 'text'}
      step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0' : undefined}>
      {type === 'select' && <select value={form[key]} onChange={event => {
        const value = event.target.value
        setForm({ ...form, [key]: value, ...(key === 'documentType' && value !== form.documentType ? { document: '' } : {}) })
      }}>{options.map(x => <option key={x}>{x}</option>)}</select>}
    </Field>)}</div><div className="modal-actions"><button type="submit" className="primary"><Save size={17}/> Salvar</button></div></form>
}
function SettingsForm({ item, quotes, onSave }) {
  const [form, setForm] = useState({ ...item, lastOrderNumber: String(item.lastOrderNumber ?? 0).padStart(4, '0') })
  const [numberTouched, setNumberTouched] = useState(false)
  const preview = nextOrderNumber({ ...form, orderSequenceConfigured: numberTouched || item.orderSequenceConfigured }, quotes)
  function save(event) {
    event.preventDefault()
    const last = Number(form.lastOrderNumber)
    if (!/^\d+$/.test(String(form.lastOrderNumber)) || !Number.isSafeInteger(last)) return alert('Informe um número de pedido válido, sem letras ou símbolos.')
    onSave({ ...form, commissionRate: numeric(form.commissionRate), lastOrderNumber: last, orderSequenceConfigured: numberTouched || item.orderSequenceConfigured })
    setForm(current => ({ ...current, lastOrderNumber: String(last).padStart(4, '0') }))
  }
  return <form onSubmit={save}>
    <div className="form-grid">{[['company','Empresa'],['supplier','Fornecedor padrão'],['address','Endereço'],['city','Cidade / estado'],['zip','CEP'],['email','E-mail'],['phone','Telefone'],['commissionRate','Comissão padrão (%)']].map(([key,label]) => <Field key={key} label={label} value={form[key]} onChange={x => setForm({ ...form, [key]: x })} type={key === 'commissionRate' ? 'number' : 'text'} step="0.01" min="0"/>)}</div>
    <div className="section-label">Numeração dos pedidos</div>
    <div className="form-grid"><Field label="Último número utilizado" value={form.lastOrderNumber} onChange={x => { setForm({ ...form, lastOrderNumber: x }); setNumberTouched(true) }} inputMode="numeric" pattern="[0-9]*" required/><div className="number-preview"><small>Próximo orçamento</small><strong>{preview}</strong><span>Ex.: informe 0050 para gerar 0051. A contagem avança quando o orçamento é salvo.</span></div></div>
    <div className="modal-actions"><button className="primary"><Save size={17}/> Salvar configurações</button></div>
  </form>
}

function QuoteForm({ item, db, user, onSave, onNewPayment }) {
  const [form, setForm] = useState({ ...item, number: item.number || nextOrderNumber(db.settings, db.quotes) })
  const [productId, setProductId] = useState('')
  const [newTerms, setNewTerms] = useState('')
  const change = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const addProduct = () => { const p = db.products.find(x => x.id === productId); if (!p) return; setForm(current => ({ ...current, items: [...current.items, { id: uid(), productId: p.id, code: p.code || '', name: p.name, unit: p.unit, qty: 1, price: current.priceMode === 'cash' ? p.cash : p.term }] })); setProductId('') }
  const updateItem = (id, key, value) => setForm(current => ({ ...current, items: current.items.map(x => x.id === id ? { ...x, [key]: value } : x) }))
  const total = totals(form)
  return <form onSubmit={event => { event.preventDefault(); onSave({ ...form, discount: numeric(form.discount), items: form.items.map(x => ({ ...x, qty: numeric(x.qty), price: numeric(x.price) })) }) }}>
    <div className="section-label">Dados do pedido</div><div className="form-grid">
      <Field label="Número automático" value={form.number} onChange={() => {}} readOnly/>
      <Field label="Data" type="date" value={form.date} onChange={x => change('date', x)} required/>
      <SearchSelect label="Cliente" items={db.clients} value={form.clientId} onChange={id => change('clientId', id)} required optionLabel={c => `${c.tradeName || c.name}${c.document ? ' · ' + documentText(c.document, c.documentType) : ''}`}/>
      <Field label="Fornecedor" value={form.supplier} onChange={x => change('supplier', x)}/>
      <Field label="Contato" value={form.contact} onChange={x => change('contact', x)}/>
      <Field label="Telefone" value={form.phone} onChange={x => change('phone', x)}/>
      <Field label="Transporte" value={form.transport} onChange={x => change('transport', x)}/>
      <Field label="Local de entrega" value={form.delivery} onChange={x => change('delivery', x)}/>
    </div>
    <div className="section-label">Pagamento e preços</div><p className="help">Comissão padrão configurada: <strong>{Number(db.settings.commissionRate ?? 0).toLocaleString('pt-BR')}%</strong>. Você poderá ajustar essa taxa ao registrar cada faturamento.</p><div className="form-grid">
      <Field label="Condição cadastrada" value={form.paymentId} onChange={() => {}}><select value={form.paymentId} onChange={e => { const p = db.payments.find(x => x.id === e.target.value); setForm(current => ({ ...current, paymentId: e.target.value, paymentTerms: p?.terms || current.paymentTerms })) }}><option value="">Condição avulsa</option>{db.payments.map(p => <option value={p.id} key={p.id}>{p.name} · {p.terms}</option>)}</select></Field>
      <Field label="Prazos que aparecerão no PDF" value={form.paymentTerms} onChange={x => change('paymentTerms', x)} required/>
      <Field label="Tabela de preço" value={form.priceMode} onChange={() => {}}><select value={form.priceMode} onChange={e => change('priceMode', e.target.value)}><option value="term">A prazo</option><option value="cash">À vista</option></select></Field>
      <Field label="Desconto em R$" type="money" step="0.01" min="0" value={form.discount} onChange={x => change('discount', x)}/>
    </div><div className="inline-add"><input placeholder="Cadastrar esta condição para reutilizar" value={newTerms} onChange={e => setNewTerms(e.target.value)}/><button type="button" className="secondary" onClick={() => { if (!newTerms.trim()) return; const id = onNewPayment(newTerms.trim()); setForm(current => ({ ...current, paymentId: id, paymentTerms: newTerms.trim() })); setNewTerms('') }}>Guardar condição</button></div>
    <div className="section-label">Produtos</div><div className="inline-add"><SearchSelect label="Produto" items={db.products.filter(p => p.active !== false)} value={productId} onChange={setProductId} optionLabel={p => `${p.name}${p.code ? ' · ' + p.code : ''} · ${money(form.priceMode === 'cash' ? p.cash : p.term)}${p.review ? ' · revisar preço' : ''}`}/><button type="button" className="secondary" onClick={addProduct}><Plus size={16}/> Adicionar</button></div>
    <div className="table-wrap quote-items"><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Unid.</th><th>Preço unit.</th><th>Total</th><th></th></tr></thead><tbody>{form.items.map(x => <tr key={x.id}><td><input value={x.name} onChange={e => updateItem(x.id, 'name', e.target.value)}/></td><td><input className="narrow" type="number" step="0.01" min="0.01" value={x.qty} onChange={e => updateItem(x.id, 'qty', e.target.value)}/></td><td><input className="narrow" value={x.unit} onChange={e => updateItem(x.id, 'unit', e.target.value)}/></td><td><MoneyInput className="money-input" aria-label={`Preço unitário de ${x.name}`} value={x.price} onChange={value => updateItem(x.id, 'price', value)}/></td><td>{money(numeric(x.qty) * numeric(x.price))}</td><td><button type="button" className="icon-btn" onClick={() => setForm(current => ({ ...current, items: current.items.filter(i => i.id !== x.id) }))}><Trash2 size={16}/></button></td></tr>)}</tbody></table>{!form.items.length && <Empty text="Adicione os produtos do orçamento."/>}</div>
    <div className="quote-total"><span>Subtotal {money(total.subtotal)}</span><strong>Total {money(total.total)}</strong></div>
    <Field label="Observação no PDF" value={form.notes} onChange={x => change('notes', x)}/>
    <div className="modal-actions"><button className="primary" type="submit"><Save size={17}/> Salvar orçamento</button></div>
  </form>
}

function QuoteDetail({ quote, client, settings, onPdf, onEdit, onInvoice, onRemoveInvoice, onStatus }) {
  const [invoice, setInvoice] = useState({ date: today(), amount: '', rate: Number(settings.commissionRate ?? 0), reference: '', installmentIndex: '' })
  const total = totals(quote).total
  const billed = invoiceTotal(quote)
  const remaining = Math.max(0, total - billed)
  const suggested = installmentPlan(quote)
  const recordedFor = index => (quote.invoices || []).filter(x => Number(x.installmentIndex) === index && x.installmentIndex !== '' && x.installmentIndex != null).reduce((sum, x) => sum + Number(x.amount || 0), 0)
  const installmentLabel = index => index === '' ? 'Sem parcela' : `${suggested[Number(index)]?.day || 0} dias`
  function chooseInstallment(index) {
    const plan = suggested[index]
    if (!plan) return
    const pending = Math.max(0, plan.amount - recordedFor(index))
    setInvoice(current => ({ ...current, installmentIndex: String(index), amount: Math.min(pending || remaining, remaining).toFixed(2), reference: current.reference || `Parcela ${plan.day ? `${plan.day} dias` : 'à vista'}` }))
    document.getElementById('invoice-entry')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  function submit(event) {
    event.preventDefault()
    const amount = numeric(invoice.amount)
    if (amount <= 0 || amount > remaining + .01) return alert(`Informe valor entre R$ 0,01 e ${money(remaining)}.`)
    onInvoice({ id: uid(), date: invoice.date, amount, rate: numeric(invoice.rate), reference: invoice.reference.trim(), installmentIndex: invoice.installmentIndex })
    setInvoice({ ...invoice, amount: '', rate: Number(settings.commissionRate ?? 0), reference: '', installmentIndex: '' })
  }
  return <div><div className="detail-summary"><div><small>Cliente</small><strong>{client.tradeName || client.name}</strong><span>{client.document}</span></div><div><small>Total do pedido</small><strong>{money(total)}</strong><span>{quote.paymentTerms}</span></div><div><small>Faturado pela fábrica</small><strong>{money(billed)}</strong><span>Saldo {money(remaining)}</span></div><div><small>Comissão padrão</small><strong>{Number(settings.commissionRate ?? 0).toLocaleString('pt-BR')}%</strong><span>Editável em cada parcela</span></div></div><div className="button-row"><button className="primary" onClick={onPdf}><Share2 size={17}/> Compartilhar / baixar PDF</button><button className="secondary" onClick={onEdit}><Pencil size={17}/> Editar pedido</button><StatusBadge status={quote.status}/><select aria-label="Situação do pedido" value={quote.status} onChange={e => onStatus(e.target.value)} disabled={billed > .009}><option>Rascunho</option><option>Enviado</option><option>Aprovado</option><option disabled>Faturamento parcial</option><option disabled>Faturado</option><option>Cancelado</option></select></div><p className="help">A situação de faturamento muda automaticamente conforme você registra parcelas. Com faturamento lançado, a situação não pode ser alterada manualmente. Para WhatsApp ou e-mail, compartilhe o PDF ou anexe o arquivo baixado.</p>
    <div className="section-label">Itens</div><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>{quote.items.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.qty} {x.unit}</td><td>{money(x.price)}</td><td>{money(Number(x.qty) * Number(x.price))}</td></tr>)}</tbody></table></div>
    <div className="section-label">Parcelas previstas · selecione a parcela faturada</div><div className="schedule">{suggested.map(x => { const recorded = recordedFor(x.index); const pending = Math.max(0, x.amount - recorded); return <div key={x.index} className={pending < .01 ? 'installment-done' : ''}><strong>{x.day ? `${x.day} dias` : 'À vista'}</strong><span>Previsão {displayDate(x.date)}</span><span>Previsto {money(x.amount)}</span><span>Registrado {money(recorded)}</span>{remaining > .009 && quote.status !== 'Cancelado' && <button type="button" className="small-btn" onClick={() => chooseInstallment(x.index)}>{pending < .01 ? 'Lançar ajuste' : 'Registrar esta parcela'}</button>}</div> })}</div>
    <div className="section-label">Faturamentos confirmados pela fábrica</div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Parcela</th><th>Referência</th><th>Valor faturado</th><th>Comissão</th><th></th></tr></thead><tbody>{(quote.invoices || []).map(x => <tr key={x.id}><td>{displayDate(x.date)}</td><td>{installmentLabel(x.installmentIndex)}</td><td>{x.reference || '—'}</td><td>{money(x.amount)}</td><td>{money(Number(x.amount) * Number(x.rate || 0) / 100)} ({x.rate || 0}%)</td><td><button className="icon-btn" onClick={() => { if (confirm('Excluir este registro de faturamento?')) onRemoveInvoice(x.id) }}><Trash2 size={16}/></button></td></tr>)}</tbody></table>{!quote.invoices?.length && <Empty text="Nenhum faturamento registrado. A comissão ainda é zero."/>}</div>
    {remaining > .009 && quote.status !== 'Cancelado' && <form id="invoice-entry" className="invoice-form" onSubmit={submit}><h3>Registrar faturamento recebido da fábrica</h3><p className="help">Clique em uma parcela acima para preencher o valor previsto; ajuste para o valor real da nota. Registre cada data separadamente.</p><div className="form-grid"><Field label="Parcela" value={invoice.installmentIndex} onChange={() => {}}><select value={invoice.installmentIndex} onChange={e => setInvoice({ ...invoice, installmentIndex: e.target.value })}><option value="">Sem parcela específica</option>{suggested.map(x => <option key={x.index} value={x.index}>{x.day ? `${x.day} dias` : 'À vista'} · {displayDate(x.date)}</option>)}</select></Field><Field label="Data faturada" type="date" value={invoice.date} onChange={x => setInvoice({ ...invoice, date: x })} required/><Field label="Valor faturado (R$)" type="money" step="0.01" min="0.01" max={remaining.toFixed(2)} value={invoice.amount} onChange={x => setInvoice({ ...invoice, amount: x })} required/><Field label="Comissão (%)" type="number" step="0.01" min="0" value={invoice.rate} onChange={x => setInvoice({ ...invoice, rate: x })}/><Field label="Nota fiscal / referência" value={invoice.reference} onChange={x => setInvoice({ ...invoice, reference: x })}/></div><button className="primary"><Check size={17}/> Confirmar faturamento</button></form>}
  </div>
}

function FinancePanel({ quotes, clientFor, onOpen, quotesTotal, billedTotal, commissionTotal }) {
  const active = quotes.filter(q => q.status !== 'Cancelado').slice().reverse()
  const history = active.flatMap(q => (q.invoices || []).map(invoice => ({ quote: q, invoice }))).sort((a, b) => b.invoice.date.localeCompare(a.invoice.date))
  return <>
    <div className="stats"><div><small>Total orçado</small><strong>{money(quotesTotal)}</strong></div><div><small>Faturado</small><strong>{money(billedTotal)}</strong></div><div><small>A faturar</small><strong>{money(Math.max(0, quotesTotal - billedTotal))}</strong></div><div><small>Comissão sobre faturado</small><strong>{money(commissionTotal)}</strong></div></div>
    <section className="panel"><div className="panel-head"><h2>Pedidos e saldos</h2><small>Abra o pedido para registrar o faturamento de 30, 60 ou 90 dias.</small></div><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Condição</th><th>Faturado / total</th><th>Comissão</th><th>Situação</th><th></th></tr></thead><tbody>{active.map(q => <tr key={q.id}><td><strong>#{q.number}</strong><small>{displayDate(q.date)}</small></td><td>{clientFor(q).tradeName || clientFor(q).name}</td><td>{q.paymentTerms}</td><td>{money(invoiceTotal(q))} / {money(totals(q).total)}</td><td>{money(quoteCommission(q))}</td><td><StatusBadge status={q.status}/></td><td><button className="small-btn" onClick={() => onOpen(q)}>Abrir</button></td></tr>)}</tbody></table>{!active.length && <Empty text="Nenhum pedido para acompanhar."/>}</div></section>
    <section className="panel"><div className="panel-head"><h2>Histórico de faturamentos</h2><small>Cada registro é uma nota ou parcela confirmada manualmente.</small></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Pedido</th><th>Parcela</th><th>Referência</th><th>Valor</th><th>Comissão</th></tr></thead><tbody>{history.map(({ quote, invoice }) => { const day = invoice.installmentIndex === '' || invoice.installmentIndex == null ? null : installmentPlan(quote)[Number(invoice.installmentIndex)]?.day; return <tr key={invoice.id}><td>{displayDate(invoice.date)}</td><td>#{quote.number}</td><td>{day ? `${day} dias` : 'Avulso'}</td><td>{invoice.reference || '—'}</td><td>{money(invoice.amount)}</td><td>{money(Number(invoice.amount) * Number(invoice.rate || 0) / 100)}</td></tr> })}</tbody></table>{!history.length && <Empty text="Nenhum faturamento lançado ainda."/>}</div></section>
  </>
}
