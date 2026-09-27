import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, ChevronRight, EyeOff, Newspaper, Pencil, Plus, Trash2 } from 'lucide-react'
import { createNews, deleteNews, getNews, getNewsItem, NotFoundError, updateNews, type NewsInput } from '@/api'
import type { NewsItem } from '@/types'
import { useAuth } from '@/lib/auth'
import { useAsync } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/layout/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label, Switch, Textarea } from '@/components/ui/input'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states'
import NotFound from './NotFound'

// the publication day (the time of day adds nothing for news)
const dateOf = (n: NewsItem) => formatDate((n.publishedAt ?? n.updatedAt).slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })

// plain text with paragraphs; bare https:// links become clickable (no HTML from the author is rendered)
function Body({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="mb-4 leading-relaxed">
          {p.split(/(https:\/\/[^\s]+)/g).map((part, j) => part.startsWith('https://')
            ? <a key={j} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{part}</a>
            : <Fragment key={j}>{part.split('\n').map((line, k) => <Fragment key={k}>{k > 0 && <br />}{line}</Fragment>)}</Fragment>)}
        </p>
      ))}
    </>
  )
}

// admin editor: create or edit a post, save as a draft or publish
function NewsEditor({ open, onOpenChange, item, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; item?: NewsItem; onSaved: (id: string) => void }) {
  const { t } = useTranslation()
  const empty: NewsInput = { title: '', summary: '', body: '', coverUrl: '', published: false }
  const [f, setF] = useState<NewsInput>(empty)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setF(item ? { title: item.title, summary: item.summary, body: item.body ?? '', coverUrl: item.coverUrl ?? '', published: item.published } : empty)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const valid = f.title.trim().length >= 5 && f.summary.trim().length >= 10 && f.body.trim().length >= 20
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const id = item ? (await updateNews(item.id, f), item.id) : (await createNews(f)).id
      toast.success(t('common.saved'))
      onOpenChange(false)
      onSaved(id)
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent heading={item ? t('news.edit') : t('news.add')} className="max-w-2xl">
        <form className="space-y-4" onSubmit={save}>
          <div><Label htmlFor="n-title">{t('news.fields.title')}</Label><Input id="n-title" maxLength={160} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
          <div><Label htmlFor="n-sum">{t('news.fields.summary')}</Label><Textarea id="n-sum" rows={2} maxLength={300} value={f.summary} onChange={e => setF({ ...f, summary: e.target.value })} /></div>
          <div>
            <Label htmlFor="n-body">{t('news.fields.body')}</Label>
            <Textarea id="n-body" rows={10} maxLength={20000} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">{t('news.fields.bodyHint')}</p>
          </div>
          <div><Label htmlFor="n-cover">{t('news.fields.cover')}</Label><Input id="n-cover" type="url" maxLength={1000} value={f.coverUrl} onChange={e => setF({ ...f, coverUrl: e.target.value })} placeholder="https://…" /></div>
          <div className="rounded-xl bg-muted/60 px-4 py-2"><Switch checked={!!f.published} onChange={v => setF({ ...f, published: v })} label={t('news.fields.published')} /></div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button type="submit" disabled={busy || !valid}>{t('common.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function News() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const [page, setPage] = useState(1)
  const { data, loading, error, reload } = useAsync(() => getNews(page, isAdmin), [page, isAdmin])
  const [editing, setEditing] = useState(false)
  return (
    <>
      <PageHeader title={t('news.title')} subtitle={t('news.subtitle')}>
        {isAdmin && <Button className="mt-6" onClick={() => setEditing(true)}><Plus className="size-4" />{t('news.add')}</Button>}
      </PageHeader>
      <div className="container-page max-w-4xl py-10">
        {error ? <ErrorState onRetry={reload} /> : loading && !data ? <div className="space-y-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-32" />)}</div>
          : !data?.items.length ? <EmptyState icon={<Newspaper className="size-7" />} title={t('news.empty')} /> : (
            <div className="space-y-4">
              {data.items.map(n => (
                <Link key={n.id} to={`/news/${n.id}`} className="group flex overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                  {n.coverUrl
                    ? <img src={n.coverUrl} alt="" loading="lazy" className="hidden w-48 shrink-0 object-cover sm:block" />
                    : <span className="hidden w-48 shrink-0 place-items-center bg-gradient-to-br from-primary to-navy text-white/80 sm:grid"><Newspaper className="size-10" /></span>}
                  <div className="min-w-0 flex-1 p-5">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {dateOf(n)}{!n.published && <Badge variant="muted"><EyeOff className="size-3" />{t('news.draft')}</Badge>}
                    </p>
                    <h2 className="mt-1 text-lg font-bold leading-snug group-hover:text-primary">{n.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.summary}</p>
                  </div>
                  <ChevronRight className="mr-4 size-5 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
              {data.pages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.back')}</Button>
                  <span className="text-sm text-muted-foreground">{page} / {data.pages}</span>
                  <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
                </div>
              )}
            </div>
          )}
      </div>
      <NewsEditor open={editing} onOpenChange={setEditing} onSaved={id => navigate(`/news/${id}`)} />
    </>
  )
}

export function NewsArticle() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAsync(() => getNewsItem(id), [id])
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  if (error instanceof NotFoundError) return <NotFound />
  if (error) return <div className="container-page py-20"><ErrorState onRetry={reload} /></div>
  if (loading || !data) return <div className="container-page max-w-3xl py-10"><Skeleton className="h-96" /></div>
  const isAdmin = user?.role === 'admin'
  return (
    <article className="container-page max-w-3xl py-10">
      <Link to="/news" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" />{t('news.all')}</Link>
      {data.coverUrl && <img src={data.coverUrl} alt="" className="mt-6 aspect-[2/1] w-full rounded-3xl object-cover" />}
      <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {dateOf(data)}{data.author && ` · ${data.author}`}{!data.published && <Badge variant="muted"><EyeOff className="size-3" />{t('news.draft')}</Badge>}
      </p>
      <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{data.title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{data.summary}</p>
      <div className="mt-8 border-t border-border pt-8 text-[17px]"><Body text={data.body ?? ''} /></div>
      {isAdmin && (
        <Card className="mt-8 flex flex-wrap items-center gap-2 p-4">
          <span className="mr-auto text-sm text-muted-foreground">{t('news.adminTools')}</span>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" />{t('news.edit')}</Button>
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm(true)}><Trash2 className="size-4" />{t('common.delete')}</Button>
        </Card>
      )}
      <NewsEditor open={editing} onOpenChange={setEditing} item={data} onSaved={() => reload()} />
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent heading={t('news.deleteTitle')} description={data.title}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">{t('common.cancel')}</Button></DialogClose>
            <Button variant="danger" onClick={async () => {
              try { await deleteNews(data.id); toast(t('news.deleted')); navigate('/news') } catch (e) { toast.error(errorMessage(e, t)) }
            }}><Trash2 className="size-4" />{t('common.delete')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}
