import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'green' | 'amber' | 'red' | 'stone';

const TONES: Record<Tone, string> = {
  green: 'bg-leaf-100 text-leaf-900',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-800',
  stone: 'bg-stone-200 text-stone-800',
};

export function Badge({ tone = 'stone', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold', TONES[tone])}>
      {children}
    </span>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-leaf-50 text-leaf-700">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h3 className="text-lg font-bold text-stone-900">{title}</h3>
      {description && <p className="max-w-sm text-base text-stone-600">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-24 animate-pulse rounded-2xl bg-stone-200" />
      ))}
    </div>
  );
}
