import { cn } from '@/lib/utils'
import { formatMarketValue, formatMarketValueExact } from '@/lib/formatting'

interface MarketValueProps {
  value: number | null
  /** Show the full figure rather than the abbreviated form. */
  exact?: boolean
  className?: string
}

/**
 * A market value. The abbreviated form is used in grids and tables; the exact
 * figure is always available as a tooltip via the title attribute.
 */
export function MarketValue({ value, exact, className }: MarketValueProps) {
  return (
    <span
      className={cn('numeric font-semibold', className)}
      title={formatMarketValueExact(value)}
    >
      {exact ? formatMarketValueExact(value) : formatMarketValue(value)}
    </span>
  )
}
