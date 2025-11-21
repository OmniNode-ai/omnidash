import React from 'react';
import { cn } from '@/lib/utils';

interface ModuleProps {
  className?: string;
  children: React.ReactNode;
}

export function Module({ className, children }: ModuleProps) {
  return (
    <div className={cn('bg-card border border-border rounded-lg h-full flex flex-col', className)}>
      {children}
    </div>
  );
}

interface ModuleHeaderProps {
  className?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function ModuleHeader({ className, left, right }: ModuleHeaderProps) {
  return (
    <div
      className={cn(
        'h-11 px-4 border-b border-border flex items-center justify-between',
        className
      )}
    >
      <div className="text-sm font-semibold truncate">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

interface ModuleBodyProps {
  className?: string;
  children: React.ReactNode;
}

export function ModuleBody({ className, children }: ModuleBodyProps) {
  return <div className={cn('flex-1 overflow-auto p-4', className)}>{children}</div>;
}

interface ModuleFooterProps {
  className?: string;
  children?: React.ReactNode;
}

export function ModuleFooter({ className, children }: ModuleFooterProps) {
  if (!children) return null;
  return (
    <div
      className={cn('px-4 py-2 border-t border-border text-xs text-muted-foreground', className)}
    >
      {children}
    </div>
  );
}
