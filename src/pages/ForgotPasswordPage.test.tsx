import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { renderWithProviders } from '@/test/render'

const requestPasswordReset = vi.hoisted(() => vi.fn())

vi.mock('@/features/auth/api', () => ({ requestPasswordReset }))
vi.mock('@/lib/env', () => ({ APP_NAME: 'Ultimate Pachanga' }))

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestPasswordReset.mockResolvedValue(undefined)
  })

  it('requests a reset without revealing whether the account exists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ForgotPasswordPage />, { route: '/forgot-password' })

    await user.type(
      screen.getByLabelText('Correo electrónico'),
      'user@example.com',
    )
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith('user@example.com')
    })
    expect(
      await screen.findByText(/Si existe una cuenta con ese correo/),
    ).toBeInTheDocument()
  })
})
