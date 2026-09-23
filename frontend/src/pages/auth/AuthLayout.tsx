import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Logo, Ornament, OrnamentPattern } from '@/components/brand'
import { LangSwitch, ThemeToggle } from '@/components/layout/Header'

export function AuthLayout({ title, subtitle, image, children }: { title: string; subtitle: string; image: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1"><LangSwitch /><ThemeToggle /></div>
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
      <div className="relative hidden overflow-hidden lg:block">
        <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/40 to-primary/30" />
        <OrnamentPattern className="text-white/[0.05]" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <Ornament className="mb-6 w-16 text-accent" />
          <p className="max-w-lg text-2xl font-bold leading-snug">{t('auth.quote')}</p>
          <p className="mt-3 text-sm text-white/70">— {t('auth.quoteAuthor')}</p>
        </div>
      </div>
    </div>
  )
}
