import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { BRAND_NAME, LOGO_URL } from '@/lib/brand'

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-5 p-6 text-center">
      <img src={LOGO_URL} alt={BRAND_NAME} className="size-28 object-contain" />
      <p className="technical text-sm font-semibold text-primary uppercase">
        Fuera de juego · 404
      </p>
      <h1 className="section-title">Esta página no existe</h1>
      <p className="body-copy max-w-md text-muted-foreground">
        El enlace puede haber cambiado, pero la competición sigue en marcha.
      </p>
      <Button asChild>
        <Link to="/league">Volver a la liga</Link>
      </Button>
    </main>
  )
}
