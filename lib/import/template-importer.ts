import type {
  Prisma,
  BillStatus,
  ExpenseCategory,
  PaymentMethod,
  PortfolioType,
  PropertyStatus,
  PropertyType,
  RentStatus,
  SubPropertyStatus,
  TenancyStatus,
  UtilityType,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  generatePortfolioId,
  generatePropertyId,
  generateUnitId,
  generateTenantId,
  generateTenancyId,
} from '@/lib/display-ids';
import type { TemplateData } from './template-schema';
import { PROPERTY_TYPES as ALL_PROPERTY_TYPES } from '@/lib/property-types';

// Raised for problems in the user's data (unknown references, bad values). The
// surrounding transaction is rolled back and the message is shown to the user.
export class ImportDataError extends Error {}

const PORTFOLIO_TYPES: PortfolioType[] = ['RESIDENTIAL', 'COMMERCIAL', 'MIXED', 'INDUSTRIAL'];
const PROPERTY_TYPES: PropertyType[] = ALL_PROPERTY_TYPES.map((t) => t.value);
const PROPERTY_STATUSES: PropertyStatus[] = ['ACTIVE', 'VACANT', 'MAINTENANCE'];
const UNIT_STATUSES: SubPropertyStatus[] = ['OCCUPIED', 'VACANT', 'MAINTENANCE'];
const TENANCY_STATUSES: TenancyStatus[] = ['ACTIVE', 'EXPIRED', 'TERMINATED'];
const RENT_STATUSES: RentStatus[] = ['DUE', 'PAID', 'PARTIAL', 'OVERDUE'];
const BILL_STATUSES: BillStatus[] = ['UNPAID', 'PAID', 'OVERDUE', 'PARTIAL'];
const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CHEQUE', 'DIRECT_DEPOSIT', 'BANK_TRANSFER', 'OTHER'];
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'MAINTENANCE', 'CLEANING', 'INSURANCE', 'TAX', 'LEGAL', 'UTILITIES', 'MANAGEMENT', 'OTHER',
];
const UTILITY_TYPES: UtilityType[] = ['ELECTRICITY', 'WATER', 'GAS', 'INTERNET', 'OTHER'];

function oneOf<T extends string>(list: readonly T[], v: string, fallback: T): T {
  const u = v.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (list as readonly string[]).includes(u) ? (u as T) : fallback;
}
function num(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[,\s₹$]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function date(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
const key = (...parts: string[]) => parts.map((p) => p.trim().toLowerCase()).join('|');
const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1));

type Rec = { entityType: string; entityId: string; sourceData: Prisma.InputJsonObject };

export interface TemplateImportSummary {
  portfolios: number;
  properties: number;
  units: number;
  tenants: number;
  tenancies: number;
  rentRecords: number;
  expenses: number;
  utilityAccounts: number;
  utilityBills: number;
  skipped: string[];
}

