import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export function Button({ loading, disabled, children, className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled ?? loading}
      className={`inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}
