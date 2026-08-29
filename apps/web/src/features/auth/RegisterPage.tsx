import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { apiErrorMessage } from '@/lib/api';
import { useRegister } from './auth.api';
import { AuthCard } from './AuthCard';
import { registerSchema, type RegisterValues } from './auth.schemas';

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit((values) => {
    registerMutation.mutate(values, {
      onSuccess: () => navigate('/', { replace: true }),
    });
  });

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start with $100,000 in virtual cash."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-slate-900 underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {registerMutation.isError && (
          <p className="text-sm text-red-600">{apiErrorMessage(registerMutation.error)}</p>
        )}
        <Button type="submit" loading={registerMutation.isPending}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
