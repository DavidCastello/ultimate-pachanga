import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchForm } from '@/features/matches/MatchForm'
import { renderWithProviders } from '@/test/render'
import { buildMatch } from '@/test/factories'
import type { MatchRow } from '@/types/domain'

const EXISTING_MATCH = buildMatch()

function renderForm(match?: MatchRow) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()

  renderWithProviders(
    <MatchForm
      match={match}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitLabel="Guardar"
    />,
  )

  return { onSubmit, onCancel }
}

describe('MatchForm', () => {
  it('refuses to submit without a title or location', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.clear(screen.getByLabelText('Título'))
    await user.clear(screen.getByLabelText('Lugar'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(/el título es obligatorio/i)).toBeVisible()
    expect(screen.getByText(/el lugar es obligatorio/i)).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires both team names', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.type(screen.getByLabelText('Título'), 'Jornada 4')
    await user.type(screen.getByLabelText('Lugar'), 'Roco')
    await user.clear(screen.getByLabelText('Equipo local'))
    await user.clear(screen.getByLabelText('Equipo visitante'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(/falta el equipo local/i)).toBeVisible()
    expect(screen.getByText(/falta el equipo visitante/i)).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits an ISO timestamp built from the local input', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.type(screen.getByLabelText('Título'), 'Jornada 4')
    await user.type(screen.getByLabelText('Lugar'), 'Roco')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

    const input = onSubmit.mock.calls[0][0]
    expect(input.title).toBe('Jornada 4')
    expect(input.location).toBe('Roco')
    // The column is timestamptz, so the form must hand over an instant.
    expect(input.playedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(Number.isNaN(Date.parse(input.playedAt))).toBe(false)
  })

  it('pre-fills an existing match', () => {
    renderForm(EXISTING_MATCH)

    expect(screen.getByLabelText('Título')).toHaveValue('Jornada 3')
    expect(screen.getByLabelText('Lugar')).toHaveValue('Polideportivo Roco')
    expect(screen.getByLabelText('Equipo local')).toHaveValue('Los Cracks')
  })

  // `scored` is set by a successful import, never chosen by hand.
  it('does not offer "Puntuado" as a selectable status', async () => {
    const user = userEvent.setup()
    renderForm(EXISTING_MATCH)

    await user.click(screen.getByLabelText('Estado'))

    expect(
      await screen.findByRole('option', { name: 'Programado' }),
    ).toBeVisible()
    expect(screen.getByRole('option', { name: 'Cancelado' })).toBeVisible()
    expect(
      screen.queryByRole('option', { name: 'Puntuado' }),
    ).not.toBeInTheDocument()
  })

  it('shows a scored match as played so its status is not silently reset', () => {
    renderForm({ ...EXISTING_MATCH, status: 'scored' })

    expect(screen.getByLabelText('Estado')).toHaveTextContent('Jugado')
  })

  it('calls onCancel without submitting', async () => {
    const user = userEvent.setup()
    const { onCancel, onSubmit } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
