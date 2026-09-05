import { useState } from 'react'
import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/AuthLayout'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { requestPasswordReset } from '@/features/auth/api'

const schema = z.object({
  email: z.string().min(1, 'Introduce tu correo').email('Correo no válido'),
})

type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  async function onSubmit({ email }: FormValues) {
    setSubmitError(null)
    try {
      await requestPasswordReset(email)
      setSubmitted(true)
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar el enlace. Inténtalo de nuevo.',
      )
    }
  }

  return (
    <AuthLayout
      title="Recuperar acceso"
      description="Te enviaremos un enlace seguro para elegir una contraseña nueva."
    >
          {submitted ? (
            <div className="flex flex-col gap-4">
              <p role="status" className="text-sm text-muted-foreground">
                Si existe una cuenta con ese correo, recibirás un enlace para
                restablecer tu contraseña.
              </p>
              <Button asChild variant="outline">
                <Link to="/login">Volver a iniciar sesión</Link>
              </Button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <Field data-invalid={Boolean(errors.email) || undefined}>
                <FieldLabel htmlFor="reset-email">
                  Correo electrónico
                </FieldLabel>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  aria-invalid={Boolean(errors.email)}
                  {...register('email')}
                />
                {errors.email ? (
                  <FieldError>{errors.email.message}</FieldError>
                ) : null}
              </Field>
              {submitError ? <FieldError>{submitError}</FieldError> : null}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Enviar enlace
              </Button>
              <Link
                to="/login"
                className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Volver a iniciar sesión
              </Link>
            </form>
          )}
    </AuthLayout>
  )
}
