import { Link } from 'react-router'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { BRAND_NAME, BRAND_TAGLINE, LOGO_URL } from '@/lib/brand'
import { cn } from '@/lib/utils'

export function AuthLayout({
  title,
  description,
  children,
  className,
  allowSpectator = true,
}: {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  allowSpectator?: boolean
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4 sm:p-6">
      <Card
        className={cn(
          'relative w-full max-w-lg border-primary/30 shadow-[0_24px_64px_rgb(0_0_0/0.6)]',
          className,
        )}
      >
        {allowSpectator ? (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-10 border border-border/70 bg-black/45 text-muted-foreground hover:border-primary/60 hover:text-primary"
          >
            <Link to="/league" aria-label="Cerrar y ver la liga como espectador">
              <X className="size-5" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}

        <CardHeader className="items-center border-b border-border pb-6 text-center">
          <img
            src={LOGO_URL}
            alt={BRAND_NAME}
            className="h-24 w-24 object-contain sm:h-28 sm:w-28"
          />
          <p className="technical text-[0.6875rem] font-semibold text-primary uppercase">
            {BRAND_TAGLINE}
          </p>
          <CardTitle className="mt-1 text-4xl leading-none uppercase sm:text-5xl">
            <h1>{title}</h1>
          </CardTitle>
          {description ? (
            <CardDescription className="body-copy max-w-sm">
              {description}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="pt-6">{children}</CardContent>
      </Card>
    </main>
  )
}

