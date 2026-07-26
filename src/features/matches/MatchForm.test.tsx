import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchForm } from '@/features/matches/MatchForm'
import { renderWithProviders } from '@/test/render'
import { buildMatch } from '@/test/factories'
import type { MatchRow } from '@/types/domain'

// The photograph preview resolves stored paths through the Supabase storage
// client, which would otherwise require a configured environment.
vi.mock('@/lib/supabase', () => ({
  getMatchPhotoUrl: (path: string | null) =>
    path ? `https://example.test/match-photos/${path}` : null,
  supabase: {},
  MATCH_PHOTOS_BUCKET: 'match-photos',
}))

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

    const { match: input } = onSubmit.mock.calls[0][0]
    expect(input.title).toBe('Jornada 4')
    expect(input.location).toBe('Roco')
    // The column is timestamptz, so the form must hand over an instant.
    expect(input.playedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(Number.isNaN(Date.parse(input.playedAt))).toBe(false)
  })

  // Uploading is never required: a match with no photograph of its own falls
  // back to the picture bundled for its location.
  it('submits without a photograph, previewing the venue picture', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.type(screen.getByLabelText('Título'), 'Jornada 4')
    await user.type(screen.getByLabelText('Lugar'), 'UIB')

    expect(screen.getByTestId('match-form-photo-preview')).toHaveAttribute(
      'src',
      '/venues/uib.webp',
    )

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].photo).toBeNull()
  })

  it('hands over a chosen photograph beside the match', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm(EXISTING_MATCH)
    const photo = new File(['pitch'], 'pitch.webp', { type: 'image/webp' })

    await user.upload(screen.getByLabelText('Foto del partido'), photo)

    expect(await screen.findByText('pitch.webp')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].photo).toBe(photo)
  })

  // The bucket would reject it too; saying so here spares the administrator a
  // failed upload after the match has already been written.
  it('refuses a photograph the bucket would not accept', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()
    const tooLarge = new File(
      [new ArrayBuffer(4 * 1024 * 1024)],
      'panoramica.webp',
      { type: 'image/webp' },
    )

    await user.upload(screen.getByLabelText('Foto del partido'), tooLarge)

    expect(await screen.findByText(/no puede superar los 3 MB/)).toBeVisible()

    await user.type(screen.getByLabelText('Título'), 'Jornada 4')
    await user.type(screen.getByLabelText('Lugar'), 'Roco')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].photo).toBeNull()
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

  // The regression that emptied every statistic in the deployed league: the
  // select cannot offer `scored`, so the form fell back to `played` and saved
  // that — and every derived view filters on `status = 'scored'`. Editing a
  // scored match to attach a photograph silently uncounted it.
  it('gives a scored match back its own status, not the fallback', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ ...EXISTING_MATCH, status: 'scored' })

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].match.status).toBe('scored')
  })

  // A dropdown whose choice is thrown away is worse than no dropdown.
  it('states a scored status instead of offering a control for it', () => {
    renderForm({ ...EXISTING_MATCH, status: 'scored' })

    expect(screen.getByText(/Puntuado/)).toBeVisible()
    expect(
      screen.queryByRole('combobox', { name: 'Estado' }),
    ).not.toBeInTheDocument()
  })

  it('calls onCancel without submitting', async () => {
    const user = userEvent.setup()
    const { onCancel, onSubmit } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
