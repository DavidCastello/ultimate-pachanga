import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  CalendarDays,
  Menu,
  LogIn,
  LogOut,
  Settings,
  Shield,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { AdminOnly } from '@/components/AdminOnly'
import { BrandLogoDialog } from '@/components/BrandLogoDialog'
import { signOut } from '@/features/auth/api'
import { useAuth } from '@/features/auth/useAuth'
import { fetchPlayerCard, playerKeys } from '@/features/players/api'
import { useMyPlayerId } from '@/features/players/useMyPlayer'
import { BRAND_NAME, LOGO_URL } from '@/lib/brand'
import { getAvatarUrl } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface NavigationItem {
  to: string
  label: string
  icon: typeof Users
}

const NAVIGATION: NavigationItem[] = [
  { to: '/league', label: 'Liga', icon: Shield },
  { to: '/players', label: 'Jugadores', icon: Users },
  { to: '/matches', label: 'Partidos', icon: CalendarDays },
  { to: '/stats', label: 'Estadísticas', icon: BarChart3 },
]

const PROFILE_NAVIGATION: NavigationItem[] = [
  { to: '/profile', label: 'Mi perfil', icon: UserRound },
]

const ADMIN_NAVIGATION: NavigationItem[] = [
  { to: '/admin/players', label: 'Gestionar jugadores', icon: Users },
  { to: '/admin/members', label: 'Miembros', icon: UserCog },
  { to: '/admin/settings', label: 'Ajustes de la liga', icon: Settings },
]

function navigationLinkClasses({ isActive }: { isActive: boolean }): string {
  return cn(
    'motion-nav-link group flex min-h-11 items-center gap-3 border border-transparent px-3 py-2 font-heading text-lg leading-none font-semibold uppercase transition-colors',
    isActive
      ? 'border-primary bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:border-primary/35 hover:bg-accent/70 hover:text-foreground',
  )
}

function ProfileNavigationAvatar() {
  const { data: myPlayerId } = useMyPlayerId()
  const { data: player } = useQuery({
    queryKey: playerKeys.card(myPlayerId ?? ''),
    enabled: Boolean(myPlayerId),
    queryFn: () => fetchPlayerCard(myPlayerId!),
  })
  const avatarUrl = getAvatarUrl(player?.avatarPath)

  return (
    <Avatar className="size-7 border border-primary/60 shadow-[0_0_16px_rgb(234_175_53/0.24)]">
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback className="bg-primary/15 text-primary">
        <UserRound className="size-4" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  )
}

function NavigationLinks({
  items,
  onNavigate,
}: {
  items: readonly NavigationItem[]
  onNavigate?: () => void
}) {
  return (
    <>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={navigationLinkClasses}
        >
          {to === '/profile' ? (
            <ProfileNavigationAvatar />
          ) : (
            <Icon className="size-5 shrink-0" aria-hidden="true" />
          )}
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  )
}

function BrandLockup({
  compact = false,
  iconOnly = false,
}: {
  compact?: boolean
  iconOnly?: boolean
}) {
  return (
    <Link
      to="/league"
      className={cn(
        'flex min-w-0 items-center',
        compact ? 'gap-2.5' : iconOnly ? 'w-fit' : 'w-full justify-center',
      )}
    >
      <img
        src={LOGO_URL}
        alt={BRAND_NAME}
        className={cn(
          'object-contain',
          compact
            ? 'size-10 shrink-0'
            : iconOnly
              ? 'h-12 w-auto max-w-none'
              : 'h-auto w-full max-w-28',
        )}
      />
      {compact && !iconOnly ? (
        <span className="truncate font-heading text-xl leading-none font-bold uppercase">
          {BRAND_NAME}
        </span>
      ) : null}
    </Link>
  )
}

