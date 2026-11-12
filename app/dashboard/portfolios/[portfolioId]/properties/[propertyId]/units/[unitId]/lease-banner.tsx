'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export type LeaseBannerState = 'vacant' | 'active' | 'expiring' | 'expired';

const STYLES: Record<LeaseBannerState, string> = {
  active:
    'border-[rgba(164,71,61,0.3)] bg-[rgba(164,71,61,0.1)] text-[#8D3B32]',
  expiring:
    'border-[rgba(232,160,32,0.3)] bg-[rgba(232,160,32,0.1)] text-[#B26A0B]',
  expired: 'border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] text-red-700',
  vacant:
    'border-[rgba(34,49,68,0.12)] bg-[rgba(255,255,255,0.5)] text-[#3E5560]',
};

export default function LeaseBanner({
  state,
  tenantName,
  startDate,
  endDate,
  daysRemaining,
  assignHref,
}: {
  state: LeaseBannerState;
  tenantName: string | null;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number;
  assignHref: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={
        'flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-sm font-medium ' +
        STYLES[state]
      }
    >
      {state === 'vacant' ? (
        <>
          <span>Vacant — no active lease. Click to assign a tenant.</span>
          <Link
            href={assignHref}
            className="min-h-[44px] rounded-full border border-[#8D3B32]/50 bg-[#A4473D] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#8D3B32]"
          >
            Assign Tenant
          </Link>
        </>
      ) : state === 'expired' ? (
        <span>
          🚨 Lease EXPIRED · {tenantName} · Ended {endDate} · Please renew or
          terminate
        </span>
      ) : state === 'expiring' ? (
        <span>
          ⚠️ Lease expiring soon · {tenantName} · {daysRemaining} days remaining
        </span>
      ) : (
        <span>
          Leased to {tenantName} · {startDate} → {endDate} · {daysRemaining} days
          remaining
        </span>
      )}
    </motion.div>
  );
}
