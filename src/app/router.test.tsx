import { describe, expect, it } from 'vitest'
import { matchRoutes } from 'react-router'

/**
 * `/matches/new` and `/matches/:matchId` overlap, and the static route is
 * declared *after* the dynamic one because it also sits behind the admin guard.
 * React Router ranks static segments above dynamic ones rather than going by
 * declaration order — this pins that, because if it ever stopped holding the
 * "new match" page would silently become a match detail page for a match whose
 * id is the string "new".
 */
const ROUTES = [
  { path: '/login' },
  { path: '/forgot-password' },
  {
    children: [
      { path: '/reset-password' },
      {
        children: [
          { path: '/league' },
          { path: '/players' },
          { path: '/players/:playerId' },
          { path: '/matches' },
          { path: '/matches/:matchId' },
          {
            children: [{ path: '/matches/new' }, { path: '/admin/players' }],
          },
        ],
      },
    ],
  },
]

function matchedPath(pathname: string): string | undefined {
  const matches = matchRoutes(ROUTES, pathname)
  return matches?.at(-1)?.route.path
}

describe('route ranking', () => {
  it('prefers the static /matches/new over the dynamic /matches/:matchId', () => {
    expect(matchedPath('/matches/new')).toBe('/matches/new')
  })

  it('still routes a real id to the detail page', () => {
    expect(matchedPath('/matches/33333333-3333-4333-8333-000000000001')).toBe(
      '/matches/:matchId',
    )
  })

  it('routes the match list', () => {
    expect(matchedPath('/matches')).toBe('/matches')
  })

  it('routes a player id to the player detail page', () => {
    expect(matchedPath('/players/abc')).toBe('/players/:playerId')
  })

  it('routes both password recovery pages', () => {
    expect(matchedPath('/forgot-password')).toBe('/forgot-password')
    expect(matchedPath('/reset-password')).toBe('/reset-password')
  })
})
