import { useToastStore, type ToastTone } from '@/stores/toastStore';

const toneStyles: Record<ToastTone, string> = {
  info: 'border-slate-200 bg-white',
  success: 'border-green-200 bg-green-50',
  error: 'border-red-200 bg-red-50',
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-lg border p-3 shadow-sm ${toneStyles[toast.tone]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">{toast.title}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="text-slate-400 transition hover:text-slate-700"
            >
              ×
            </button>
          </div>
          {toast.detail && <p className="mt-0.5 text-xs text-slate-600">{toast.detail}</p>}
        </div>
      ))}
    </div>
  );
}
