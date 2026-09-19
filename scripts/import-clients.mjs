import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const source = process.argv[2]
if (!source) throw new Error('Uso: node scripts/import-clients.mjs arquivo.docx')
const text = execFileSync('textutil', ['-convert', 'txt', '-stdout', source], { encoding: 'utf8' })
const blocks = text.split(/Fornecedor:\s*Grupo Kalfix/i)
const line = (block, label) => block.split('\n').find(row => new RegExp(`^\\s*${label}\\s*:`, 'i').test(row))?.replace(new RegExp(`^\\s*${label}\\s*:\\s*`, 'i'), '') || ''
const before = (value, labels = []) => value.split(new RegExp(labels.length ? `\\s{3,}|(?=${labels.join('|')})` : '\\s{3,}', 'i'))[0].trim()
const clients = blocks.map(block => {
  const name = line(block, 'Razão Social').trim()
  const tradeName = line(block, 'Nome Fantasia').trim()
  const document = (block.match(/(?:CNPJ\(MF\)|CNPJ|CPF)\s*:\s*([\d.\/\- ]{11,25})/)?.[1] || '').trim()
  const district = (block.match(/Bairro:\s*([^\n]*?)(?=\s{3,}|CNPJ|$)/im)?.[1] || '').trim()
  const stateRegistration = (block.match(/INSC\.?\s*EST\.?\s*:\s*([^\s]+)/i)?.[1] || '').trim()
  return {
    id: randomUUID(), name, tradeName,
    documentType: document.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ', document,
    address: before(line(block, 'Endereço'), ['Bairro:']), district,
    city: before(line(block, 'Cidade'), ['Estado:', 'Bairro:']),
    state: block.match(/Estado:\s*([A-Z]{2})/i)?.[1] || '',
    stateRegistration, phone: before(line(block, 'Telefone')),
    contact: before(line(block, 'Contato'), ['Telefone:']).replace(/^Telefone:.*$/i, ''), email: '', notes: '', active: true
  }
}).filter(client => client.name || client.tradeName)

writeFileSync(new URL('../src/clients-seed.json', import.meta.url), JSON.stringify(clients, null, 2))
console.log(`Importados ${clients.length} clientes com nome.`)
