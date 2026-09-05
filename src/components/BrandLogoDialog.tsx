import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { BRAND_NAME, LOGO_URL } from '@/lib/brand'
import { cn } from '@/lib/utils'

export function BrandLogoDialog({
  className,
  imageClassName,
}: {
  className?: string
  imageClassName?: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
            className,
          )}
          aria-label={`Ampliar logo de ${BRAND_NAME}`}
        >
          <img
            src={LOGO_URL}
            alt=""
            className={cn('object-contain', imageClassName)}
          />
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="liquid-viewer inset-0 top-0 left-0 h-svh w-screen max-w-none translate-x-0 translate-y-0 place-items-center overflow-hidden rounded-none border-0 p-5 ring-0 sm:max-w-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{BRAND_NAME}</DialogTitle>
          <DialogDescription>Logo de la competición.</DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-4 right-4 z-10 border border-white/20 bg-black/65 text-white backdrop-blur-xl hover:border-primary hover:bg-primary hover:text-black"
            aria-label="Cerrar logo"
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </DialogClose>
        <img
          src={LOGO_URL}
          alt={BRAND_NAME}
          className="block h-auto max-h-[calc(100svh-3rem)] w-auto max-w-[calc(100vw-3rem)] object-contain drop-shadow-[0_0_42px_rgb(234_175_53/0.3)]"
        />
      </DialogContent>
    </Dialog>
  )
}
