import test from 'node:test'
import assert from 'node:assert/strict'
import { alphabetical, currencyText, currencyValue, documentText, phoneText, matchesSearch } from '../src/input-format.js'
import { totals } from '../src/data.js'

test('moeda formata reais, mantém centavos e limpa o campo', () => {
  assert.equal(currencyText(1234.56).replace(/\s/g, ' '), 'R$ 1.234,56')
  assert.equal(currencyValue('R$ 1.234,56'), 1234.56)
  assert.equal(currencyValue('837'), 8.37)
  assert.equal(currencyText('70.20').replace(/\s/g, ' '), 'R$ 70,20')
  assert.equal(currencyText(0).replace(/\s/g, ' '), 'R$ 0,00')
  assert.equal(currencyValue(''), '')
  assert.equal(currencyText(''), '')
  for (const value of [0.01, 5.07, 8.37, 70.2, 999999.99]) assert.equal(currencyValue(currencyText(value)), value)
})

test('máscara mantém valores numéricos usados no total do orçamento', () => {
  const total = totals({ items: [{ qty: 2, price: currencyValue('R$ 1.234,56') }], discount: currencyValue('R$ 10,00') })
  assert.equal(total.total, 2459.12)
})

test('documentos aceitam digitação parcial, colagem e respeitam tamanho por tipo', () => {
  assert.equal(documentText('12345678901', 'CPF'), '123.456.789-01')
  assert.equal(documentText('12345678000190', 'CNPJ'), '12.345.678/0001-90')
  assert.equal(documentText('12.345.678/0001-90', 'CNPJ'), '12.345.678/0001-90')
  assert.equal(documentText('1234', 'CPF'), '123.4')
  assert.equal(documentText('123456789012345', 'CPF'), '123.456.789-01')
  assert.equal(documentText('', 'CPF'), '')
})

test('telefones fixos, celulares, DDD e código brasileiro', () => {
  assert.equal(phoneText('9832123456'), '(98) 3212-3456')
  assert.equal(phoneText('98912345678'), '(98) 91234-5678')
  assert.equal(phoneText('+55 (98) 91234-5678'), '+55 (98) 91234-5678')
  assert.equal(phoneText('55912345678'), '(55) 91234-5678')
  assert.equal(phoneText('98'), '(98')
  assert.equal(phoneText(''), '')
})

test('ordem alfabética considera nome exibido e não altera coleção original', () => {
  const rows = [{ name: 'Zinco' }, { name: 'Água' }, { name: 'Fábrica', tradeName: 'Bela' }]
  assert.deepEqual([...rows].sort(alphabetical).map(x => x.tradeName || x.name), ['Água', 'Bela', 'Zinco'])
  assert.equal(rows[0].name, 'Zinco')
})

test('busca por nomes, acentos, código e documento com ou sem pontuação', () => {
  const client = { name: 'Comércio São José', tradeName: 'Loja Bela', document: '12.345.678/0001-90' }
  assert.equal(matchesSearch(client, 'sao jose'), true)
  assert.equal(matchesSearch(client, 'bela'), true)
  assert.equal(matchesSearch(client, '12345678000190'), true)
  assert.equal(matchesSearch(client, '12.345.678/0001-90'), true)
  assert.equal(matchesSearch({ name: 'Argamassa', code: 'AC2' }, 'ac2'), true)
  assert.equal(matchesSearch(client, 'inexistente'), false)
})
