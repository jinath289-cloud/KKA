import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold transition-all duration-200 select-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS: Record<Variant, string> = {
  primary:
    'border-b-4 border-amber-700 bg-amber-500 text-amber-950 shadow-lg hover:bg-amber-400 hover:shadow-xl active:scale-95',
  secondary:
    'border-b-4 border-leaf-900 bg-leaf-700 text-white shadow-lg hover:bg-leaf-600 hover:shadow-xl active:scale-95',
  danger:
    'border-b-4 border-red-800 bg-red-600 text-white shadow-lg hover:bg-red-500 hover:shadow-xl active:scale-95',
  outline: 'border-2 border-leaf-200 bg-white text-leaf-800 hover:bg-leaf-50 active:scale-95',
  ghost: 'text-leaf-800 hover:bg-leaf-50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    fullWidth = false,
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(BASE, VARIANTS[variant], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
