import { useId, useState } from 'react'
import { alphabetical, currencyText, currencyValue, matchesSearch } from './input-format.js'
import './form-inputs.css'

export function MoneyInput({ value, onChange, min, max, step, ...props }) {
  return <input {...props} type="text" inputMode="numeric" value={currencyText(value)}
    placeholder="R$ 0,00" onFocus={e => e.target.select()}
    onChange={e => onChange(currencyValue(e.target.value))}/>
}

export function SearchSelect({ label, items, value, onChange, optionLabel, required = false }) {
  const [query, setQuery] = useState('')
  const id = useId()
  const sorted = [...items].sort(alphabetical)
  const results = sorted.filter(item => matchesSearch(item, query))
  const selected = items.find(item => item.id === value)
  return <div className="search-select">
    <label className="field" htmlFor={`${id}-search`}><span>Buscar {label.toLocaleLowerCase('pt-BR')}</span>
      <input id={`${id}-search`} type="search" value={query} autoComplete="off" placeholder={label === 'Cliente' ? 'Nome, razão social ou CPF/CNPJ' : 'Nome ou código do produto'} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}/></label>
    <label className="field" htmlFor={`${id}-select`}><span>{label}{required ? ' *' : ''}</span>
      <select id={`${id}-select`} required={required} value={value} onChange={e => { onChange(e.target.value); setQuery('') }}>
        <option value="">Selecione...</option>
        {selected && !results.some(item => item.id === value) && <option value={value}>{optionLabel(selected)} (selecionado)</option>}
        {results.map(item => <option key={item.id} value={item.id}>{optionLabel(item)}</option>)}
      </select></label>
    {query && <small role="status">{results.length ? `${results.length} resultado(s)` : 'Nenhum resultado encontrado.'}</small>}
  </div>
}
