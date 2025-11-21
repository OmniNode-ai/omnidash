import React from 'react';

export function LegacySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="ty-title px-1">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
