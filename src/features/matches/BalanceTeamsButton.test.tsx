import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BalanceTeamsButton } from '@/features/matches/BalanceTeamsButton'
import { renderWithProviders } from '@/test/render'

function renderButton(
  overrides: Partial<Parameters<typeof BalanceTeamsButton>[0]> = {},
) {
  const onBalance = vi.fn()

  renderWithProviders(
    <BalanceTeamsButton
      isAdmin
      hasEnoughPlayers
      isPending={false}
      onBalance={onBalance}
      {...overrides}
    />,
  )

  return { onBalance, button: screen.getByTestId('balance-teams') }
}

describe('BalanceTeamsButton', () => {
  it('balances the teams for an administrator', async () => {
    const user = userEvent.setup()
    const { onBalance, button } = renderButton()

    expect(button).toBeEnabled()
    await user.click(button)

    expect(onBalance).toHaveBeenCalledTimes(1)
  })

  it('is visible but blocked for a player who is not an administrator', async () => {
    const user = userEvent.setup()
    const { onBalance, button } = renderButton({ isAdmin: false })

    expect(button).toBeVisible()
    expect(button).toBeDisabled()

    await user.click(button)
    expect(onBalance).not.toHaveBeenCalled()
  })

  it('says whose call it is', async () => {
    const user = userEvent.setup()
    renderButton({ isAdmin: false })

    await user.hover(screen.getByTestId('balance-teams').parentElement!)

    expect(
      await screen.findByText(
        /Solo un administrador puede equilibrar los equipos/,
      ),
    ).toBeInTheDocument()
  })

  it('waits for a squad worth splitting', () => {
    const { button } = renderButton({ hasEnoughPlayers: false })

    expect(button).toBeDisabled()
  })

  it('is inert while the split is being written', () => {
    const { button } = renderButton({ isPending: true })

    expect(button).toBeDisabled()
  })
})
