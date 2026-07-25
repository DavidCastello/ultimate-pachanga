import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import {
  BarChart3,
  CalendarDays,
  LogOut,
  Menu,
  Settings,
  Shield,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { AdminOnly } from '@/components/AdminOnly'
import { signOut } from '@/features/auth/api'
import { useLeague } from '@/features/league/useLeague'
import { APP_NAME } from '@/lib/env'
import { cn } from '@/lib/utils'

interface NavigationItem {
  to: string
  label: string
  icon: typeof Users
  adminOnly?: boolean
}

const NAVIGATION: NavigationItem[] = [
  { to: '/league', label: 'Liga', icon: Shield },
  { to: '/players', label: 'Jugadores', icon: Users },
  { to: '/matches', label: 'Partidos', icon: CalendarDays },
  { to: '/rankings', label: 'Clasificaciones', icon: BarChart3 },
  { to: '/admin/players', label: 'Gestión', icon: Settings, adminOnly: true },
]

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAVIGATION.map(({ to, label, icon: Icon, adminOnly }) => {
        const link = (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </NavLink>
        )

        return adminOnly ? <AdminOnly key={to}>{link}</AdminOnly> : link
      })}
    </>
  )
}

/**
 * Shell for every signed-in page: a horizontal nav on desktop, a slide-over
 * sheet on mobile.
 */
export function AppLayout() {
  const { data: league } = useLeague()
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo cerrar sesión',
      )
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Abrir menú"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="mb-4 text-base">{APP_NAME}</SheetTitle>
              <nav className="flex flex-col gap-1">
                <NavigationLinks onNavigate={() => setIsMenuOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/league" className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 font-black text-primary">
              R
            </span>
            <span className="truncate font-bold">
              {league?.title ?? APP_NAME}
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            <NavigationLinks />
          </nav>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="ml-auto"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Salir</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
