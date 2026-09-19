export const money = value => (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const decimal = value => Number(String(value ?? '').replace(/\./g, '').replace(',', '.')) || 0
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
export const today = () => new Date().toISOString().slice(0, 10)

// Valores enviados pelo usuário prevalecem sobre a tabela PDF de abril/2026.
// A lista atualizada não separa preço à vista e a prazo: ambos começam iguais e podem ser editados.
export const updatedProducts = [
  ['AC1', 8.37, 'SACO'], ['AC2', 11.34, 'SACO'], ['AC3', 17.90, 'SACO'],
  ['REJUNTE MASTER BRANCO', 5.07, 'KG'], ['REJUNTE AZUL PISCINA', 5.77, 'KG'],
  ['GESSO PRONTO', 1.94, 'KG'], ['CIMENTO BRANCO', 4.32, 'KG'],
  ['SELADOR', 70.20, 'BALDE'], ['TINTA ACRÍLICA', 69.19, 'BALDE'],
  ['MASSA CORRIDA 25 KG', 31.50, 'BALDE'], ['KALCLEAN MAX', 7.50, 'UN']
].map(([name, price, unit]) => ({ id: uid(), name, unit, cash: price, term: price, active: true, review: false }))

// Itens adicionais do PDF: preços são históricos e ficam sinalizados para revisão.
export const catalogProducts = [
  ['000182', 'ARGAMASSA INTERNA PLUS 15KG', 'SACO', 7.75, 7.99],
  ['012178', 'ARGAMASSA EXTERNA PAREDES E PISOS 15KG', 'SACO', 11.16, 11.50],
  ['000979', 'ARGAMASSA PORCELANATO INTERNA 15KG', 'SACO', 13.48, 13.90],
  ['012106', 'ARGAMASSA PORCELANATO EXTERNO E INTERNO 15KG', 'SACO', 15.04, 15.50],
  ['000980', 'ARGAMASSA SOBREPOR PISO 15KG', 'SACO', 16.39, 16.90],
  ['012108', 'ARGAMASSA MASTER SUPER TOP 15KG', 'SACO', 16.39, 16.90],
  ['012172', 'ARGAMASSA FACHADA 15KG', 'SACO', 17.36, 17.90],
  ['001082', 'ARGAMASSA PISCINA 15KG', 'SACO', 17.36, 17.90],
  ['000217', 'ARGAMASSA GOLD 15KG', 'SACO', 21.24, 21.90],
  ['000218', 'ARGAMASSA GOLD BRANCA 15KG', 'SACO', 34.82, 35.90],
  ['000978', 'ARGAMASSA MASTER GRAUTE 20KG', 'SACO', 33.95, 35],
  ['008132', 'ARGAMASSA MULTIUSO 20KG', 'SACO', 12.13, 12.50],
  ['', 'REJUNTE SILICONADO EXTERNO', 'KG', 3.10, 3.20],
  ['', 'REJUNTE SILICONADO MASTER', 'KG', 4.56, 4.70],
  ['', 'ARGAMASSA PASTILHA / BLOCO DE VIDRO', 'KG', 7.30, 8],
  ['', 'REJUNTE CORES ESPECIAIS', 'KG', 9.60, 9.90],
  ['', 'REJUNTE EPÓXI KIT 3KG', 'KIT', 174, 180],
  ['', 'KALTOP PLUS 18KG', 'BALDE', 63, 65]
].map(([code, name, unit, cash, term]) => ({ id: uid(), code, name, unit, cash, term, active: true, review: true }))

export const initialPayments = [
  { id: uid(), name: 'À vista', terms: 'À vista' },
  { id: uid(), name: '30 dias', terms: '30/DD' },
  { id: uid(), name: '30/60 dias', terms: '30/60/DD' },
  { id: uid(), name: '30/60/90 dias', terms: '30/60/90/DD' }
]

export const defaultSettings = {
  company: 'JUREL – Juvêncio Representações Ltda.',
  address: 'Av. Rodrigo Otávio, 330 - Trezidela',
  city: 'Caxias - Maranhão', zip: '65.607-365',
  email: 'jurelllda@outlook.com', phone: '(99) 98117-0013',
  supplier: 'Grupo Kalfix', commissionRate: 0,
  lastOrderNumber: 0, orderSequenceConfigured: false
}

export const emptyQuote = () => ({ id: uid(), number: '', date: today(), clientId: '', supplier: 'Grupo Kalfix', contact: '', phone: '', transport: 'Cif', delivery: 'O mesmo acima', paymentId: '', paymentTerms: '30/60/90/DD', priceMode: 'term', discount: 0, items: [], notes: 'Sujeito a confirmação, a entrega das mercadorias fica sob responsabilidade do fornecedor.', status: 'Rascunho', invoices: [] })

export function nextOrderNumber(settings, quotes) {
  const used = new Set(quotes.map(quote => Number(quote.number)).filter(Number.isSafeInteger))
  const last = settings.orderSequenceConfigured
    ? Number(settings.lastOrderNumber) || 0
    : Math.max(Number(settings.lastOrderNumber) || 0, ...used, 0)
  let next = Math.max(0, Math.floor(last)) + 1
  while (used.has(next)) next++
  return String(next).padStart(4, '0')
}

export function totals(quote) {
  const subtotal = (quote.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0)
  const discount = Math.max(0, Number(quote.discount) || 0)
  return { subtotal, discount, total: Math.max(0, subtotal - discount) }
}

export function installments(terms) {
  const days = String(terms || '').match(/\d+/g)?.map(Number).filter(n => n > 0) || []
  return days.length ? days : [0]
}

export function dueDate(date, days) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function installmentPlan(quote) {
  const days = installments(quote.paymentTerms)
  const totalCents = Math.round(totals(quote).total * 100)
  const baseCents = Math.floor(totalCents / days.length)
  return days.map((day, index) => ({
    index, day, date: dueDate(quote.date, day),
    amount: (index === days.length - 1 ? totalCents - baseCents * index : baseCents) / 100
  }))
}

export function displayDate(value) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}/${m}/${y}`
}

export const invoiceTotal = quote => (quote.invoices || []).reduce((sum, invoice) => sum + (Number(invoice.amount) || 0), 0)
export const commissionTotal = quote => (quote.invoices || []).reduce((sum, invoice) => sum + (Number(invoice.amount) || 0) * (Number(invoice.rate) || 0) / 100, 0)
export const billingStatus = quote => {
  const billed = invoiceTotal(quote)
  if (billed <= .009) return quote.status === 'Cancelado' ? 'Cancelado' : 'Enviado'
  return billed >= totals(quote).total - .01 ? 'Faturado' : 'Faturamento parcial'
}
