import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Ornament } from '@/components/brand'

export default function NotFound() {
  const { t } = useTranslation()
  return (
    <section className="container-page grid min-h-[70vh] place-items-center py-16 text-center">
      <div>
        <div className="relative mx-auto flex items-center justify-center gap-2 text-[7rem] font-extrabold leading-none text-primary sm:text-[10rem]">
          <span>4</span>
          <motion.span animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="grid size-24 place-items-center rounded-full bg-accent sm:size-36">
            <Ornament className="w-16 text-primary sm:w-24" />
          </motion.span>
          <span>4</span>
        </div>
        <h1 className="mt-8 text-2xl font-extrabold sm:text-4xl">{t('notFound.title')}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">{t('notFound.text')}</p>
        <Button asChild size="lg" className="mt-8"><Link to="/"><Home className="size-5" />{t('notFound.home')}</Link></Button>
      </div>
    </section>
  )
}
