import { jsPDF } from 'jspdf'
import { displayDate, money, totals } from './data.js'
import logoData from './jurel-logo.png?inline'

const blue = [31, 78, 118]
const lightBlue = [216, 232, 249]
const orange = [209, 91, 22]
const text = (doc, value, x, y, opts = {}) => doc.text(String(value ?? ''), x, y, opts)

export function makeQuotePdf(quote, client, settings, user) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const { subtotal, discount, total } = totals(quote)
  const rows = quote.items || []
  const perPage = 15
  const pages = Math.max(1, Math.ceil(rows.length / perPage))

  for (let page = 0; page < pages; page++) {
    if (page) doc.addPage()
    doc.setFillColor(255, 255, 255).rect(0, 0, 210, 297, 'F')
    doc.addImage(logoData, 'PNG', 17, 7, 74, 22)
    doc.setTextColor(...blue).setFontSize(9)
    text(doc, settings.address, 194, 17, { align: 'right' })
    text(doc, `email: ${settings.email}  CEP ${settings.zip}`, 194, 22, { align: 'right' })
    doc.setTextColor(197, 34, 45)
    text(doc, `${settings.phone} / ${settings.city}`, 194, 27, { align: 'right' })
    doc.setDrawColor(0).setLineWidth(.2).rect(168, 35, 26, 14)
    doc.setTextColor(...orange).setFontSize(11).text('PEDIDO', 181, 41, { align: 'center' })
    doc.setFontSize(10).text(String(quote.number || '—'), 181, 46, { align: 'center' })
    doc.setFontSize(9).setTextColor(...blue)
    const start = 56
    const detailRows = [
      [`Fornecedor: ${quote.supplier || settings.supplier}`, ''],
      [`Contato: ${quote.contact || client.contact || ''}`, `Telefone: ${quote.phone || client.phone || ''}`],
      [`Nome Fantasia: ${client.tradeName || ''}`, ''],
      [`Razão Social: ${client.name || ''}`, ''],
      [`Endereço: ${client.address || ''}`, `Bairro: ${client.district || ''}`],
      [`Cidade: ${client.city || ''}`, `Estado: ${client.state || ''}`],
      [`${client.documentType || 'CNPJ/CPF'}: ${client.document || ''}`, `INSC. EST.: ${client.stateRegistration || ''}`],
      [`Transporte: ${quote.transport || ''}`, `Local de Entrega: ${quote.delivery || ''}`],
      [`Condições de Pagamento: ${quote.paymentTerms || ''}`, `Desconto: ${discount ? money(discount) : ''}`]
    ]
    detailRows.forEach(([left, right], index) => {
      const y = start + index * 4.8
      if (index % 2) doc.setFillColor(...lightBlue).rect(27, y - 3.5, 167, 4.6, 'F')
      doc.setFont('helvetica', 'bold')
      text(doc, doc.splitTextToSize(left, right ? 100 : 163)[0], 29, y)
      if (right) text(doc, doc.splitTextToSize(right, 63)[0], 192, y, { align: 'right' })
    })
    doc.setTextColor(...blue).setFontSize(9).setFont('helvetica', 'bold')
    text(doc, 'QUANT.', 28, 107)
    text(doc, 'UNID.', 45, 107)
    text(doc, 'DESCRIÇÃO', 74, 107)
    text(doc, 'UNIT', 150, 107)
    text(doc, 'TOTAL', 175, 107)
    doc.setDrawColor(141, 181, 217).line(27, 108.2, 194, 108.2)
    rows.slice(page * perPage, (page + 1) * perPage).forEach((item, index) => {
      const y = 113 + index * 8.2
      if (index % 2 === 0) doc.setFillColor(...lightBlue).rect(27, y - 3.7, 167, 6.1, 'F')
      doc.setTextColor(20, 29, 38).setFontSize(9)
      text(doc, Number(item.qty).toLocaleString('pt-BR'), 28, y)
      text(doc, item.unit || '', 46, y)
      text(doc, doc.splitTextToSize(item.name || '', 72)[0], 74, y)
      text(doc, money(item.price).replace('R$ ', '').replace('R$ ', ''), 159, y, { align: 'right' })
      text(doc, money(Number(item.qty) * Number(item.price)).replace('R$ ', '').replace('R$ ', ''), 191, y, { align: 'right' })
    })
    const footer = 251
    doc.setTextColor(...blue).setFontSize(8)
    text(doc, `Condições de pagamento: ${quote.paymentTerms || ''}`, 29, footer - 4)
    doc.setDrawColor(...orange).line(27, footer, 199, footer)
    doc.setTextColor(...orange).setFontSize(7.5)
    text(doc, doc.splitTextToSize(quote.notes || '', 170)[0], 29, footer + 4)
    doc.setFillColor(255, 222, 197).rect(27, footer + 6, 172, 5, 'F')
    doc.setFillColor(255, 222, 197).rect(27, footer + 16, 172, 5, 'F')
    doc.setFontSize(8).setFont('helvetica', 'bold')
    text(doc, `DATA: ${displayDate(quote.date)}`, 29, footer + 10)
    text(doc, 'ASSINATURA DO CLIENTE:', 29, footer + 15)
    text(doc, `ASSINATURA DO REPRESENTANTE: ${user?.name || settings.company}`, 29, footer + 20)
    doc.setTextColor(...blue)
    text(doc, `SUB-TOTAL  ${money(subtotal)}`, 196, footer + 10, { align: 'right' })
    text(doc, `DESCONTO  ${money(discount)}`, 196, footer + 15, { align: 'right' })
    text(doc, `TOTAL  ${money(total)}`, 196, footer + 20, { align: 'right' })
    doc.setDrawColor(...orange).line(27, footer + 21, 199, footer + 21)
    if (pages > 1) { doc.setFontSize(7).text(`${page + 1}/${pages}`, 195, 288, { align: 'right' }) }
    doc.setFillColor(...orange).rect(0, 294, 140, 3, 'F')
    doc.setFillColor(...blue).rect(140, 294, 70, 3, 'F')
  }
  return doc
}

export async function sharePdf(doc, filename) {
  const blob = doc.output('blob')
  const file = new File([blob], filename, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared' }
    catch (error) { if (error.name === 'AbortError') return 'cancelled' }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return 'downloaded'
}
