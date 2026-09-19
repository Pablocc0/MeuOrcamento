import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanBackup, emptyState } from '../src/neon.js'
import { billingStatus, commissionTotal, dueDate, installmentPlan, installments, nextOrderNumber, totals, updatedProducts } from '../src/data.js'

test('backup antigo é aceito sem levar hashes de senha ao Neon', () => {
  const backup = { users: [{ id: 'u1', name: 'Pablo', email: 'p@example.com', role: 'Administrador', passwordHash: 'segredo' }], clients: [{ id: 'c1', name: 'Cliente' }], products: [], payments: [], quotes: [], settings: { lastOrderNumber: 50 } }
  const migrated = cleanBackup(backup)
  assert.deepEqual(migrated.users, [{ id: 'u1', name: 'Pablo', email: 'p@example.com', role: 'Administrador' }])
  assert.equal(migrated.settings.lastOrderNumber, 50)
  assert.deepEqual(emptyState().clients, [])
})

test('preços atualizados têm prioridade no catálogo inicial', () => {
  assert.equal(updatedProducts.find(p => p.name === 'AC2').term, 11.34)
  assert.equal(updatedProducts.find(p => p.name === 'GESSO PRONTO').cash, 1.94)
})

test('total do exemplo 1290 e parcelamento', () => {
  const quote = { items: [
    { qty: 200, price: 11.34 }, { qty: 200, price: 17.90 },
    { qty: 40, price: 5.07 }, { qty: 20, price: 5.77 }, { qty: 200, price: 1.94 }
  ], discount: 0 }
  assert.ok(Math.abs(totals(quote).total - 6554.20) < .001)
  assert.deepEqual(installments('30/60/90/DD'), [30, 60, 90])
  assert.equal(dueDate('2026-09-18', 30), '2026-10-18')
})

test('parcelas de 30/60/90 e situação de faturamento', () => {
  const quote = { date: '2026-09-18', paymentTerms: '30/60/90/DD', items: [{ qty: 1, price: 100 }], discount: 0, status: 'Enviado', invoices: [] }
  const plan = installmentPlan(quote)
  assert.deepEqual(plan.map(x => x.date), ['2026-10-18', '2026-11-17', '2026-12-17'])
  assert.equal(plan.reduce((sum, x) => sum + Math.round(x.amount * 100), 0), 10000)
  quote.invoices.push({ amount: 33.33, rate: 5, installmentIndex: '0' })
  assert.equal(billingStatus(quote), 'Faturamento parcial')
  quote.invoices.push({ amount: 33.33, rate: 5, installmentIndex: '1' })
  assert.equal(billingStatus(quote), 'Faturamento parcial')
  quote.invoices.push({ amount: 33.34, rate: 5, installmentIndex: '2' })
  assert.equal(billingStatus(quote), 'Faturado')
})

test('numeração configurável preserva quatro dígitos e evita repetição', () => {
  const existing = [{ number: '1000' }]
  assert.equal(nextOrderNumber({ lastOrderNumber: 0, orderSequenceConfigured: false }, existing), '1001')
  assert.equal(nextOrderNumber({ lastOrderNumber: 50, orderSequenceConfigured: true }, existing), '0051')
  assert.equal(nextOrderNumber({ lastOrderNumber: 50, orderSequenceConfigured: true }, [...existing, { number: '0051' }]), '0052')
})

test('comissão considera a taxa usada em cada faturamento', () => {
  assert.equal(commissionTotal({ invoices: [{ amount: 100, rate: 5 }, { amount: 200, rate: 7 }] }), 19)
})
