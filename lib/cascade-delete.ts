import type { Prisma } from '@prisma/client';

// Shared cascade-delete helpers. The schema has no ON DELETE CASCADE on most
// relations (Tenancy -> RentLedger/LedgerEntry, UtilityAccount -> UtilityBill,
// Property -> units, ...), so deleting a parent row directly fails with an FK
// violation. These helpers remove the dependants first, inside the caller's
// transaction, matching what the delete-confirmation dialogs promise
// ("permanently remove all associated units and historical records").

export async function deleteTenanciesCascade(
  tx: Prisma.TransactionClient,
  tenancyIds: string[],
) {
  if (tenancyIds.length === 0) return;
  await tx.ledgerEntry.deleteMany({ where: { tenancyId: { in: tenancyIds } } });
  await tx.rentLedger.deleteMany({ where: { tenancyId: { in: tenancyIds } } });
  await tx.auditLog.deleteMany({ where: { tenancyId: { in: tenancyIds } } });
  await tx.tenancy.deleteMany({ where: { id: { in: tenancyIds } } });
}

export async function deleteUtilityAccountsCascade(
  tx: Prisma.TransactionClient,
  where: Prisma.UtilityAccountWhereInput,
) {
  const accounts = await tx.utilityAccount.findMany({ where, select: { id: true } });
  const ids = accounts.map((a) => a.id);
  if (ids.length === 0) return;
  await tx.utilityBill.deleteMany({ where: { utilityAccountId: { in: ids } } });
  await tx.utilityAccount.deleteMany({ where: { id: { in: ids } } });
}

// Delete properties plus everything hanging off them (units, rentable
// entities, tenancies + ledgers, utilities, expenses, manager access, audit).
export async function deletePropertiesCascade(
  tx: Prisma.TransactionClient,
  propertyIds: string[],
) {
  if (propertyIds.length === 0) return;

  const [subs, ents] = await Promise.all([
    tx.subProperty.findMany({
      where: { propertyId: { in: propertyIds } },
      select: { id: true },
    }),
    tx.rentableEntity.findMany({
      where: { propertyId: { in: propertyIds } },
      select: { id: true },
    }),
  ]);
  const subIds = subs.map((s) => s.id);
  const entIds = ents.map((e) => e.id);

  const tenancies = await tx.tenancy.findMany({
    where: {
      OR: [
        ...(subIds.length ? [{ subPropertyId: { in: subIds } }] : []),
        ...(entIds.length ? [{ rentableEntityId: { in: entIds } }] : []),
      ],
    },
    select: { id: true },
  });
  if (subIds.length || entIds.length) {
    await deleteTenanciesCascade(tx, tenancies.map((t) => t.id));
  }

  await deleteUtilityAccountsCascade(tx, {
    OR: [
      { propertyId: { in: propertyIds } },
      ...(subIds.length ? [{ subPropertyId: { in: subIds } }] : []),
    ],
  });
  await tx.expense.deleteMany({
    where: {
      OR: [
        { propertyId: { in: propertyIds } },
        ...(subIds.length ? [{ subPropertyId: { in: subIds } }] : []),
      ],
    },
  });
  await tx.propertyAccess.deleteMany({
    where: {
      OR: [
        { propertyId: { in: propertyIds } },
        ...(subIds.length ? [{ subPropertyId: { in: subIds } }] : []),
      ],
    },
  });
  if (subIds.length || entIds.length) {
    await tx.auditLog.deleteMany({
      where: {
        OR: [
          ...(subIds.length ? [{ subPropertyId: { in: subIds } }] : []),
          ...(entIds.length ? [{ rentableEntityId: { in: entIds } }] : []),
        ],
      },
    });
  }
  // One statement for the whole self-referencing tree (FK is checked at
  // end-of-statement, so parent + children together is safe).
  if (entIds.length) await tx.rentableEntity.deleteMany({ where: { id: { in: entIds } } });
  if (subIds.length) await tx.subProperty.deleteMany({ where: { id: { in: subIds } } });
  await tx.property.deleteMany({ where: { id: { in: propertyIds } } });
}
