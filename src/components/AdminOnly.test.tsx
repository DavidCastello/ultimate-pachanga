import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { AdminOnly } from '@/components/AdminOnly'
import { renderWithProviders } from '@/test/render'

const useIsAdmin = vi.hoisted(() => vi.fn())

vi.mock('@/features/league/useLeague', () => ({ useIsAdmin }))

describe('AdminOnly', () => {
  beforeEach(() => {
    useIsAdmin.mockReset()
  })

  it('renders its children for an administrator', () => {
    useIsAdmin.mockReturnValue(true)

    renderWithProviders(
      <AdminOnly>
        <button>Nuevo jugador</button>
      </AdminOnly>,
    )

    expect(
      screen.getByRole('button', { name: 'Nuevo jugador' }),
    ).toBeInTheDocument()
  })

  it('renders nothing for a member', () => {
    useIsAdmin.mockReturnValue(false)

    renderWithProviders(
      <AdminOnly>
        <button>Nuevo jugador</button>
      </AdminOnly>,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the fallback for a member when one is given', () => {
    useIsAdmin.mockReturnValue(false)

    renderWithProviders(
      <AdminOnly fallback={<p>Solo lectura</p>}>
        <button>Nuevo jugador</button>
      </AdminOnly>,
    )

    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides admin controls while the role is still unknown', () => {
    // useIsAdmin returns false until the membership query resolves, so a
    // member must never see a flash of admin controls on first paint.
    useIsAdmin.mockReturnValue(false)

    renderWithProviders(
      <AdminOnly>
        <button>Borrar todo</button>
      </AdminOnly>,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
