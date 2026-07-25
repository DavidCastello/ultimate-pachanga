import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { Loader2 } from 'lucide-react'
import { AppLayout } from '@/app/AppLayout'
import { AdminRoute, LeagueMemberRoute, ProtectedRoute } from '@/app/guards'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

/**
 * Routes.
 *
 * Pages are code-split so a member on a phone does not download the admin
 * screens, the CSV parser or the import dialog. Login and the 404 stay eager:
 * they are the two pages most likely to be the very first render.
 */
const OnboardingPage = lazy(() =>
  import('@/pages/OnboardingPage').then((module) => ({
    default: module.OnboardingPage,
  })),
)
const LeaguePage = lazy(() =>
  import('@/pages/LeaguePage').then((module) => ({
    default: module.LeaguePage,
  })),
)
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((module) => ({
    default: module.ProfilePage,
  })),
)
const PlayersPage = lazy(() =>
  import('@/pages/PlayersPage').then((module) => ({
    default: module.PlayersPage,
  })),
)
const PlayerDetailPage = lazy(() =>
  import('@/pages/PlayerDetailPage').then((module) => ({
    default: module.PlayerDetailPage,
  })),
)
const MatchesPage = lazy(() =>
  import('@/pages/MatchesPage').then((module) => ({
    default: module.MatchesPage,
  })),
)
const MatchDetailPage = lazy(() =>
  import('@/pages/MatchDetailPage').then((module) => ({
    default: module.MatchDetailPage,
  })),
)
const MatchNewPage = lazy(() =>
  import('@/pages/MatchNewPage').then((module) => ({
    default: module.MatchNewPage,
  })),
)
const RankingsPage = lazy(() =>
  import('@/pages/RankingsPage').then((module) => ({
    default: module.RankingsPage,
  })),
)
const AdminPlayersPage = lazy(() =>
  import('@/pages/AdminPlayersPage').then((module) => ({
    default: module.AdminPlayersPage,
  })),
)
const AdminSettingsPage = lazy(() =>
  import('@/pages/AdminSettingsPage').then((module) => ({
    default: module.AdminSettingsPage,
  })),
)
const AdminMembersPage = lazy(() =>
  import('@/pages/AdminMembersPage').then((module) => ({
    default: module.AdminMembersPage,
  })),
)

function RouteFallback() {
  return (
    <div
      className="flex min-h-64 items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Cargando</span>
    </div>
  )
}

/**
 * `/matches/new` is declared after `/matches/:matchId` because it also sits
 * behind the admin guard. React Router ranks static segments above dynamic
 * ones, so the static route still wins — pinned by router.test.tsx.
 */
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      // Outside the layout and the membership guard: this is where an account
      // with neither a league nor a player is sent, and the shell has nothing
      // to render for one.
      { path: '/onboarding', element: <OnboardingPage /> },
      {
        element: <LeagueMemberRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="/league" replace /> },
              { path: '/league', element: <LeaguePage /> },
              { path: '/profile', element: <ProfilePage /> },
              { path: '/players', element: <PlayersPage /> },
              { path: '/players/:playerId', element: <PlayerDetailPage /> },
              { path: '/matches', element: <MatchesPage /> },
              { path: '/matches/:matchId', element: <MatchDetailPage /> },
              { path: '/rankings', element: <RankingsPage /> },
              {
                element: <AdminRoute />,
                children: [
                  { path: '/matches/new', element: <MatchNewPage /> },
                  { path: '/admin/players', element: <AdminPlayersPage /> },
                  { path: '/admin/settings', element: <AdminSettingsPage /> },
                  { path: '/admin/members', element: <AdminMembersPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  )
}
