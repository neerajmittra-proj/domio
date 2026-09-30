'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

type Initial = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  location?: string | null;
  nationalId: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
};

const inputClass =
  'rounded-xl border border-zinc-300 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-900 shadow-2xs outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10';
const labelClass = 'text-xs font-bold uppercase tracking-wider text-zinc-700';
const optional = <span className="text-zinc-400 text-xs font-normal lowercase">(optional)</span>;

function Field({
  id,
  label,
  type = 'text',
  required = false,
  defaultValue,
  opt = false,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  opt?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label} {opt ? optional : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ''}
        className={inputClass}
      />
    </div>
  );
}

type ActiveTenancy = {
  id: string;
  monthlyRent: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  paymentDayOfMonth: number;
};

type FoundTenant = {
  id: string;
  username: string;
  name: string;
  phone: string;
  email: string | null;
  nationalId: string | null;
};

export default function TenantForm({
  mode,
  tenant,
  activeTenancy = null,
}: {
  mode: 'create' | 'edit';
  tenant?: Initial;
  activeTenancy?: ActiveTenancy | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [addMode, setAddMode] = useState<'username' | 'manual'>('username');

  // Username lookup states
  const [usernameInput, setUsernameInput] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [foundTenant, setFoundTenant] = useState<FoundTenant | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ── Lookup tenant by username ──────────────────────────────────────────────
  async function handleLookupUsername(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!usernameInput.trim()) return;

    setError(null);
    setLookingUp(true);
    setFoundTenant(null);

    try {
      const clean = usernameInput.trim().toLowerCase().replace(/^@/, '');
      const res = await fetch(`/api/tenants/by-username/${encodeURIComponent(clean)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `No registered tenant found with handle "@${clean}".`);
        return;
      }

      setFoundTenant(data.tenant);
    } catch {
      setError('Failed to lookup username. Please try again.');
    } finally {
      setLookingUp(false);
    }
  }

  // ── Submit username link ───────────────────────────────────────────────────
  async function handleAddByUsername(e: React.FormEvent) {
    e.preventDefault();
    if (!foundTenant) return;

    setError(null);
    setPending(true);

    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: foundTenant.username }),
      });

      if (res.ok) {
        setSuccess(true);
        const data = await res.json().catch(() => null);
        const tenantId = data?.id || foundTenant.id;
        setTimeout(() => {
          router.push(`/dashboard/tenants/${tenantId}/assign`);
          router.refresh();
        }, 800);
        return;
      }

      const json = await res.json().catch(() => null);
      setError(json?.error ?? 'Could not add tenant.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setPending(false);
    }
  }

  // ── Submit manual tenant creation / edit ───────────────────────────────────
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Validate passwords match when creating
    if (mode === 'create' && password && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (mode === 'create' && password && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setPending(true);

    const d = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      name: d.get('name'),
      email: d.get('email'),
      phone: d.get('phone'),
      location: d.get('location'),
      nationalId: d.get('nationalId'),
      emergencyContactName: d.get('emergencyContactName'),
      emergencyContactPhone: d.get('emergencyContactPhone'),
      bankAccountNumber: d.get('bankAccountNumber'),
      bankName: d.get('bankName'),
    };

    // Only send password on create and only if provided
    if (mode === 'create' && password) {
      payload.password = password;
    }

    const res = await fetch(
      mode === 'edit' ? `/api/tenants/${tenant!.id}` : '/api/tenants',
      {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (res.ok && mode === 'edit' && activeTenancy) {
      const tRes = await fetch(`/api/tenancies/${activeTenancy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyRent: Number(d.get('monthlyRent')),
          startDate: d.get('startDate'),
          endDate: d.get('endDate'),
          paymentDayOfMonth: Number(d.get('paymentDayOfMonth')),
        }),
      });
      if (!tRes.ok) {
        const j = await tRes.json().catch(() => null);
        setError(j?.error ?? 'Could not save tenancy details.');
        setPending(false);
        return;
      }
    }

    if (res.ok) {
      setSuccess(true);
      const data = await res.json().catch(() => null);
      const createdId = data?.id ?? tenant?.id;
      setTimeout(() => {
        if (mode === 'create' && createdId) {
          router.push(`/dashboard/tenants/${createdId}/assign`);
        } else {
          const qs = searchParams.toString();
          router.push(`/dashboard/tenants${qs ? '?' + qs : ''}`);
        }
        router.refresh();
      }, 800);
      return;
    }
    const json = await res.json().catch(() => null);
    setError(json?.error ?? 'Something went wrong. Please try again.');
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Mode Switcher when creating new tenant */}
      {mode === 'create' && (
        <div className="flex rounded-xl border border-zinc-200 bg-zinc-100 p-1">
          <button
            type="button"
            onClick={() => { setAddMode('username'); setError(null); }}
            className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
              addMode === 'username'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            ⚡ Add by Registered Username
          </button>
          <button
            type="button"
            onClick={() => { setAddMode('manual'); setError(null); }}
            className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
              addMode === 'manual'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            📝 Manual Details Entry
          </button>
        </div>
      )}

      {mode === 'create' && addMode === 'username' ? (
        <div className="flex flex-col gap-5">
          <form onSubmit={handleLookupUsername} className="flex flex-col gap-3">
            <label htmlFor="lookup-username" className={labelClass}>
              Tenant Registered Username Handle
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1 items-center">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-zinc-500 font-bold">@</span>
                <input
                  id="lookup-username"
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="john_doe"
                  className={inputClass + ' pl-8 w-full font-mono'}
                />
              </div>
              <button
                type="submit"
                disabled={lookingUp}
                className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-bold text-white transition-all hover:bg-zinc-800 disabled:opacity-60 shadow-xs"
              >
                {lookingUp ? 'Searching…' : 'Find Tenant'}
              </button>
            </div>
            <p className="text-xs text-zinc-500 font-medium">
              Ask your tenant for their self-registered username handle (e.g. @john_doe).
            </p>
          </form>

          {foundTenant && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    Registered Tenant Verified ✓
                  </span>
                  <h3 className="mt-2 text-lg font-bold text-zinc-900">{foundTenant.name}</h3>
                  <p className="font-mono text-xs font-semibold text-zinc-600">@{foundTenant.username}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-600 border-t border-emerald-200 pt-3">
                <div>Phone: <span className="font-bold text-zinc-900">{foundTenant.phone}</span></div>
                <div>Email: <span className="font-bold text-zinc-900">{foundTenant.email ?? '—'}</span></div>
              </div>

              <form onSubmit={handleAddByUsername} className="mt-4">
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-xl bg-zinc-900 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-60 active:scale-[0.99]"
                >
                  {pending ? 'Linking Tenant…' : `Link @${foundTenant.username} to My Portfolio →`}
                </button>
              </form>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              ✓ Registered tenant linked successfully!
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field id="name" label="Full Name" required defaultValue={tenant?.name} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="phone" label="Phone" type="tel" required defaultValue={tenant?.phone} />
            <Field id="email" label="Email" type="email" opt defaultValue={tenant?.email ?? ''} />
          </div>
          <Field id="location" label="Location / Address" opt defaultValue={tenant?.location ?? ''} />
          <Field id="nationalId" label="National ID" opt defaultValue={tenant?.nationalId ?? ''} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="emergencyContactName" label="Secondary Contact Name" opt defaultValue={tenant?.emergencyContactName ?? ''} />
            <Field id="emergencyContactPhone" label="Secondary Contact Phone" type="tel" opt defaultValue={tenant?.emergencyContactPhone ?? ''} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="bankAccountNumber" label="Bank Account Number" opt defaultValue={tenant?.bankAccountNumber ?? ''} />
            <Field id="bankName" label="Bank Name" opt defaultValue={tenant?.bankName ?? ''} />
          </div>

          {/* Portal password — only shown when creating a new tenant */}
          {mode === 'create' && (
            <div className="mt-2 border-t border-zinc-200 pt-4">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
                  Tenant Portal Access
                </h2>
                <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                  Optional
                </span>
              </div>
              <p className="mb-3 text-xs text-zinc-600 font-medium">
                Set a password so this tenant can log in to the Tenant Portal immediately at{' '}
                <span className="font-mono text-zinc-800 font-semibold bg-zinc-100 px-1 py-0.5 rounded border border-zinc-200">/tenant-portal/login</span>{' '}
                using their email address. If left blank, they can still log in via Phone OTP.
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className={labelClass}>Portal Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
                {password && (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>Confirm Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      className={
                        inputClass +
                        (confirmPassword && confirmPassword !== password
                          ? ' border-red-500'
                          : '')
                      }
                    />
                    {confirmPassword && confirmPassword !== password && (
                      <p className="text-xs font-semibold text-red-600">Passwords do not match</p>
                    )}
                    {confirmPassword && confirmPassword === password && (
                      <p className="text-xs font-semibold text-emerald-600">✓ Passwords match</p>
                    )}
                  </div>
                )}
              </div>
              {password && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5">
                  <span className="text-sm">🔑</span>
                  <p className="text-xs font-medium text-indigo-900">
                    Tenant will be able to log in at{' '}
                    <span className="font-mono font-bold">/tenant-portal/login</span>{' '}
                    using their email and this password immediately.
                  </p>
                </div>
              )}
            </div>
          )}

          {mode === 'edit' && (
            <div className="mt-2 border-t border-zinc-200 pt-4" data-testid="tenancy-details">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-800">
                Tenancy Details
              </h2>
              {activeTenancy ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="monthlyRent" label="Monthly Rent (₹)" type="number" required defaultValue={String(activeTenancy.monthlyRent)} />
                    <Field id="paymentDayOfMonth" label="Payment Day (1–31)" type="number" required defaultValue={String(activeTenancy.paymentDayOfMonth)} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="startDate" label="Lease Start Date" type="date" required defaultValue={activeTenancy.startDate} />
                    <Field id="endDate" label="Lease End Date" type="date" required defaultValue={activeTenancy.endDate} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 font-medium" data-testid="no-active-tenancy">
                  No active tenancy — use{' '}
                  <span className="font-bold text-zinc-800">Assign to Unit</span> to
                  create one.
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              ✓ Tenant saved successfully
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800 active:scale-95 disabled:opacity-50"
          >
            {pending ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Tenant'}
          </button>
        </form>
      )}
    </div>
  );
}
