import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 placeholder:text-stone-400 transition-colors focus:border-leaf-600 focus:outline-none focus:ring-4 focus:ring-leaf-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-100 disabled:bg-stone-100';

interface FieldWrapperProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function FieldWrapper({ id, label, error, hint, children }: FieldWrapperProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-stone-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-stone-500">{hint}</p>
      )}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, className, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const id = rest.id ?? generatedId;
  return (
    <FieldWrapper id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(CONTROL, className)}
        {...rest}
      />
    </FieldWrapper>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  children: ReactNode;
}

export function SelectField({ label, error, className, children, ...rest }: SelectFieldProps) {
  const generatedId = useId();
  const id = rest.id ?? generatedId;
  return (
    <FieldWrapper id={id} label={label} error={error}>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={cn(CONTROL, 'appearance-none', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldWrapper>
  );
}
