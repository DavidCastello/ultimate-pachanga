import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { renderWithProviders } from '@/test/render'

const updatePassword = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())

vi.mock('@/features/auth/api', () => ({ updatePassword, signOut }))
vi.mock('@/lib/env', () => ({ APP_NAME: 'Ultimate Pachanga' }))
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }))

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updatePassword.mockResolvedValue(undefined)
    signOut.mockResolvedValue(undefined)
  })

  it('updates the password, signs out and returns to login', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResetPasswordPage />, { route: '/reset-password' })

    await user.type(screen.getByLabelText('Nueva contraseña'), 'newpass123')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'newpass123')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    await waitFor(() =>
      expect(updatePassword).toHaveBeenCalledWith('newpass123'),
    )
    expect(signOut).toHaveBeenCalledOnce()
    expect(toastSuccess).toHaveBeenCalledWith(
      'Contraseña actualizada. Ya puedes iniciar sesión.',
    )
  })

  it('rejects passwords that do not match', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResetPasswordPage />, { route: '/reset-password' })

    await user.type(screen.getByLabelText('Nueva contraseña'), 'newpass123')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'different')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(
      await screen.findByText('Las contraseñas no coinciden'),
    ).toBeInTheDocument()
    expect(updatePassword).not.toHaveBeenCalled()
  })
})
