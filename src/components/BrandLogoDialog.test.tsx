import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrandLogoDialog } from '@/components/BrandLogoDialog'
import { renderWithProviders } from '@/test/render'

describe('BrandLogoDialog', () => {
  it('opens the brand mark in a full-screen viewer', async () => {
    const user = userEvent.setup()

    renderWithProviders(<BrandLogoDialog imageClassName="size-12" />)

    await user.click(
      screen.getByRole('button', {
        name: /ampliar logo de ultimate pachangas/i,
      }),
    )

    const image = screen.getByRole('img', { name: 'Ultimate Pachangas' })
    expect(image).toHaveClass('object-contain')
    expect(image).toHaveClass(
      'max-h-[calc(100svh-3rem)]',
      'max-w-[calc(100vw-3rem)]',
    )
    expect(
      screen.getByRole('button', { name: /cerrar logo/i }),
    ).toBeInTheDocument()
  })
})
