import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AppLayout } from '@/app/AppLayout'
import { AdminRoute, ProtectedRoute } from '@/app/guards'
import { AdminPlayersPage } from '@/pages/AdminPlayersPage'
import { LeaguePage } from '@/pages/LeaguePage'
import { LoginPage } from '@/pages/LoginPage'
import { MatchDetailPage } from '@/pages/MatchDetailPage'
import { MatchesPage } from '@/pages/MatchesPage'
import { MatchNewPage } from '@/pages/MatchNewPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlayerDetailPage } from '@/pages/PlayerDetailPage'
import { PlayersPage } from '@/pages/PlayersPage'

/**
 * Routes.
 *
 * Rankings and the admin settings pages arrive in the next stage;
 * placeholders would only be misleading, so they are simply absent for now.
 */
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/league" replace /> },
          { path: '/league', element: <LeaguePage /> },
          { path: '/players', element: <PlayersPage /> },
          { path: '/players/:playerId', element: <PlayerDetailPage /> },
          { path: '/matches', element: <MatchesPage /> },
          { path: '/matches/:matchId', element: <MatchDetailPage /> },
          {
            element: <AdminRoute />,
            children: [
              { path: '/matches/new', element: <MatchNewPage /> },
              { path: '/admin/players', element: <AdminPlayersPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
