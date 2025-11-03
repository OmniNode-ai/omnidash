import React from 'react';

export function MockDataBadge({ label = "Mock Data Active", className = '' }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs bg-yellow-500/10 border-yellow-500/30 text-yellow-400 ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
      {label}
    </span>
  );
}






