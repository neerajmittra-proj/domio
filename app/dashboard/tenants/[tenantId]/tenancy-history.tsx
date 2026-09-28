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
      <div className="rounded-2xl border border-dashed border-violet-500/30 bg-gradient-to-br from-[#1a1535] to-[#12102a] p-10 text-center">
        <p className="text-sm text-violet-300/50">No tenancies yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-violet-500/20 shadow-xl shadow-violet-900/20">
      {error && (
        <p role="alert" className="border-b border-red-400/20 bg-red-400/10 px-5 py-2.5 text-sm font-medium text-red-300">
          {error}
        </p>
      )}
      <table className="w-full text-left text-sm">
        <thead className="bg-gradient-to-r from-[#1e1a40] to-[#181630] text-xs uppercase tracking-widest text-violet-400">
          <tr>
            <th className="px-5 py-4 font-bold">Unit</th>
            <th className="px-5 py-4 font-bold">Dates</th>
            <th className="px-5 py-4 font-bold">Rent</th>
            <th className="px-5 py-4 font-bold">Status</th>
            <th className="px-5 py-4 text-right font-bold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r, i) => (
            <tr
              key={r.id}
              className={
                (i % 2 === 0 ? 'bg-[#0f0d24]' : 'bg-[#120f28]') +
                ' transition-colors hover:bg-violet-500/10'
              }
            >
              <td className="px-5 py-3.5 font-semibold text-white">
                <Link href={r.unitHref} className="transition-colors hover:text-violet-300">
                  Unit {r.unitNumber} — {r.unitName}
                </Link>
              </td>
              <td className="px-5 py-3.5 text-violet-200/60 font-mono text-xs">
                {formatDate(r.startDate)} → {formatDate(r.endDate)}
              </td>
              <td className="px-5 py-3.5 font-semibold text-indigo-300">
                {formatMoney(r.monthlyRent)}/mo
              </td>
              <td className="px-5 py-3.5">
                <span
                  className={
                    'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
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
                    className="rounded-full border border-red-400/40 bg-red-400/10 px-3 py-1 text-xs font-semibold text-red-300 transition-all hover:bg-red-400/20 hover:border-red-300/60 disabled:opacity-60"
                  >
                    {busyId === r.id ? 'Terminating…' : 'Terminate'}
                  </button>
                ) : (
                  <span className="text-xs text-white/20">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
