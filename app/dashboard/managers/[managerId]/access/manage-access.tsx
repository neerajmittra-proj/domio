'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { OwnerStructure } from '@/lib/expenses';
import type { ManagerAccessRecord } from '@/lib/managers';

const glassCard =
  'rounded-2xl border border-[rgba(164,71,61,0.15)] bg-[rgba(255,255,255,0.88)] p-5 backdrop-blur-md shadow-[0_4px_20px_rgba(34,49,68,0.10)]';
const sectionLabel =
  'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D3B32]';
const inputClass =
  'w-full rounded-lg border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-3 py-2 text-sm text-[#223144] outline-none transition focus:border-[#A4473D] focus:ring-2 focus:ring-[#A4473D]/20';

export default function ManageAccess({
  managerId,
  managerName,
  managerDisplayId,
  records,
  structure,
}: {
  managerId: string;
  managerName: string;
  managerDisplayId: string | null;
  records: ManagerAccessRecord[];
  structure: OwnerStructure;
}) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [level, setLevel] = useState<'VIEW' | 'EDIT'>('VIEW');
  const [rentEdit, setRentEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedPortfolioProps = structure.flatMap((p) => p.properties);
  const selectedProperty = selectedPortfolioProps.find(
    (pr) => pr.id === propertyId,
  );

  async function grant() {
    setError(null);
    if (!propertyId) {
      setError('Choose a property.');
      return;
    }
    setBusy(true);
    const body = unitId
      ? { subPropertyId: unitId, accessLevel: level, canEditRentLedger: rentEdit }
      : { propertyId, accessLevel: level, canEditRentLedger: rentEdit };
    const res = await fetch(`/api/managers/${managerId}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setPropertyId('');
      setUnitId('');
      setLevel('VIEW');
      setRentEdit(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? 'Failed to grant access.');
    }
    setBusy(false);
  }

  async function toggleRent(rec: ManagerAccessRecord) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/managers/${managerId}/access/${rec.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canEditRentLedger: !rec.canEditRentLedger }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Failed to update rent-ledger rights.');
      }
      setNotice(
        `Rent-ledger editing ${!rec.canEditRentLedger ? 'enabled' : 'disabled'} for ${rec.label}.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(rec: ManagerAccessRecord) {
    if (!confirm(`Remove access to ${rec.label}?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const qs = rec.subPropertyId
        ? `subPropertyId=${rec.subPropertyId}`
        : `propertyId=${rec.propertyId}`;
      const res = await fetch(`/api/managers/${managerId}/access?${qs}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Failed to revoke access.');
      }
      setNotice(`Access to ${rec.label} removed.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke access.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/managers"
        className="text-sm text-[#3E5560] transition-colors hover:text-[#223144]"
      >
        ← Back to Managers
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#223144]">
        Managing access for {managerName}
        {managerDisplayId && (
          <span className="ml-2 font-mono text-sm text-[#5B7280]">
            {managerDisplayId}
          </span>
        )}
      </h1>

      {/* Assigned */}
      <div className={glassCard + ' mt-6'}>
        <p className={sectionLabel}>Assigned Properties</p>
        {notice && (
          <p className="mt-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {records.length === 0 ? (
          <p className="mt-3 text-sm text-[#3E5560]">
            No access granted yet. Assign a property or unit below.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[rgba(164,71,61,0.15)]">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-[rgba(164,71,61,0.1)] text-xs uppercase tracking-wide text-[#8D3B32]">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium">Rent Ledger</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(164,71,61,0.1)]">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-[#223144]">{r.label}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[#5B7280]">
                      {r.displayId ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                          (r.accessLevel === 'EDIT'
                            ? 'border border-[#A4473D]/30 bg-[#A4473D]/15 text-[#8D3B32]'
                            : 'border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] text-[#3E5560]')
                        }
                      >
                        {r.accessLevel === 'EDIT' ? 'Edit' : 'View'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleRent(r)}
                        disabled={busy}
                        title={
                          r.canEditRentLedger
                            ? 'Rent-ledger editing allowed — click to disable'
                            : 'Click to allow rent-ledger editing'
                        }
                        className={
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ' +
                          (r.canEditRentLedger
                            ? 'border border-green-500/30 bg-green-500/15 text-green-700 hover:bg-green-500/25'
                            : 'border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] text-[#3E5560] hover:text-[#223144]')
                        }
                      >
                        {r.canEditRentLedger ? 'Can edit' : '—'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => revoke(r)}
                        disabled={busy}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign new */}
      <div className={glassCard + ' mt-4'}>
        <p className={sectionLabel}>Assign New Access</p>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#223144]">Property</label>
            <select
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setUnitId('');
              }}
              className={inputClass}
            >
              <option value="">Select property…</option>
              {structure.map((pf) => (
                <optgroup key={pf.id} label={pf.name}>
                  {pf.properties.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#223144]">
              Unit <span className="text-[#3E5560]">(optional — leave blank for whole property)</span>
            </label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!selectedProperty}
              className={inputClass + (!selectedProperty ? ' opacity-60' : '')}
            >
              <option value="">All units in property</option>
              {selectedProperty?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  Unit {u.unitNumber} — {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#223144]">Level</label>
            <div className="flex gap-2">
              {(['VIEW', 'EDIT'] as const).map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => {
                    setLevel(lv);
                    // Match the API default: granting EDIT pre-checks rent-ledger.
                    setRentEdit(lv === 'EDIT');
                  }}
                  className={
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                    (level === lv
                      ? 'border border-[#8D3B32]/50 bg-[#A4473D] text-white'
                      : 'border border-[#C2D9E0] bg-[rgba(255,255,255,0.5)] text-[#3E5560] hover:text-[#223144]')
                  }
                >
                  {lv === 'VIEW' ? 'View Only' : 'View & Edit'}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={rentEdit}
              onChange={(e) => setRentEdit(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] accent-[#A4473D]"
            />
            <span className="text-sm text-[#223144]">
              Can edit the Rent Ledger
              <span className="mt-0.5 block text-xs text-[#3E5560]">
                Allows adding, editing and deleting rent charges, payments and
                monthly rent records for this assignment. All changes are
                recorded in the audit log.
              </span>
            </span>
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div>
            <Button
              variant="primary"
              size="lg"
              onClick={grant}
              disabled={busy}
            >
              Grant Access
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
