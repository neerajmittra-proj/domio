import type { TenancyStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getArrearsByTenancy } from '@/lib/arrears';
import type { ManagerScope } from '@/lib/manager-access';

// Tenants a manager may see: those with a tenancy in a unit / property they
// were granted, plus (when they hold any EDIT grant, so they can assign) the
// owner's tenants that have no tenancy yet.
export function managerTenantWhere(scope: ManagerScope): Prisma.TenantWhereInput {
  const canEdit = scope.editSubPropertyIds.size > 0 || scope.editPropertyIds.size > 0;
  return {
    OR: [
      { id: { in: scope.tenantIds } },
      { tenancies: { some: { rentableEntity: { propertyId: { in: scope.propertyIds } } } } },
      ...(canEdit ? [{ tenancies: { none: {} } }] : []),
    ],
  };
}

// A manager may edit a tenant only if the tenant leases a unit they can EDIT.
export async function managerCanEditTenant(
  scope: ManagerScope,
  tenantId: string,
): Promise<boolean> {
  const editSubs = [...scope.editSubPropertyIds];
  const editProps = [...scope.editPropertyIds];
  if (!editSubs.length && !editProps.length) return false;
  const hit = await prisma.tenancy.findFirst({
    where: {
      tenantId,
      OR: [
        ...(editSubs.length ? [{ subPropertyId: { in: editSubs } }] : []),
        ...(editProps.length
          ? [{ rentableEntity: { propertyId: { in: editProps } } }]
          : []),
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

export type TenantPaymentStatus =
  | 'PAID'
  | 'PARTIAL'
  | 'UNPAID'
  | 'OVERDUE'
  | 'NO_LEASE';

export type TenantListItem = {
  id: string;
  displayId: string | null;
  name: string;
  email: string | null;
  phone: string;
  location: string | null;
  nationalId: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  rentReminderEnabled: boolean;
  documentCount: number;
  totalPaid: number;
  remainingRent: number;
  paidStatus: TenantPaymentStatus;
  overdueAmount: number;
  currentTenancy: {
    id: string;
    status: TenancyStatus;
    unitName: string;
    unitNumber: string;
    monthlyRent: number;
    currentBalance: number; // negative = owed
    startDate: Date;
    endDate: Date;
  } | null;
};

// Tenants owned by a user, newest first, each with their current (ACTIVE) unit.
// `subPropertyIds` (managers) restricts to tenants with a tenancy in those units.
export async function listTenantsForOwner(
  ownerId: string,
  subPropertyIds?: string[],
  role?: string,
): Promise<TenantListItem[]> {
  const whereClause =
    role === 'SUPER_ADMIN'
      ? {}
      : {
          ownerId,
          ...(subPropertyIds
            ? {
                tenancies: {
                  some: { subPropertyId: { in: subPropertyIds }, status: 'ACTIVE' },
                },
              }
            : {}),
        };

  const [rows, docCountRows, balanceRows, rentLedgerPaidRows, rentLedgerDueRows, arrearsByTenancy] = await Promise.all([
    prisma.tenant.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayId: true,
        name: true,
        email: true,
        phone: true,
        location: true,
        nationalId: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        bankAccountNumber: true,
        bankName: true,
        rentReminderEnabled: true,
        tenancies: {
          orderBy: { startDate: 'desc' },
          select: {
            id: true,
            status: true,
            monthlyRent: true,
            startDate: true,
            endDate: true,
            subProperty: { select: { name: true, unitNumber: true } },
            rentableEntity: { select: { name: true, code: true } },
          },
        },
      },
    }),
    prisma.document.groupBy({
      by: ['entityId'],
      where: { ownerId, entityType: 'TENANT' },
      _count: true,
    }),
    // Running balance per tenancy (LedgerEntry sum; negative = owed).
    prisma.ledgerEntry.groupBy({
      by: ['tenancyId'],
      where: { tenancy: { ownerId } },
      _sum: { amount: true },
    }),
    // Total rent paid per tenancy
    prisma.rentLedger.groupBy({
      by: ['tenancyId'],
      where: { ownerId },
      _sum: { amountPaid: true },
    }),
    // Total rent due per tenancy
    prisma.rentLedger.groupBy({
      by: ['tenancyId'],
      where: { ownerId },
      _sum: { amountDue: true },
    }),
    getArrearsByTenancy(ownerId),
  ]);

  const docCounts = new Map<string, number>(
    docCountRows.map((r) => [r.entityId, r._count]),
  );
  const balanceByTenancy = new Map<string, number>(
    balanceRows.map((r) => [r.tenancyId, r._sum.amount ?? 0]),
  );
  const paidByTenancy = new Map<string, number>(
    rentLedgerPaidRows.map((r) => [r.tenancyId, r._sum.amountPaid ?? 0]),
  );
  const dueByTenancy = new Map<string, number>(
    rentLedgerDueRows.map((r) => [r.tenancyId, r._sum.amountDue ?? 0]),
  );

  return rows.map((t) => {
    const activeTenancies = t.tenancies.filter((x) => x.status === 'ACTIVE');
    const current = activeTenancies[0] ?? t.tenancies[0] ?? null;

    let tenantTotalPaid = 0;
    let tenantTotalDue = 0;
    for (const tenancy of t.tenancies) {
      tenantTotalPaid += paidByTenancy.get(tenancy.id) ?? 0;
      tenantTotalDue += dueByTenancy.get(tenancy.id) ?? 0;
    }

    // Arrears come from the rent schedule (same source as the Rent page and
    // dashboard), summed over all of this tenant's leases.
    let overdueAmount = 0;
    let remainingRent = 0;
    for (const tenancy of t.tenancies) {
      const a = arrearsByTenancy.get(tenancy.id);
      if (a) {
        overdueAmount += a.overdue;
        remainingRent += a.dueToDate;
      }
    }
    overdueAmount = Math.round(overdueAmount * 100) / 100;
    remainingRent = Math.round(remainingRent * 100) / 100;
    const currentArrears = current ? arrearsByTenancy.get(current.id) : undefined;
    // Negative = owed (kept for components that read the running balance).
    const currentBalance = currentArrears ? -currentArrears.dueToDate : 0;
    void balanceByTenancy;
    void tenantTotalDue;

    let paidStatus: TenantPaymentStatus = 'NO_LEASE';
    if (current) {
      if (overdueAmount > 0) {
        paidStatus = tenantTotalPaid > 0 ? 'PARTIAL' : 'OVERDUE';
      } else if (remainingRent > 0) {
        paidStatus = 'UNPAID';
      } else {
        paidStatus = 'PAID';
      }
    }

    return {
      id: t.id,
      displayId: t.displayId,
      name: t.name,
      email: t.email,
      phone: t.phone,
      location: t.location,
      nationalId: t.nationalId,
      emergencyContactName: t.emergencyContactName,
      emergencyContactPhone: t.emergencyContactPhone,
      bankAccountNumber: t.bankAccountNumber,
      bankName: t.bankName,
      rentReminderEnabled: t.rentReminderEnabled,
      documentCount: docCounts.get(t.id) ?? 0,
      totalPaid: tenantTotalPaid,
      remainingRent,
      paidStatus,
      overdueAmount,
      currentTenancy: current
        ? {
            id: current.id,
            status: current.status,
            unitName: current.subProperty?.name ?? current.rentableEntity?.name ?? 'Unit',
            unitNumber: current.subProperty?.unitNumber ?? current.rentableEntity?.code ?? '—',
            monthlyRent: current.monthlyRent,
            currentBalance,
            startDate: current.startDate,
            endDate: current.endDate,
          }
        : null,
    };
  });
}

// A single tenant (scalar fields) if owned, for the edit form.
export async function getOwnedTenant(id: string, ownerId: string, role?: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      location: true,
      nationalId: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      bankAccountNumber: true,
      bankName: true,
      ownerId: true,
      // Active tenancy (for editing rent + lease details on the edit form).
      tenancies: {
        where: { status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        take: 1,
        select: {
          id: true,
          monthlyRent: true,
          startDate: true,
          endDate: true,
          paymentDayOfMonth: true,
        },
      },
    },
  });
  if (!tenant) return null;
  // Unclaimed tenants (ownerId null) belong to nobody's directory yet.
  if (role !== 'SUPER_ADMIN' && tenant.ownerId !== ownerId) return null;
  return tenant;
}

