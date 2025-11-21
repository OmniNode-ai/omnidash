import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Legacy metric tile captured for reuse/migration
export function LegacyMetricTile({
  label,
  value,
  suffix,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="ty-subtitle">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold ty-body">
          {value}
          {suffix ? <span className="text-sm ty-meta ml-1">{suffix}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

// Legacy list row pattern
export function LegacyListRow({
  title,
  meta,
  right,
}: {
  title: string;
  meta?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div>
        <div className="font-medium ty-body">{title}</div>
        {meta ? <div className="ty-meta">{meta}</div> : null}
      </div>
      {right}
    </div>
  );
}
