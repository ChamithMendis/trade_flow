import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { apiErrorMessage } from '@/lib/api';
import { useLogin } from './auth.api';
import { AuthCard } from './AuthCard';
import { loginSchema, type LoginValues } from './auth.schemas';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, { onSuccess: () => navigate('/', { replace: true }) });
  });

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back to your trading desk."
      footer={
        <>
          No account?{' '}
          <Link to="/register" className="font-medium text-slate-900 underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {login.isError && <p className="text-sm text-red-600">{apiErrorMessage(login.error)}</p>}
        <Button type="submit" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
