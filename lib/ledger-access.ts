import { prisma } from '@/lib/prisma';
import {
  resolveDataScope,
  resolveRentLedgerAccess,
  type DataScope,
} from '@/lib/manager-access';

export type TenancyLedgerContext = {
  id: string;
  ownerId: string;
  subPropertyId: string | null;
  rentableEntityId: string | null;
};

type SessionUser = { id: string; role: string };

// Resolve a tenancy for the transaction-ledger / audit routes, enforcing owner
// scoping. Managers can read tenancies of units/properties they were granted;
// writes additionally need the rent-ledger edit right (resolveRentLedgerAccess).
// Out-of-scope tenancies are reported as 404 so existence isn't leaked.
export async function resolveTenancyLedgerAccess(
  user: SessionUser,
  tenancyId: string,
  mode: 'read' | 'write',
): Promise<
  | { ds: DataScope; tenancy: TenancyLedgerContext }
  | { error: string; status: number }
> {
  if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return { error: 'Forbidden', status: 403 };
  }
  const ds = await resolveDataScope(user);
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    select: {
      id: true,
      ownerId: true,
      subPropertyId: true,
      rentableEntityId: true,
      rentableEntity: { select: { propertyId: true } },
    },
  });
  if (!tenancy || tenancy.ownerId !== ds.ownerId) {
    return { error: 'Tenancy not found.', status: 404 };
  }
  const ctx: TenancyLedgerContext = {
    id: tenancy.id,
    ownerId: tenancy.ownerId,
    subPropertyId: tenancy.subPropertyId,
    rentableEntityId: tenancy.rentableEntityId,
  };

  if (!ds.isManager) return { ds, tenancy: ctx };

  if (mode === 'write') {
    const access = await resolveRentLedgerAccess(user, {
      subPropertyId: tenancy.subPropertyId,
    });
    if ('error' in access) return { error: access.error, status: access.status };
    return { ds, tenancy: ctx };
  }

  const inScope =
    (tenancy.subPropertyId && ds.scope.subPropertyIds.includes(tenancy.subPropertyId)) ||
    (tenancy.rentableEntity &&
      ds.scope.propertyIds.includes(tenancy.rentableEntity.propertyId));
  if (!inScope) return { error: 'Tenancy not found.', status: 404 };
  return { ds, tenancy: ctx };
}