// Write a parsed template into the database for `ownerId`, atomically.
// Everything is owner-scoped. Existing portfolios / properties / units /
// tenants with the same name are REUSED (and not recorded for rollback), so a
// rollback only ever deletes rows this import created.
export async function processTemplateImport(
  importJobId: string,
  ownerId: string,
  data: TemplateData,
): Promise<TemplateImportSummary> {
  const summary: TemplateImportSummary = {
    portfolios: 0, properties: 0, units: 0, tenants: 0, tenancies: 0,
    rentRecords: 0, expenses: 0, utilityAccounts: 0, utilityBills: 0, skipped: [],
  };
  const records: Rec[] = [];
  const track = (entityType: string, entityId: string, sourceData: Prisma.InputJsonObject) =>
    records.push({ entityType, entityId, sourceData });

  await prisma.$transaction(
    async (tx) => {
      // ── Portfolios ────────────────────────────────────────────────────────
      const portfolioIds = new Map<string, string>();
      for (const p of await tx.portfolio.findMany({
        where: { ownerId },
        select: { id: true, name: true },
      })) {
        portfolioIds.set(key(p.name), p.id);
      }
      for (const row of data.portfolios) {
        if (portfolioIds.has(key(row.name))) continue;
        const created = await tx.portfolio.create({
          data: {
            displayId: await generatePortfolioId(),
            name: row.name,
            type: oneOf(PORTFOLIO_TYPES, row.type, 'RESIDENTIAL'),
            description: row.description || null,
            ownerId,
          },
        });
        portfolioIds.set(key(row.name), created.id);
        track('portfolio', created.id, { name: row.name });
        summary.portfolios++;
      }

      // ── Properties ────────────────────────────────────────────────────────
      const propertyIds = new Map<string, string>(); // name → id
      const propertyPortfolio = new Map<string, string>(); // property id → portfolio id
      for (const p of await tx.property.findMany({
        where: { ownerId },
        select: { id: true, name: true, portfolioId: true },
      })) {
        if (!propertyIds.has(key(p.name))) propertyIds.set(key(p.name), p.id);
        propertyPortfolio.set(p.id, p.portfolioId);
      }
      for (const row of data.properties) {
        const portfolioId = portfolioIds.get(key(row.portfolioName));
        if (!portfolioId) {
          throw new ImportDataError(
            `Property "${row.name}": portfolio "${row.portfolioName}" was not found.`,
          );
        }
        const existing = await tx.property.findFirst({
          where: { ownerId, portfolioId, name: { equals: row.name, mode: 'insensitive' } },
          select: { id: true },
        });
        if (existing) {
          propertyIds.set(key(row.name), existing.id);
          propertyPortfolio.set(existing.id, portfolioId);
          continue;
        }
        const created = await tx.property.create({
          data: {
            displayId: await generatePropertyId(),
            name: row.name,
            address: row.address,
            city: row.city,
            country: row.country,
            type: oneOf(PROPERTY_TYPES, row.type, 'RESIDENTIAL'),
            status: oneOf(PROPERTY_STATUSES, row.status, 'ACTIVE'),
            notes: row.notes || null,
            portfolioId,
            ownerId,
          },
        });
        propertyIds.set(key(row.name), created.id);
        propertyPortfolio.set(created.id, portfolioId);
        track('property', created.id, { name: row.name });
        summary.properties++;
      }

      // ── Units ─────────────────────────────────────────────────────────────
      const unitIds = new Map<string, { id: string; rent: number; created: boolean }>();
      const unitKey = (property: string, unit: string) => key(property, unit);
      const resolveProperty = (name: string, ctx: string) => {
        const id = propertyIds.get(key(name));
        if (!id) throw new ImportDataError(`${ctx}: property "${name}" was not found.`);
        return id;
      };
      const resolveUnit = (property: string, unit: string, ctx: string) => {
        const u = unitIds.get(unitKey(property, unit));
        if (!u) throw new ImportDataError(`${ctx}: unit "${unit}" in "${property}" was not found.`);
        return u;
      };
      const occupiedUnits = new Set<string>(); // units to flag OCCUPIED afterwards

      for (const row of data.units) {
        const propertyId = resolveProperty(row.propertyName, `Unit "${row.unitNumber}"`);
        const existing = await tx.subProperty.findFirst({
          where: { ownerId, propertyId, unitNumber: { equals: row.unitNumber, mode: 'insensitive' } },
          select: { id: true, rentAmount: true },
        });
        if (existing) {
          unitIds.set(unitKey(row.propertyName, row.unitNumber), {
            id: existing.id, rent: existing.rentAmount, created: false,
          });
          continue;
        }
        const rent = num(row.rentAmount) ?? 0;
        const created = await tx.subProperty.create({
          data: {
            displayId: await generateUnitId(),
            name: row.name || row.unitNumber,
            unitNumber: row.unitNumber,
            floor: row.floor || null,
            areaSqft: num(row.areaSqft),
            rentAmount: rent,
            status: oneOf(UNIT_STATUSES, row.status, 'VACANT'),
            notes: row.notes || null,
            propertyId,
            ownerId,
          },
        });
        unitIds.set(unitKey(row.propertyName, row.unitNumber), { id: created.id, rent, created: true });
        track('subProperty', created.id, { propertyName: row.propertyName, unitNumber: row.unitNumber });
        summary.units++;
      }

      // ── Tenants ───────────────────────────────────────────────────────────
      const tenantByEmail = new Map<string, string>();
      for (const t of await tx.tenant.findMany({
        where: { ownerId, email: { not: null } },
        select: { id: true, email: true },
      })) {
        if (t.email) tenantByEmail.set(t.email.trim().toLowerCase(), t.id);
      }
      const tenantByName = new Map<string, string>();
      for (const row of data.tenants) {
        const email = row.email.trim().toLowerCase();
        if (email && tenantByEmail.has(email)) {
          tenantByName.set(key(row.name), tenantByEmail.get(email)!);
          continue;
        }
        const created = await tx.tenant.create({
          data: {
            displayId: await generateTenantId(),
            name: row.name,
            email: email || null,
            phone: row.phone,
            nationalId: row.nationalId || null,
            ownerId,
          },
        });
        if (email) tenantByEmail.set(email, created.id);
        tenantByName.set(key(row.name), created.id);
        track('tenant', created.id, { name: row.name });
        summary.tenants++;
      }

      // ── Tenancies ─────────────────────────────────────────────────────────
      type TenancyRef = { id: string; monthlyRent: number; payDay: number };
      const tenancyByUnit = new Map<string, TenancyRef>(); // active/most relevant per unit
      const tenancyByTenantUnit = new Map<string, TenancyRef>();
      // Units that already hold an ACTIVE tenancy in the database.
      const busyUnitIds = new Set(
        (
          await tx.tenancy.findMany({
            where: { ownerId, status: 'ACTIVE', subPropertyId: { not: null } },
            select: { subPropertyId: true },
          })
        ).map((t) => t.subPropertyId as string),
      );

      for (const row of data.tenancies) {
        const ctx = `Tenancy for ${row.tenantEmail}`;
        const tenantId =
          tenantByEmail.get(row.tenantEmail.trim().toLowerCase()) ??
          tenantByName.get(key(row.tenantEmail));
        if (!tenantId) throw new ImportDataError(`${ctx}: tenant was not found in the Tenants tab.`);
        const unit = resolveUnit(row.propertyName, row.unitNumber, ctx);
        const status = oneOf(TENANCY_STATUSES, row.status, 'ACTIVE');
        if (status === 'ACTIVE' && busyUnitIds.has(unit.id)) {
          summary.skipped.push(
            `${ctx}: unit ${row.unitNumber} already has an active tenancy — skipped.`,
          );
          continue;
        }
        const start = date(row.startDate) ?? new Date();
        const end = date(row.endDate) ?? new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()));
        const day = Math.round(num(row.paymentDayOfMonth) ?? 1);
        const payDay = day >= 1 && day <= 28 ? day : 1;
        const monthlyRent = num(row.monthlyRent) ?? unit.rent;
        const created = await tx.tenancy.create({
          data: {
            displayId: await generateTenancyId(),
            tenantId,
            subPropertyId: unit.id,
            ownerId,
            startDate: start,
            endDate: end,
            monthlyRent,
            securityDeposit: num(row.securityDeposit) ?? 0,
            paymentDayOfMonth: payDay,
            status,
          },
        });
        const ref = { id: created.id, monthlyRent, payDay };
        tenancyByUnit.set(unitKey(row.propertyName, row.unitNumber), ref);
        tenancyByTenantUnit.set(
          key(row.tenantEmail, row.propertyName, row.unitNumber),
          ref,
        );
        if (status === 'ACTIVE') {
          busyUnitIds.add(unit.id);
          if (unit.created) occupiedUnits.add(unit.id);
        }
        track('tenancy', created.id, { tenantEmail: row.tenantEmail, unitNumber: row.unitNumber });
        summary.tenancies++;
      }
      if (occupiedUnits.size > 0) {
        await tx.subProperty.updateMany({
          where: { id: { in: [...occupiedUnits] }, ownerId },
          data: { status: 'OCCUPIED' },
        });
      }

      // ── Rent payments (RentLedger) ───────────────────────────────────────
      const seenRent = new Set<string>();
      const ledgerRows: {
        data: Prisma.RentLedgerCreateManyInput;
        src: Prisma.InputJsonObject;
      }[] = [];
      const now = Date.now();
      for (const row of data.rentPayments) {
        const ctx = `Rent payment ${row.period} (${row.propertyName} / ${row.unitNumber})`;
        const tenancy =
          tenancyByTenantUnit.get(key(row.tenantEmail, row.propertyName, row.unitNumber)) ??
          tenancyByUnit.get(unitKey(row.propertyName, row.unitNumber));
        if (!tenancy) {
          summary.skipped.push(`${ctx}: no tenancy found in this file — skipped.`);
          continue;
        }
        const m = /^(\d{4})-(\d{1,2})$/.exec(row.period.trim());
        if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
          throw new ImportDataError(`${ctx}: period must look like YYYY-MM.`);
        }
        const year = Number(m[1]);
        const month = Number(m[2]);
        const dueDate = date(row.dueDate) ?? new Date(Date.UTC(year, month - 1, tenancy.payDay));
        const dedupe = `${tenancy.id}|${year}-${month}`;
        if (seenRent.has(dedupe)) {
          summary.skipped.push(`${ctx}: duplicate period — skipped.`);
          continue;
        }
        seenRent.add(dedupe);
        const amountDue = num(row.amountDue) ?? tenancy.monthlyRent;
        const amountPaid = Math.max(0, num(row.amountPaid) ?? 0);
        const derived: RentStatus =
          amountPaid >= amountDue && amountDue > 0
            ? 'PAID'
            : amountPaid > 0
              ? 'PARTIAL'
              : dueDate.getTime() < now
                ? 'OVERDUE'
                : 'DUE';
        const explicit = row.status.trim().toUpperCase();
        const status: RentStatus =
          explicit === 'NIL' ? 'OVERDUE' : oneOf(RENT_STATUSES, row.status, derived);
        ledgerRows.push({
          data: {
            tenancyId: tenancy.id,
            ownerId,
            dueDate,
            amountDue,
            amountPaid,
            paidDate: date(row.paidDate),
            rentFor: amountPaid > 0 ? monthStart(year, month) : null,
            paymentMethod: PAYMENT_METHODS.includes(row.paymentMethod.trim().toUpperCase() as PaymentMethod)
              ? (row.paymentMethod.trim().toUpperCase() as PaymentMethod)
              : null,
            status,
            notes: row.notes || null,
          },
          src: { ...row },
        });
      }
      if (ledgerRows.length > 0) {
        const created = await tx.rentLedger.createManyAndReturn({
          data: ledgerRows.map((r) => r.data),
          select: { id: true },
        });
        created.forEach((c, i) => track('rentLedger', c.id, ledgerRows[i].src));
        summary.rentRecords = created.length;
      }

      // ── Expenses ──────────────────────────────────────────────────────────
      const expenseRows = data.expenses.map((row, i) => {
        const ctx = `Expense row ${i + 1}`;
        const amount = num(row.amount);
        const when = date(row.date);
        if (amount === null || amount <= 0) throw new ImportDataError(`${ctx}: amount must be a positive number.`);
        if (!when) throw new ImportDataError(`${ctx}: date is missing or invalid.`);
        const propertyId = row.propertyName ? resolveProperty(row.propertyName, ctx) : null;
        return {
          ownerId,
          propertyId,
          portfolioId: propertyId ? (propertyPortfolio.get(propertyId) ?? null) : null,
          category: oneOf(EXPENSE_CATEGORIES, row.category, 'OTHER'),
          amount,
          date: when,
          description: row.description || null,
        };
      });
      if (expenseRows.length > 0) {
        const created = await tx.expense.createManyAndReturn({ data: expenseRows, select: { id: true } });
        created.forEach((c, i) => track('expense', c.id, { ...data.expenses[i] }));
        summary.expenses = created.length;
      }

      // ── Utility accounts & bills ─────────────────────────────────────────
      const accountByRef = new Map<string, string>();
      for (const row of data.utilityAccounts) {
        const propertyId = row.propertyName ? resolveProperty(row.propertyName, `Utility account "${row.provider}"`) : null;
        const created = await tx.utilityAccount.create({
          data: {
            ownerId,
            propertyId,
            portfolioId: propertyId ? (propertyPortfolio.get(propertyId) ?? null) : null,
            type: oneOf(UTILITY_TYPES, row.type, 'OTHER'),
            provider: row.provider,
            accountNumber: row.accountNumber,
            notes: row.notes || null,
          },
        });
        if (row.accountRef) accountByRef.set(key(row.accountRef), created.id);
        track('utilityAccount', created.id, { provider: row.provider });
        summary.utilityAccounts++;
      }
      const billRows = data.utilityBills.map((row, i) => {
        const ctx = `Utility bill row ${i + 1}`;
        const accountId = accountByRef.get(key(row.accountRef));
        if (!accountId) throw new ImportDataError(`${ctx}: account ref "${row.accountRef}" was not found.`);
        const amount = num(row.amount);
        if (amount === null || amount < 0) throw new ImportDataError(`${ctx}: amount must be a number.`);
        const billDate = date(row.billDate) ?? new Date();
        const dueDate = date(row.dueDate) ?? billDate;
        const amountPaid = Math.max(0, num(row.amountPaid) ?? 0);
        const derived: BillStatus =
          amountPaid >= amount && amount > 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : dueDate.getTime() < now ? 'OVERDUE' : 'UNPAID';
        return {
          utilityAccountId: accountId,
          ownerId,
          billDate,
          dueDate,
          amount,
          amountPaid,
          paidDate: date(row.paidDate),
          status: oneOf(BILL_STATUSES, row.status, derived),
          notes: row.notes || null,
        };
      });
      if (billRows.length > 0) {
        const created = await tx.utilityBill.createManyAndReturn({ data: billRows, select: { id: true } });
        created.forEach((c, i) => track('utilityBill', c.id, { ...data.utilityBills[i] }));
        summary.utilityBills = created.length;
      }

      // ── Rollback ledger + job status (same transaction) ──────────────────
      if (records.length > 0) {
        await tx.importedRecord.createMany({
          data: records.map((r) => ({ importJobId, ...r })),
        });
      }
      const total = records.length;
      await tx.importJob.update({
        where: { id: importJobId },
        data: {
          status: 'COMPLETED',
          confirmedAt: new Date(),
          errorMessage: null,
          validRows: total,
        },
      });
    },
    { timeout: 120000, maxWait: 15000 },
  );

  return summary;
}
