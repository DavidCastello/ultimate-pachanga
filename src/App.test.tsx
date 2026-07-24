import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the league name and the card tiers', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /roco summer league/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Oro')).toBeInTheDocument()
    expect(screen.getByText('Plata')).toBeInTheDocument()
    expect(screen.getByText('Bronce')).toBeInTheDocument()
  })
})
