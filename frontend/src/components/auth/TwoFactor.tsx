import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { disableTwoFactor, enableTwoFactor, setupTwoFactor } from '@/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { QrCode } from '@/components/certificate/QrCode'

// Two-step sign-in in the profile's security card. On: scan the QR code with an authenticator app (Google
// Authenticator, Microsoft Authenticator…), type its 6-digit code, save the 8 recovery codes. Off: a code again.
export function TwoFactorRow() {
  const { t } = useTranslation()
  const { user, signIn } = useAuth()
  const [setup, setSetup] = useState<{ secret: string; url: string } | null>(null)
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [off, setOff] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error(errorMessage(e, t)) } finally { setBusy(false) }
  }
  const start = () => run(async () => { setCode(''); setSetup(await setupTwoFactor()) })
  const enable = () => run(async () => {
    const r = await enableTwoFactor(code)
    signIn(r.user)
    setSetup(null)
    setRecovery(r.recovery)
    toast.success(t('twoFactor.enabled'))
  })
  const disable = () => run(async () => {
    signIn(await disableTwoFactor(code))
    setOff(false)
    toast(t('twoFactor.disabled'))
  })
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success(t('twoFactor.copied')) } catch { toast.error(t('common.copyFailed')) } }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Smartphone className="size-4 text-primary" />{t('twoFactor.title')}</p>
        <p className={user.twoFactor ? 'text-xs font-semibold text-success' : 'text-xs text-muted-foreground'}>{t(user.twoFactor ? 'twoFactor.on' : 'twoFactor.offHint')}</p>
      </div>
      {user.twoFactor
        ? <Button size="sm" variant="ghost" className="text-danger" onClick={() => { setCode(''); setOff(true) }}>{t('twoFactor.turnOff')}</Button>
        : <Button size="sm" variant="outline" disabled={busy} onClick={start}>{busy && !setup ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{t('twoFactor.turnOn')}</Button>}

      {/* on: scan, type the code */}
      <Dialog open={!!setup} onOpenChange={o => !o && setSetup(null)}>
        <DialogContent heading={t('twoFactor.setupTitle')} description={t('twoFactor.setupText')}>
          {setup && (
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); void enable() }}>
              <div className="flex flex-col items-center gap-2">
                <QrCode value={setup.url} size={180} className="rounded-xl border border-border" />
                <button type="button" onClick={() => copy(setup.secret)} className="inline-flex cursor-pointer items-center gap-1.5 break-all font-mono text-xs text-muted-foreground hover:text-primary">
                  <Copy className="size-3.5 shrink-0" />{setup.secret.replace(/(.{4})/g, '$1 ').trim()}
                </button>
              </div>
              <div>
                <Label htmlFor="tf-code">{t('twoFactor.code')}</Label>
                <Input id="tf-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
                <Button type="submit" disabled={busy || code.length !== 6}>{busy && <Loader2 className="size-4 animate-spin" />}{t('twoFactor.confirm')}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* the recovery codes, shown once */}
      <Dialog open={!!recovery} onOpenChange={o => !o && setRecovery(null)}>
        <DialogContent heading={t('twoFactor.recoveryTitle')} description={t('twoFactor.recoveryText')}>
          <ul className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-4 font-mono text-sm">
            {recovery?.map(c => <li key={c}>{c}</li>)}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => copy(recovery?.join('\n') ?? '')}><Copy className="size-4" />{t('twoFactor.copyAll')}</Button>
            <DialogClose asChild><Button>{t('twoFactor.saved')}</Button></DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      {/* off: a code proves it is the owner */}
      <Dialog open={off} onOpenChange={setOff}>
        <DialogContent heading={t('twoFactor.offTitle')} description={t('twoFactor.offText')}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); void disable() }}>
            <div>
              <Label htmlFor="tf-off">{t('twoFactor.codeOrRecovery')}</Label>
              <Input id="tf-off" autoComplete="one-time-code" maxLength={20} autoFocus value={code} onChange={e => setCode(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">{t('common.cancel')}</Button></DialogClose>
              <Button type="submit" variant="danger" disabled={busy || code.trim().length < 6}>{busy && <Loader2 className="size-4 animate-spin" />}{t('twoFactor.turnOff')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// The second step of signing in: the code from the app (or a recovery code), with the ticket from the first step
export function SecondStepForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (code: string) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  return (
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); onSubmit(code.trim()) }}>
      <p className="flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-sm"><Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />{t('twoFactor.loginText')}</p>
      <div>
        <Label htmlFor="login-code">{t('twoFactor.codeOrRecovery')}</Label>
        <Input id="login-code" inputMode="text" autoComplete="one-time-code" maxLength={20} autoFocus value={code} onChange={e => setCode(e.target.value)} placeholder="123456" />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy || code.trim().length < 6}>{busy && <Loader2 className="size-4 animate-spin" />}{t('twoFactor.loginButton')}</Button>
      <button type="button" onClick={onCancel} className="w-full cursor-pointer text-center text-sm font-semibold text-muted-foreground hover:text-primary">{t('common.back')}</button>
    </form>
  )
}
