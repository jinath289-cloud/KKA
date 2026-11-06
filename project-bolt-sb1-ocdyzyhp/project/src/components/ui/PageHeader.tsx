import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-base text-stone-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
