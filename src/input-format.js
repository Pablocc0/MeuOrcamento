export const onlyDigits = value => String(value ?? '').replace(/\D/g, '')
export function currencyValue(text) {
  const digits = onlyDigits(text).slice(0, 14)
  return digits ? Number(digits) / 100 : ''
}
export function currencyText(value) {
  if (value === '' || value == null) return ''
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''
}
function mask(value, pattern) {
  const digits = onlyDigits(value)
  let result = '', index = 0
  for (const char of pattern) {
    if (index >= digits.length) break
    result += char === '#' ? digits[index++] : char
  }
  return result
}
export const documentText = (value, type = 'CNPJ') => mask(value, type === 'CPF' ? '###.###.###-##' : '##.###.###/####-##')
export function phoneText(value) {
  let digits = onlyDigits(value)
  const international = digits.startsWith('55') && digits.length > 11
  if (international) digits = digits.slice(2)
  return (international ? '+55 ' : '') + mask(digits, digits.length > 10 ? '(##) #####-####' : '(##) ####-####')
}
export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
export const alphabetical = (a, b) => String(a.tradeName || a.name || '').localeCompare(String(b.tradeName || b.name || ''), 'pt-BR', { sensitivity: 'base', numeric: true })
export function matchesSearch(item, query) {
  const text = normalizeSearch([item.name, item.tradeName, item.code, item.document].filter(Boolean).join(' '))
  return normalizeSearch(query).trim().split(/\s+/).every(part => text.includes(part) || (onlyDigits(part).length > 0 && onlyDigits(part) === part && onlyDigits(item.document).includes(part)))
}
