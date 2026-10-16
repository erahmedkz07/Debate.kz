import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Formatted text typed by people (a tournament's description): no HTML is ever read from it, only these marks:
//   an empty line starts a new paragraph, a line break stays a line break;
//   "1. " or "1) " numbers a list, "- " or "• " makes a bullet list; "## " makes a heading;
//   **bold**, *italic*; links (https://…, www.…) can be clicked. Emoji are plain text.
// Everything is rendered as React text, so a description can never inject a script or a tag.

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'ol'; start: number; items: string[] }
  | { kind: 'ul'; items: string[] }

const OL = /^\s*(\d{1,3})[.)]\s+(.*)$/
const UL = /^\s*[-•*–—]\s+(.*)$/
const H = /^\s*#{1,3}\s+(.*)$/

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const last = () => blocks[blocks.length - 1]
  let open = false // a paragraph or a list goes on until an empty line or another kind of line
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) { open = false; continue }
    let m: RegExpMatchArray | null
    if ((m = line.match(H))) {
      blocks.push({ kind: 'h', text: m[1] }); open = false
    } else if ((m = line.match(OL))) {
      const b = last()
      if (open && b?.kind === 'ol') b.items.push(m[2])
      else blocks.push({ kind: 'ol', start: Number(m[1]), items: [m[2]] })
      open = true
    } else if ((m = line.match(UL))) {
      const b = last()
      if (open && b?.kind === 'ul') b.items.push(m[1])
      else blocks.push({ kind: 'ul', items: [m[1]] })
      open = true
    } else {
      const b = last()
      if (open && b?.kind === 'p') b.lines.push(line.trim())
      else blocks.push({ kind: 'p', lines: [line.trim()] })
      open = true
    }
  }
  return blocks
}

// **bold**, *italic*, and links
const INLINE = /(\*\*[^*\n]+?\*\*)|(\*[^*\s][^*\n]*?\*)|((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)»"'])/g

export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > at) out.push(text.slice(at, m.index))
    const [all, bold, italic, link] = m
    if (bold) out.push(<strong key={m.index} className="font-bold text-foreground">{bold.slice(2, -2)}</strong>)
    else if (italic) out.push(<em key={m.index}>{italic.slice(1, -1)}</em>)
    else if (link) {
      const href = link.startsWith('www.') ? `https://${link}` : link
      out.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium text-primary underline-offset-4 hover:underline">{link}</a>)
    }
    at = m.index! + all.length
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text)
  if (!blocks.length) return null
  return (
    <div className={cn('space-y-3 leading-relaxed', className)}>
      {blocks.map((b, i) => {
        if (b.kind === 'h') return <h3 key={i} className="pt-1 text-base font-bold text-foreground">{inline(b.text)}</h3>
        if (b.kind === 'ol') return <ol key={i} start={b.start} className="list-decimal space-y-1 pl-6 marker:font-semibold marker:text-primary">{b.items.map((x, k) => <li key={k}>{inline(x)}</li>)}</ol>
        if (b.kind === 'ul') return <ul key={i} className="list-disc space-y-1 pl-6 marker:text-primary">{b.items.map((x, k) => <li key={k}>{inline(x)}</li>)}</ul>
        return <p key={i}>{b.lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{inline(l)}</Fragment>)}</p>
      })}
    </div>
  )
}

// the text without its marks, for one-line previews
export const plainText = (text: string) => text.replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/\*([^*\s][^*\n]*?)\*/g, '$1').replace(/^\s*#{1,3}\s+/gm, '')
