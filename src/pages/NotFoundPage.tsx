import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-black text-muted-foreground">404</p>
      <h1 className="text-xl font-bold">Esta página no existe</h1>
      <Button asChild variant="outline">
        <Link to="/league">Volver a la liga</Link>
      </Button>
    </main>
  )
}
