import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AppLayout } from '@/app/AppLayout'
import { AdminRoute, ProtectedRoute } from '@/app/guards'
import { AdminPlayersPage } from '@/pages/AdminPlayersPage'
import { LeaguePage } from '@/pages/LeaguePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PlayerDetailPage } from '@/pages/PlayerDetailPage'
import { PlayersPage } from '@/pages/PlayersPage'

/**
 * Routes.
 *
 * Matches, rankings and the admin settings pages arrive in later stages;
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
          {
            element: <AdminRoute />,
            children: [
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