// Tenant + full tenancy history (newest first) for the detail page.
export async function getOwnedTenantDetail(id: string, ownerId: string, role?: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      location: true,
      nationalId: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      bankAccountNumber: true,
      bankName: true,
      portalEnabled: true,
      ownerId: true,
      tenancies: {
        orderBy: { startDate: 'desc' },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          monthlyRent: true,
          securityDeposit: true,
          paymentDayOfMonth: true,
          subProperty: {
            select: {
              id: true,
              name: true,
              unitNumber: true,
              propertyId: true,
              property: { select: { name: true, portfolioId: true } },
            },
          },
          rentableEntity: {
            select: {
              id: true,
              name: true,
              code: true,
              propertyId: true,
              property: { select: { name: true, portfolioId: true } },
            },
          },
        },
      },
    },
  });
  if (!tenant) return null;
  if (role !== 'SUPER_ADMIN' && tenant.ownerId !== ownerId) return null;
  return tenant;
}

export type ParsedTenant = {
  name: string;
  email: string | null;
  phone: string;
  location: string | null;
  nationalId: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
};

function optString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Validate + coerce a tenant request body (shared by POST and PATCH).
export function parseTenantInput(
  body: unknown,
): { data: ParsedTenant } | { error: string } {
  const {
    name,
    email,
    phone,
    location,
    nationalId,
    emergencyContactName,
    emergencyContactPhone,
    bankAccountNumber,
    bankName,
  } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== 'string' || !name.trim()) {
    return { error: 'Name is required.' };
  }
  // Phone is mandatory: rent reminders and payment updates go to it by SMS.
  // Accept a 10-digit Indian mobile (optionally with 0 / 91 / +91), or a full
  // international number written with a leading "+".
  if (typeof phone !== 'string' || !isValidTenantPhone(phone)) {
    return {
      error: 'Enter a valid 10-digit mobile number (or an international number starting with +). Rent reminders are sent to it by SMS.',
    };
  }
  // Email is optional, but if given it must be a real address (reminders go to it).
  const emailText = typeof email === 'string' ? email.trim() : '';
  if (emailText && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) {
    return { error: 'Enter a valid email address, or leave it blank.' };
  }
  const resolvedEmail = emailText ? emailText.toLowerCase() : null;

  return {
    data: {
      name: name.trim(),
      email: resolvedEmail,
      phone: phone.trim(),
      location: optString(location),
      nationalId: optString(nationalId),
      emergencyContactName: optString(emergencyContactName),
      emergencyContactPhone: optString(emergencyContactPhone),
      bankAccountNumber: optString(bankAccountNumber),
      bankName: optString(bankName),
    },
  };
}

/** 10-digit Indian mobile (with optional 0 / 91 / +91 prefix) or +international. */
export function isValidTenantPhone(raw: string): boolean {
  const s = raw.trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return /^[6-9]/.test(digits);
  if (digits.length === 11 && digits.startsWith('0')) return /^[6-9]/.test(digits.slice(1));
  if (digits.length === 12 && digits.startsWith('91')) return /^[6-9]/.test(digits.slice(2));
  return s.startsWith('+') && digits.length >= 11 && digits.length <= 15;
}
