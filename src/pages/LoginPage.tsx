import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { signIn, signUp } from '@/features/auth/api'
import { useAuth } from '@/features/auth/useAuth'
import { APP_NAME } from '@/lib/env'

const credentialsSchema = z.object({
  email: z.string().min(1, 'Introduce tu correo').email('Correo no válido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

type CredentialsValues = z.infer<typeof credentialsSchema>

type Mode = 'signin' | 'signup'

interface CredentialsFormProps {
  mode: Mode
  onSubmitted: () => void
}

function CredentialsForm({ mode, onSubmitted }: CredentialsFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: CredentialsValues) {
    try {
      if (mode === 'signin') {
        await signIn(values)
      } else {
        await signUp(values)
        toast.success('Cuenta creada. Ya puedes entrar.')
      }
      onSubmitted()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo completar la operación',
      )
    }
  }

  const passwordAutoComplete =
    mode === 'signin' ? 'current-password' : 'new-password'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field data-invalid={Boolean(errors.email) || undefined}>
        <FieldLabel htmlFor={`${mode}-email`}>Correo electrónico</FieldLabel>
        <Input
          id={`${mode}-email`}
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          aria-invalid={Boolean(errors.email)}
          {...register('email')}
        />
        {errors.email ? <FieldError>{errors.email.message}</FieldError> : null}
      </Field>

      <Field data-invalid={Boolean(errors.password) || undefined}>
        <FieldLabel htmlFor={`${mode}-password`}>Contraseña</FieldLabel>
        <Input
          id={`${mode}-password`}
          type="password"
          autoComplete={passwordAutoComplete}
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        {errors.password ? (
          <FieldError>{errors.password.message}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
      </Button>
    </form>
  )
}

export function LoginPage() {
  const { session, isLoading } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>('signin')

  if (!isLoading && session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/league'} replace />
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>{APP_NAME}</h1>
          </CardTitle>
          <CardDescription>Liga de verano roco · Fútbol 7</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Registrarse</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <CredentialsForm mode="signin" onSubmitted={() => {}} />
            </TabsContent>
            <TabsContent value="signup">
              <CredentialsForm
                mode="signup"
                onSubmitted={() => setMode('signin')}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  )
}
