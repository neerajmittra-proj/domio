'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TenancyStatus } from '@prisma/client';
import {
  tenancyStatusBadgeClass,
  tenancyStatusLabel,
  formatMoney,
  formatDate,
} from '@/lib/tenancy-types';

export type HistoryRow = {
  id: string;
  status: TenancyStatus;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  unitName: string;
  unitNumber: string;
  unitHref: string;
};

export default function TenancyHistory({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function terminate(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/tenancies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'TERMINATED' }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Failed to terminate. Please try again.');
    }
    setBusyId(null);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center shadow-xs">
        <p className="text-sm font-medium text-zinc-500">No tenancies recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {error && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-100/90 border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-700">
          <tr>
            <th className="px-5 py-3.5 font-bold">Unit</th>
            <th className="px-5 py-3.5 font-bold">Dates</th>
            <th className="px-5 py-3.5 font-bold">Rent</th>
            <th className="px-5 py-3.5 font-bold">Status</th>
            <th className="px-5 py-3.5 text-right font-bold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {rows.map((r, i) => (
            <tr
              key={r.id}
              className={
                (i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/70') +
                ' transition-colors hover:bg-zinc-100/80'
              }
            >
              <td className="px-5 py-3.5 font-bold text-zinc-900">
                <Link href={r.unitHref} className="transition-colors hover:text-indigo-600 hover:underline">
                  Unit {r.unitNumber} — {r.unitName}
                </Link>
              </td>
              <td className="px-5 py-3.5 text-zinc-600 font-mono text-xs font-semibold">
                {formatDate(r.startDate)} → {formatDate(r.endDate)}
              </td>
              <td className="px-5 py-3.5 font-bold text-zinc-900 tabular-nums">
                {formatMoney(r.monthlyRent)}/mo
              </td>
              <td className="px-5 py-3.5">
                <span
                  className={
                    'inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold shadow-xs ' +
                    tenancyStatusBadgeClass(r.status)
                  }
                >
                  {tenancyStatusLabel(r.status)}
                </span>
              </td>
              <td className="px-5 py-3.5 text-right">
                {r.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    onClick={() => terminate(r.id)}
                    disabled={busyId === r.id}
                    className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 transition-all hover:bg-red-100 hover:border-red-300 active:scale-95 shadow-xs disabled:opacity-50"
                  >
                    {busyId === r.id ? 'Terminating…' : 'Terminate'}
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400 font-medium">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
