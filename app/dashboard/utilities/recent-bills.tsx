'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UtilityBillListItem } from '@/lib/utilities';
import { billStatusBadgeClass, billStatusLabel } from '@/lib/utility-types';
import { formatMoney, formatDate } from '@/lib/tenancy-types';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import {
  PAYMENT_METHODS,
  DEFAULT_PAYMENT_METHOD,
  paymentMethodIcon,
  paymentMethodLabel,
} from '@/lib/payment-method-types';

const inputClass =
  'rounded-lg border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-3 py-2 text-sm text-[#223144] outline-none transition placeholder:text-[#7A929C] focus:border-zinc-700 focus:ring-2 focus:ring-zinc-500/20';
const labelClass = 'text-sm font-medium text-[#223144]';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function RecentBills({
  bills,
}: {
  bills: UtilityBillListItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(bills);
  const [target, setTarget] = useState<UtilityBillListItem | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(bills);
  }, [bills]);

  // Lock scroll + close on Escape while the payment modal is open.
  useScrollLock(!!target);
  useEffect(() => {
    if (!target) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [target, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeModal() {
    if (pending) return;
    setTarget(null);
    setError(null);
  }

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    setPending(true);
    setError(null);
    const d = new FormData(event.currentTarget);
    const res = await fetch(`/api/utility-bills/${target.id}/pay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountPaid: d.get('amountPaid'),
        paymentDate: d.get('paymentDate'),
        paymentMethod: d.get('paymentMethod'),
      }),
    });
    if (res.ok) {
      setTarget(null);
      router.refresh();
    } else {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? 'Failed to record payment. Please try again.');
    }
    setPending(false);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#C2D9E0] bg-[#FFFFFF] p-12 text-center">
        <p className="text-sm text-[#223144]">No bills yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-[#DCE9EC]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#EAF2F4] text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">Due Date</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Amount Paid</th>
              <th className="px-4 py-3 font-medium">Method</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCE9EC]">
            {items.map((b, i) => {
              const canPay = b.status !== 'PAID';
              return (
                <tr
                  key={b.id}
                  className={
                    i % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[rgba(34,49,68,0.035)]'
                  }
                >
                  <td className="px-4 py-3 font-medium text-[#223144]">
                    {b.accountLabel}
                  </td>
                  <td className="px-4 py-3 text-[#3E5560]">{b.propertyName}</td>
                  <td className="px-4 py-3 text-[#3E5560]">
                    {formatDate(b.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-[#3E5560]">
                    {formatMoney(b.amount)}
                  </td>
                  <td className="px-4 py-3 text-[#3E5560]">
                    {b.amountPaid > 0 ? formatMoney(b.amountPaid) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[#3E5560]">
                    {b.paymentMethod ? (
                      <span title={paymentMethodLabel(b.paymentMethod)}>
                        {paymentMethodIcon(b.paymentMethod)}{' '}
                        {paymentMethodLabel(b.paymentMethod)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                        billStatusBadgeClass(b.status)
                      }
                    >
                      {billStatusLabel(b.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canPay ? (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setTarget(b);
                        }}
                        className="rounded-full border border-zinc-300 bg-brand-grad px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-grad-hover"
                      >
                        Record Payment
                      </button>
                    ) : (
                      <span className="text-xs text-[#5B7280]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {target && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitPayment}
            className="w-full max-w-sm rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF] p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold tracking-tight text-[#223144]">
              Record Payment
            </h2>
            <p className="mt-1 mb-4 text-sm text-[#3E5560]">
              {target.accountLabel} · {formatMoney(target.amount)} due
            </p>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ub-amount" className={labelClass}>
                  Amount Paid
                </label>
                <input
                  id="ub-amount"
                  name="amountPaid"
                  type="number"
                  min="0.01"
                  max={Math.round((target.amount - target.amountPaid) * 100) / 100}
                  step="any"
                  required
                  defaultValue={Math.round((target.amount - target.amountPaid) * 100) / 100}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ub-date" className={labelClass}>
                  Payment Date
                </label>
                <input
                  id="ub-date"
                  name="paymentDate"
                  type="date"
                  required
                  defaultValue={today()}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ub-method" className={labelClass}>
                  Payment Method
                </label>
                <select
                  id="ub-method"
                  name="paymentMethod"
                  defaultValue={DEFAULT_PAYMENT_METHOD}
                  className={inputClass}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={pending}
                className="rounded-full border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-4 py-2 text-sm font-medium text-[#223144] transition-colors hover:text-[#223144] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-brand-grad px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
