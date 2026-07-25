import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'

/**
 * Renders a component with the providers it needs.
 *
 * Retries are off and there is a fresh QueryClient per render, so one test's
 * cache can never leak into the next.
 */
export function renderWithProviders(
  ui: React.ReactNode,
  options: RenderOptions & { route?: string } = {},
) {
  const { route = '/', ...renderOptions } = options

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <TooltipProvider>{ui}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
    renderOptions,
  )
}
