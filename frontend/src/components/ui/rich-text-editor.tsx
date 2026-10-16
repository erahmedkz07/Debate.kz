import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bold, Eye, Heading2, Italic, List, ListOrdered, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/input'
import { RichText } from '@/components/ui/rich-text'

// A text field for formatted text (see RichText): buttons put the marks in for the selected text or lines, and
// "Preview" shows the text exactly as visitors will see it. Typing the marks by hand works the same.
export function RichTextEditor({ id, value, onChange, rows = 8, maxLength = 3000, placeholder }: {
  id?: string; value: string; onChange: (v: string) => void; rows?: number; maxLength?: number; placeholder?: string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)

  // replaces the selection and puts the cursor back where it belongs
  const apply = (fn: (text: string, start: number, end: number) => { text: string; start: number; end: number }) => {
    const el = ref.current
    if (!el) return
    const r = fn(value, el.selectionStart, el.selectionEnd)
    onChange(r.text.slice(0, maxLength))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.start, r.end) })
  }
  // **bold** or *italic* around the selection (or an empty pair to type into)
  const wrap = (mark: string) => apply((text, s, e) => ({
    text: text.slice(0, s) + mark + text.slice(s, e) + mark + text.slice(e),
    start: s + mark.length, end: e + mark.length,
  }))
  // "1. ", "- " or "## " at the start of every selected line
  const lines = (prefix: (i: number) => string) => apply((text, s, e) => {
    const from = text.lastIndexOf('\n', s - 1) + 1
    const toNl = text.indexOf('\n', e)
    const to = toNl === -1 ? text.length : toNl
    const block = text.slice(from, to).split('\n').map((l, i) => prefix(i) + l.replace(/^\s*(?:\d+[.)]|[-•*–—]|#{1,3})\s+/, '')).join('\n')
    return { text: text.slice(0, from) + block + text.slice(to), start: from, end: from + block.length }
  })

  const tool = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={preview}
      className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:cursor-default disabled:opacity-40">
      {icon}
    </button>
  )

  return (
    <div className="overflow-hidden rounded-xl border-2 border-border bg-card focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/60 px-1.5 py-1" role="toolbar" aria-label={t('richText.toolbar')}>
        {tool(t('richText.bold'), <Bold className="size-4" />, () => wrap('**'))}
        {tool(t('richText.italic'), <Italic className="size-4" />, () => wrap('*'))}
        {tool(t('richText.heading'), <Heading2 className="size-4" />, () => lines(() => '## '))}
        {tool(t('richText.numbered'), <ListOrdered className="size-4" />, () => lines(i => `${i + 1}. `))}
        {tool(t('richText.bullets'), <List className="size-4" />, () => lines(() => '- '))}
        <button type="button" onClick={() => setPreview(v => !v)} aria-pressed={preview}
          className={cn('ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
            preview ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-card hover:text-foreground')}>
          {preview ? <PenLine className="size-3.5" /> : <Eye className="size-3.5" />}{preview ? t('richText.edit') : t('richText.preview')}
        </button>
      </div>
      {preview ? (
        <div className="min-h-32 px-3.5 py-3 text-sm text-muted-foreground">
          {value.trim() ? <RichText text={value} /> : <p className="italic">{t('richText.empty')}</p>}
        </div>
      ) : (
        <Textarea ref={ref} id={id} rows={rows} maxLength={maxLength} value={value} placeholder={placeholder ?? t('richText.placeholder')}
          onChange={e => onChange(e.target.value)} className="rounded-none border-0 focus:ring-0" />
      )}
      <p className="flex flex-wrap justify-between gap-2 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{t('richText.hint')}</span><span className="tabular-nums">{value.length}/{maxLength}</span>
      </p>
    </div>
  )
}
