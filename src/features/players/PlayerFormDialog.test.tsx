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

  it('closes after a successful submit', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderDialog()

    await user.type(screen.getByLabelText('Nombre'), 'Toni')
    await user.type(screen.getByLabelText('Apellidos'), 'Lorenzo')
    await user.click(screen.getByRole('button', { name: /crear jugador/i }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
