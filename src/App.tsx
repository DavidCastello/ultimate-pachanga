import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'Roco Summer League'

/**
 * Placeholder shell. Routing, auth and the real pages arrive in the next
 * stage; this exists so the scaffold is verifiably wired up (Tailwind theme,
 * shadcn components, path aliases).
 */
export default function App() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-6 p-6">
      <Card>
        <CardHeader>
          {/* shadcn's CardTitle renders a plain <div>, so page titles wrap an
              explicit heading to keep the document outline navigable. */}
          <CardTitle className="text-2xl">
            <h1>{APP_NAME}</h1>
          </CardTitle>
          <CardDescription>Liga de verano roco · Fútbol 7</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Scaffold listo. La base de datos, la autenticación y las páginas se
            añaden en las siguientes etapas.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-tier-gold text-background">Oro</Badge>
            <Badge className="bg-tier-silver text-background">Plata</Badge>
            <Badge className="bg-tier-bronze text-background">Bronce</Badge>
          </div>
          <Button className="w-fit">Empezar</Button>
        </CardContent>
      </Card>
    </main>
  )
}
