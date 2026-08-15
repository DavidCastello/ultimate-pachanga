import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerFormDialog } from '@/features/players/PlayerFormDialog'
import { renderWithProviders } from '@/test/render'
import { buildPlayerCard } from '@/test/factories'

function renderDialog(
  overrides: Partial<Parameters<typeof PlayerFormDialog>[0]> = {},
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onOpenChange = vi.fn()

  renderWithProviders(
    <PlayerFormDialog
      open
      scope="admin"
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...overrides}
    />,
  )

  return { onSubmit, onOpenChange }
}

describe('PlayerFormDialog', () => {
  it('refuses to submit without a name', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.click(screen.getByRole('button', { name: /crear jugador/i }))

    expect(await screen.findByText(/el nombre es obligatorio/i)).toBeVisible()
    expect(screen.getByText(/los apellidos son obligatorios/i)).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the trimmed values', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText('Nombre'), '  Carlos  ')
    await user.type(screen.getByLabelText('Apellidos'), '  Herrera ')
    await user.click(screen.getByRole('button', { name: /crear jugador/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'Carlos',
      lastName: 'Herrera',
      nickname: null,
      preferredPosition: 'UT',
      isGuest: false,
      estimatedMarketValueGbp: null,
    })
  })

  // An empty nickname is "no nickname", which the column stores as null rather
  // than an empty string.
  it('sends a blank nickname as null', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText('Nombre'), 'Hugo')
    await user.type(screen.getByLabelText('Apellidos'), 'Blanco')
    await user.type(screen.getByLabelText(/apodo/i), '   ')
    await user.click(screen.getByRole('button', { name: /crear jugador/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].nickname).toBeNull()
  })

  it('keeps a real nickname', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderDialog()

    await user.type(screen.getByLabelText('Nombre'), 'Juan')
    await user.type(screen.getByLabelText('Apellidos'), 'García')
    await user.type(screen.getByLabelText(/apodo/i), 'Juanito')
    await user.click(screen.getByRole('button', { name: /crear jugador/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].nickname).toBe('Juanito')
  })

  it('pre-fills the form when editing and shows the import code', async () => {
    renderDialog({
      player: buildPlayerCard({ nickname: 'Dave', playerCode: 'PLR-A7K2' }),
    })

    await waitFor(() =>
      expect(screen.getByLabelText('Nombre')).toHaveValue('David'),
    )
    expect(screen.getByLabelText('Apellidos')).toHaveValue('Castelló')
    expect(screen.getByLabelText(/apodo/i)).toHaveValue('Dave')
    expect(screen.getByText(/PLR-A7K2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument()
  })

  describe('the administrator-only fields', () => {
    it('sends the guest flag and the estimated value', async () => {
      const user = userEvent.setup()
      const { onSubmit } = renderDialog()

      await user.type(screen.getByLabelText('Nombre'), 'Gerogino')
      await user.type(screen.getByLabelText('Apellidos'), 'Rutter')
      await user.click(screen.getByLabelText(/jugador invitado/i))
      await user.type(screen.getByLabelText(/valor de mercado/i), '8000000')
      await user.click(screen.getByRole('button', { name: /crear jugador/i }))

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        isGuest: true,
        estimatedMarketValueGbp: 8_000_000,
      })
    })

    // An empty box is "no opinion", not zero — the database has to see null so
    // the player falls back to the league average.
    it('sends a blank estimate as null', async () => {
      const user = userEvent.setup()
      const { onSubmit } = renderDialog()

      await user.type(screen.getByLabelText('Nombre'), 'Sin')
      await user.type(screen.getByLabelText('Apellidos'), 'Tasar')
      await user.click(screen.getByRole('button', { name: /crear jugador/i }))

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
      expect(onSubmit.mock.calls[0][0].estimatedMarketValueGbp).toBeNull()
    })

    it('refuses a negative estimate', async () => {
      const user = userEvent.setup()
      const { onSubmit } = renderDialog()

      await user.type(screen.getByLabelText('Nombre'), 'Deuda')
      await user.type(screen.getByLabelText('Apellidos'), 'Viviente')
      await user.type(screen.getByLabelText(/valor de mercado/i), '-100')
      await user.click(screen.getByRole('button', { name: /crear jugador/i }))

      expect(
        await screen.findByText(/importe de cero en adelante/i),
      ).toBeVisible()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    // The same rule catches this: Number('tres millones') is NaN, and NaN is
    // not greater than or equal to anything.
    it('refuses something that is not a figure at all', async () => {
      const user = userEvent.setup()
      const { onSubmit } = renderDialog()

      await user.type(screen.getByLabelText('Nombre'), 'Vago')
      await user.type(screen.getByLabelText('Apellidos'), 'Impreciso')
      await user.type(
        screen.getByLabelText(/valor de mercado/i),
        'tres millones',
      )
      await user.click(screen.getByRole('button', { name: /crear jugador/i }))

      expect(
        await screen.findByText(/importe de cero en adelante/i),
      ).toBeVisible()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('echoes the figure back so the zeroes can be counted', async () => {
      const user = userEvent.setup()
      renderDialog()

      await user.type(screen.getByLabelText(/valor de mercado/i), '3000000')

      expect(await screen.findByText(/3\.000\.000/)).toBeVisible()
    })

    it('pre-fills both when editing', async () => {
      renderDialog({
        player: buildPlayerCard({
          isGuest: true,
          estimatedMarketValueGbp: 4_500_000,
        }),
      })

      await waitFor(() =>
        expect(screen.getByLabelText(/jugador invitado/i)).toBeChecked(),
      )
      expect(screen.getByLabelText(/valor de mercado/i)).toHaveValue('4500000')
    })

    // A card built from a database a migration behind has no estimate at all,
    // not even a null one. It has to open as an empty box: rendering it as
    // "undefined" fails validation and reads as the administrator's mistake.
    it('opens empty when the card has no estimate field', async () => {
      renderDialog({
        player: buildPlayerCard({
          estimatedMarketValueGbp: undefined as unknown as null,
        }),
      })

      await waitFor(() =>
        expect(screen.getByLabelText(/valor de mercado/i)).toHaveValue(''),
      )
    })

    // A member editing their own card must not be offered either one; the
    // database refuses them anyway, and a control that always fails is worse
    // than no control.
    it('are absent for a player editing themselves', () => {
      renderDialog({ scope: 'self', player: buildPlayerCard() })

      expect(screen.queryByLabelText(/jugador invitado/i)).toBeNull()
      expect(screen.queryByLabelText(/valor de mercado/i)).toBeNull()
    })
  })

  it('closes after a successful submit', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderDialog()

    await user.type(screen.getByLabelText('Nombre'), 'Toni')
    await user.type(screen.getByLabelText('Apellidos'), 'Lorenzo')
    await user.click(screen.getByRole('button', { name: /crear jugador/i }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