function DesktopSidebar({
  onSignOut,
  isAuthenticated,
}: {
  onSignOut: () => void
  isAuthenticated: boolean
}) {
  return (
    <aside className="sticky top-0 hidden h-svh w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-card px-3 py-4 lg:flex">
      <BrandLockup />

      <div className="mt-4 border-t border-primary/35 pt-3">
        <p className="technical mb-3 px-3 text-[0.625rem] font-semibold text-muted-foreground uppercase">
          Competición
        </p>
        <nav className="flex flex-col gap-1.5">
          <NavigationLinks items={NAVIGATION} />
          {isAuthenticated ? (
            <NavigationLinks items={PROFILE_NAVIGATION} />
          ) : null}
        </nav>
      </div>

      <AdminOnly>
        <div className="mt-8">
          <p className="technical mb-3 px-3 text-[0.625rem] font-semibold text-muted-foreground uppercase">
            Administración
          </p>
          <nav className="flex flex-col gap-1.5">
            <NavigationLinks items={ADMIN_NAVIGATION} />
          </nav>
        </div>
      </AdminOnly>

      <div className="mt-auto border-t border-border pt-5">
        {isAuthenticated ? (
          <Button
            variant="ghost"
            onClick={onSignOut}
            className="w-full justify-start text-muted-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Salir
          </Button>
        ) : (
          <Button asChild className="w-full justify-start">
            <Link to="/login">
              <LogIn className="size-4" aria-hidden="true" />
              Entrar o registrarme
            </Link>
          </Button>
        )}
      </div>
    </aside>
  )
}

/** Shell for every signed-in page. */
export function AppLayout() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isAuthenticated = Boolean(session)

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
    <div className="flex min-h-svh bg-background">
      <DesktopSidebar
        onSignOut={() => void handleSignOut()}
        isAuthenticated={isAuthenticated}
      />

      <div className="min-w-0 flex-1">
        <header className="liquid-panel sticky top-0 z-40 grid h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center border-b border-primary/40 px-3 lg:hidden">
          <BrandLogoDialog
            className="justify-self-start"
            imageClassName="size-11"
          />

          <Link
            to="/league"
            className="truncate text-center font-heading text-xl leading-none font-bold uppercase"
          >
            {BRAND_NAME}
          </Link>

          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Abrir menú"
                className="justify-self-end"
              >
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="liquid-panel w-72 overflow-y-auto p-4"
            >
              <SheetTitle className="sr-only">Navegación</SheetTitle>
              <BrandLockup />
              <nav className="mt-7 border-t border-primary/35 pt-6">
                <p className="technical mb-3 px-3 text-[0.625rem] font-semibold text-muted-foreground uppercase">
                  Competición
                </p>
                <NavigationLinks
                  items={NAVIGATION}
                  onNavigate={() => setIsMenuOpen(false)}
                />
                {isAuthenticated ? (
                  <NavigationLinks
                    items={PROFILE_NAVIGATION}
                    onNavigate={() => setIsMenuOpen(false)}
                  />
                ) : null}
                <AdminOnly>
                  <p className="technical mt-7 mb-2 px-3 text-[0.625rem] font-semibold text-muted-foreground uppercase">
                    Administración
                  </p>
                  <NavigationLinks
                    items={ADMIN_NAVIGATION}
                    onNavigate={() => setIsMenuOpen(false)}
                  />
                </AdminOnly>
              </nav>
              {isAuthenticated ? (
                <Button
                  variant="ghost"
                  onClick={() => void handleSignOut()}
                  className="mt-8 w-full justify-start text-muted-foreground"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Salir
                </Button>
              ) : (
                <Button asChild className="mt-8 w-full justify-start">
                  <Link to="/login" onClick={() => setIsMenuOpen(false)}>
                    <LogIn className="size-4" aria-hidden="true" />
                    Entrar o registrarme
                  </Link>
                </Button>
              )}
            </SheetContent>
          </Sheet>
        </header>

        <main className="app-main mx-auto w-full max-w-[1600px] px-3 pt-4 pb-24 sm:px-5 lg:px-7 lg:py-6">
          <Outlet />
        </main>
        <nav
          aria-label="Navegación principal móvil"
          className="mobile-dock lg:hidden"
        >
          {[
            ...NAVIGATION,
            ...(isAuthenticated
              ? PROFILE_NAVIGATION
              : [{ to: '/login', label: 'Entrar', icon: LogIn }]),
          ].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn('dock-link', isActive && 'is-active')
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              <span>
                {label === 'Estadísticas'
                  ? 'Stats'
                  : label === 'Mi perfil'
                    ? 'Perfil'
                    : label}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
