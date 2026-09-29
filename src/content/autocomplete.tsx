import { useEffect, useMemo, useState } from 'react'

const SPACING = [
  '0',
  '0.5',
  '1',
  '1.5',
  '2',
  '2.5',
  '3',
  '3.5',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '14',
  '16',
  '20',
  '24',
  '28',
  '32',
  '36',
  '40',
  '44',
  '48',
  '52',
  '56',
  '60',
  '64',
  '72',
  '80',
  '96',
  'px'
]

const COLORS = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose'
]

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

const TEXT_SIZES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl']

const ROUNDED = ['none', 'sm', '', 'md', 'lg', 'xl', '2xl', '3xl', 'full']

const STATIC_CLASSES = [
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'hidden',
  'relative',
  'absolute',
  'fixed',
  'sticky',
  'inset-0',
  'inset-x-0',
  'inset-y-0',
  'top-0',
  'right-0',
  'bottom-0',
  'left-0',
  'z-0',
  'z-10',
  'z-20',
  'z-30',
  'z-40',
  'z-50',
  'w-full',
  'h-full',
  'min-w-0',
  'min-h-0',
  'max-w-sm',
  'max-w-md',
  'max-w-lg',
  'max-w-xl',
  'max-w-2xl',
  'max-w-3xl',
  'max-w-4xl',
  'max-w-5xl',
  'max-w-6xl',
  'max-w-7xl',
  'max-w-full',
  'items-start',
  'items-center',
  'items-end',
  'items-stretch',
  'justify-start',
  'justify-center',
  'justify-end',
  'justify-between',
  'justify-around',
  'justify-evenly',
  'content-start',
  'content-center',
  'content-end',
  'content-between',
  'self-start',
  'self-center',
  'self-end',
  'self-stretch',
  'flex-row',
  'flex-col',
  'flex-wrap',
  'flex-nowrap',
  'flex-1',
  'flex-none',
  'grow',
  'shrink',
  'gap-0',
  'gap-2',
  'gap-4',
  'space-x-2',
  'space-y-2',
  'overflow-hidden',
  'overflow-auto',
  'overflow-x-auto',
  'overflow-y-auto',
  'truncate',
  'whitespace-nowrap',
  'break-words',
  'rounded',
  'rounded-md',
  'rounded-lg',
  'rounded-xl',
  'rounded-full',
  'border',
  'border-0',
  'border-2',
  'border-b',
  'border-t',
  'border-l',
  'border-r',
  'shadow',
  'shadow-sm',
  'shadow-md',
  'shadow-lg',
  'shadow-xl',
  'shadow-2xl',
  'ring-1',
  'ring-2',
  'ring-inset',
  'ring-offset-2',
  'text-left',
  'text-center',
  'text-right',
  'font-thin',
  'font-light',
  'font-normal',
  'font-medium',
  'font-semibold',
  'font-bold',
  'uppercase',
  'lowercase',
  'capitalize',
  'tracking-tight',
  'tracking-normal',
  'tracking-wide',
  'leading-none',
  'leading-tight',
  'leading-snug',
  'leading-normal',
  'leading-relaxed',
  'select-none',
  'cursor-pointer',
  'cursor-default',
  'pointer-events-none',
  'opacity-0',
  'opacity-50',
  'opacity-75',
  'opacity-100'
]

function uniqKeepOrder(items: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of items) {
    if (!it) continue
    if (seen.has(it)) continue
    seen.add(it)
    out.push(it)
  }
  return out
}

function startsWithOrIncludes(hay: string, needle: string) {
  if (!needle) return false
  if (hay.startsWith(needle)) return true
  return hay.includes(needle)
}

function genColor(prefix: string) {
  const out: string[] = []
  for (const c of COLORS) {
    for (const s of SHADES) {
      out.push(`${prefix}${c}-${s}`)
    }
  }
  return out
}

function genScale(prefix: string) {
  return SPACING.map(v => `${prefix}${v}`)
}

export function buildSuggestions(input: string) {
  const q = input.trim()
  if (!q) {
    return STATIC_CLASSES.slice(0, 12)
  }

  const extra: string[] = []

  const scalePrefixes = ['p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-', 'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-', 'gap-', 'space-x-', 'space-y-', 'w-', 'h-', 'min-w-', 'min-h-', 'max-w-', 'max-h-']
  const matchedScale = scalePrefixes.find(p => q.startsWith(p))
  if (matchedScale) extra.push(...genScale(matchedScale))

  if (q.startsWith('rounded')) {
    for (const r of ROUNDED) {
      extra.push(r === '' ? 'rounded' : `rounded-${r}`)
    }
  }

  if (q.startsWith('text-')) {
    extra.push(...TEXT_SIZES.map(s => `text-${s}`))
    extra.push(...genColor('text-'))
  }

  if (q.startsWith('bg-')) extra.push(...genColor('bg-'))
  if (q.startsWith('border-')) extra.push(...genColor('border-'))
  if (q.startsWith('ring-')) extra.push(...genColor('ring-'))
  if (q.startsWith('from-')) extra.push(...genColor('from-'))
  if (q.startsWith('via-')) extra.push(...genColor('via-'))
  if (q.startsWith('to-')) extra.push(...genColor('to-'))

  const candidates = uniqKeepOrder([...extra, ...STATIC_CLASSES])
  const starts: string[] = []
  const includes: string[] = []
  for (const c of candidates) {
    if (!startsWithOrIncludes(c, q)) continue
    if (c.startsWith(q)) starts.push(c)
    else includes.push(c)
  }

  const results = uniqKeepOrder([...starts, ...includes]).slice(0, 12)
  return results.length ? results : STATIC_CLASSES.filter(c => c.startsWith(q)).slice(0, 12)
}

export type AutocompleteInputProps = {
  value: string
  onChange: (v: string) => void
  onSubmit: (v?: string) => void
  onBlur?: () => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
}

export function AutocompleteInput(props: AutocompleteInputProps) {
  const { value, onChange, onSubmit, onBlur, className, placeholder, autoFocus } = props
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const suggestions = useMemo(() => buildSuggestions(value), [value])

  useEffect(() => {
    if (!value.trim()) {
      setOpen(false)
      setActive(0)
      return
    }
    setOpen(suggestions.length > 0)
    setActive(0)
  }, [value, suggestions.length])

  const pick = (s: string) => {
    onChange(s)
    setOpen(false)
    setActive(0)
    // Pass the picked value directly to submit
    setTimeout(() => onSubmit(s), 50)
  }

  return (
    <div className="relative flex-1">
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={e => {
          // If the blur was caused by clicking a suggestion, don't close yet
          // the onMouseDown of the suggestion will handle the rest
          if (e.relatedTarget?.closest('.tw-ve-suggestions')) return
          setOpen(false)
          if (onBlur) onBlur()
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive(i => Math.min(i + 1, Math.max(0, suggestions.length - 1)))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(i => Math.max(0, i - 1))
          }
          if (e.key === 'Enter') {
            if (open && suggestions[active]) {
              e.preventDefault()
              pick(suggestions[active])
              return
            }
            onSubmit()
          }
          if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        className={className}
        placeholder={placeholder}
      />
      {open && suggestions.length > 0 && (
        <div className="tw-ve-suggestions absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded border border-zinc-200 bg-white shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={s}
              tabIndex={-1}
              className={`w-full text-left px-2 py-1 text-xs font-mono ${
                i === active ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-zinc-50'
              }`}
              onMouseDown={e => {
                e.preventDefault()
                pick(s)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
