'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function FunnelChart({
  applied,
  interview,
  offer,
}: {
  applied: number;
  interview: number;
  offer: number;
}) {
  const data = [
    { stage: 'Applied', count: applied },
    { stage: 'Interview', count: interview },
    { stage: 'Offer', count: offer },
  ];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 32 }}>
          <XAxis type="number" allowDecimals={false} />
          <YAxis dataKey="stage" type="category" />
          <Tooltip />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
