import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/AuthProvider'

/**
 * Every read failure, surfaced once.
 *
 * Mutations have always toasted their errors; reads said nothing, because a
 * failed query has `data === undefined` and every page rendered that as an
 * empty state. A league that had silently stopped counting its scored matches
 * therefore looked like a league that had never played, which is why it took a
 * user to find it.
 *
 * On the cache rather than in `defaultOptions`, so it covers every query in the
 * app including the ones nobody has written yet, and fires after the retry has
 * also failed.
 */
const queryCache = new QueryCache({
  onError: (error, query) => {
    console.error('Query failed', query.queryKey, error)
    if (query.state.data !== undefined) {
      toast.error('No se pudieron actualizar los datos', {
        description: 'Mostramos la última información disponible.',
      })
    }
  },
})

/**
 * Created once at module scope rather than inside the component, so a re-render
 * never discards the cache.
 */
const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A match can change while somebody has the site open. Returning to the
      // tab should refresh the league without forcing a manual reload.
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
