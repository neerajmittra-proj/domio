'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import type { Role } from '@prisma/client';
import GlobalSearchBar from '@/components/search/global-search-bar';
import VerifyAccountModal from '@/components/auth/verify-account-modal';
import Logo from '@/components/brand/logo';
import { PART2_ENABLED } from '@/lib/features';

function getInitials(name: string, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default function DomioHeader({
  role,
  email,
  name,
  signOutAction,
}: {
  role: Role;
  email: string;
  name?: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  const initials = getInitials(name ?? '', email);

  // Poll incoming privacy requests count
  useEffect(() => {
    async function fetchPending() {
      try {
        const res = await fetch('/api/privacy-requests');
        if (res.ok) {
          const data = await res.json();
          setPendingCount(data.pendingCount ?? 0);
        }
      } catch {/* ignore */}
    }
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menus on navigation
  useEffect(() => {
    setDropdownOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#DCE9EC] bg-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Left: Brand Logo */}
        <Link href="/dashboard" className="flex shrink-0 items-center" aria-label="Domio home">
          <Logo variant="horizontal" height={36} priority />
        </Link>

        {/* Center: Global Owner & Agent Search Bar */}
        {PART2_ENABLED ? (
          <div className="hidden sm:flex flex-1 max-w-lg">
            <GlobalSearchBar />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Right: Requests Bell + User Menu Pill */}
        <div className="flex items-center gap-2">
          {PART2_ENABLED && (<>{/* Requests Inbox Bell */}
          <Link
            href="/dashboard/requests"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500 transition-all hover:border-zinc-300 hover:bg-card hover:text-zinc-900"
            aria-label="Privacy Requests Inbox"
            title="Requests Inbox"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white shadow">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </Link></>)}

          {/* User Menu Pill Dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-full border border-[#DCE9EC] bg-card p-1.5 pl-3.5 transition-shadow hover:shadow-md active:scale-95"
              aria-label="User menu"
              aria-expanded={dropdownOpen}
            >
              {/* 3-bar hamburger icon inside the pill */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
              {/* Circular Avatar */}
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-grad font-sans text-xs font-semibold text-white">
                {initials}
              </div>
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-[#DCE9EC] bg-card p-2 shadow-2xl z-50">
                <div className="border-b border-zinc-100 px-3.5 py-3">
                  <p className="font-semibold text-sm text-zinc-900 truncate">
                    {name || email.split('@')[0]}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{email}</p>
                  <span className="mt-1.5 inline-block rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">
                    {role}
                  </span>
                </div>

                <div className="py-1.5">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>🏠</span> Home Overview
                  </Link>
<Link
                    href="/dashboard/rent"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>💰</span> Rent Ledger
                  </Link>
                  <Link
                    href="/dashboard/tenants"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>👥</span> Tenants
                  </Link>
                  {PART2_ENABLED && (<>
                  <Link
                    href="/dashboard/requests"
                    className="flex items-center justify-between gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span className="flex items-center gap-2.5"><span>🔔</span> Privacy Requests</span>
                    {pendingCount > 0 && (
                      <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    href="/dashboard/search"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>🔍</span> Property Search & Map
                  </Link>
                  </>)}
                  <Link
                    href="/dashboard/portfolios"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>🏢</span> Properties & Units
                  </Link>
                  <Link
                    href="/dashboard/utilities"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>⚡</span> Utility Tracking
                  </Link>
                  <Link
                    href="/dashboard/documents"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>📁</span> Document Vault
                  </Link>
                  <Link
                    href="/dashboard/reports"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>📊</span> Reports & Statements
                  </Link>
                  <Link
                    href="/dashboard/expenses"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>🧾</span> Expenses & Repairs
                  </Link>
                  {role === 'OWNER' && (
                    <Link
                      href="/dashboard/import"
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                    >
                      <span>📥</span> Import Data
                    </Link>
                  )}
                  <Link
                    href="/dashboard/ai-assistant"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>🤖</span> Ask Domi AI
                  </Link>
                  {PART2_ENABLED && (<><Link
                    href="/dashboard/agents"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>🤝</span> Hire an Agent
                  </Link>
                  <Link
                    href="/dashboard/agent"
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <span>🧑‍💼</span> Work as Agent
                  </Link></>)}
                  {role === 'OWNER' && (
                    <Link
                      href="/dashboard/managers"
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                    >
                      <span>🧑‍🔧</span> Managers
                    </Link>
                  )}
                  {role === 'SUPER_ADMIN' && (
                    <>
                      <Link
                        href="/dashboard/owners"
                        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                      >
                        <span>🏠</span> Property Owners
                      </Link>
                      <Link
                        href="/dashboard/admin/managers"
                        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                      >
                        <span>🧑‍🔧</span> Managers
                      </Link>
                    </>
                  )}
                  {(role === 'OWNER' || role === 'SUPER_ADMIN' || role === 'MANAGER') && (
                    <Link
                      href="/dashboard/audit-log"
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                    >
                      <span>🕒</span> Audit Log
                    </Link>
                  )}
                  {role === 'OWNER' && (
                    <Link
                      href="/dashboard/settings/notifications"
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                    >
                      <span>⚙️</span> Settings
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      setVerifyModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 transition-colors mt-1"
                  >
                    <span>🛡️</span> Verify Gmail / Phone (OTP)
                  </button>
                </div>

                <div className="border-t border-zinc-100 pt-1.5">
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <span>🚪</span> Log out
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Verify Account Modal */}
      <VerifyAccountModal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
      />
    </header>
  );
}
