import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, QrCode, XCircle } from 'lucide-react'
import { checkIn } from '@/api'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'

// opened by scanning the venue QR: checks the signed-in member's team in automatically
export default function CheckIn() {
  const { t } = useTranslation()
  const { tournamentId = '' } = useParams()
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '')
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle')
  const [result, setResult] = useState<{ team: string; tournament: string; alreadyChecked: boolean }>()
  const [message, setMessage] = useState('')

  const submit = async (value = code) => {
    if (!value.trim()) return
    setState('busy')
    try {
      setResult(await checkIn(tournamentId, value.trim()))
      setState('ok')
    } catch (e) {
      setMessage(errorMessage(e, t))
      setState('error')
    }
  }
  // the QR already carries the code: no typing needed
  useEffect(() => { if (params.get('code')) void submit(params.get('code')!) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container-page flex justify-center py-12">
      <Card className="w-full max-w-md p-8 text-center">
        {state === 'ok' && result ? (
          <>
            <CheckCircle2 className="mx-auto size-16 text-success" />
            <h1 className="mt-4 text-2xl font-extrabold">{result.alreadyChecked ? t('checkin.already') : t('checkin.done')}</h1>
            <p className="mt-2 text-muted-foreground">{t('checkin.doneText', { team: result.team, tournament: result.tournament })}</p>
            <Button asChild className="mt-6"><Link to={`/tournaments/${tournamentId}?tab=draw`}>{t('checkin.toDraw')}</Link></Button>
          </>
        ) : (
          <>
            {state === 'error' ? <XCircle className="mx-auto size-14 text-danger" /> : <QrCode className="mx-auto size-14 text-primary" />}
            <h1 className="mt-4 text-2xl font-extrabold">{t('checkin.title')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{state === 'error' ? message : t('checkin.text')}</p>
            <form className="mt-6 space-y-3 text-left" onSubmit={e => { e.preventDefault(); void submit() }}>
              <Label htmlFor="ci-code">{t('checkin.code')}</Label>
              <Input id="ci-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" className="text-center font-mono text-lg tracking-[0.3em]" />
              <Button type="submit" className="w-full" disabled={state === 'busy' || !code.trim()}>
                {state === 'busy' && <Loader2 className="size-4 animate-spin" />}{t('checkin.submit')}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
