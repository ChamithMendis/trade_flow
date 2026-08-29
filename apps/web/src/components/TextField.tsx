import { forwardRef, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, error, id, className = '', ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        ref={ref}
        className={`h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 ${className}`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
});
