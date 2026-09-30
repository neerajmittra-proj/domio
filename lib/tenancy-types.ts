// Pure, client-safe tenancy helpers (no Prisma runtime import).
import type { TenancyStatus } from '@prisma/client';

export const TENANCY_STATUSES: { value: TenancyStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'TERMINATED', label: 'Terminated' },
];

const STATUS_LABELS: Record<TenancyStatus, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
};

// AverIQ / Domio status badges — high contrast for human readability.
const STATUS_BADGE: Record<TenancyStatus, string> = {
  ACTIVE: 'border border-emerald-300 bg-emerald-50 text-emerald-800 font-bold',
  EXPIRED: 'border border-zinc-300 bg-zinc-100 text-zinc-700 font-semibold',
  TERMINATED: 'border border-red-200 bg-red-50 text-red-700 font-semibold',
};

export function tenancyStatusLabel(status: TenancyStatus): string {
  return STATUS_LABELS[status];
}

export function tenancyStatusBadgeClass(status: TenancyStatus): string {
  return STATUS_BADGE[status];
}

export function isTenancyStatus(value: unknown): value is TenancyStatus {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(STATUS_LABELS, value)
  );
}

const moneyFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function formatMoney(amount: number): string {
  return moneyFmt.format(amount);
}

export function formatDate(date: Date | string): string {
  return dateFmt.format(new Date(date));
}
