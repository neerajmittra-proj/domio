// Pure, client-safe property-type/status helpers (no Prisma runtime import).
import type { PropertyType, PropertyStatus } from '@prisma/client';

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'MIXED', label: 'Mixed' },
  { value: 'INDUSTRIAL', label: 'Industrial' },
  { value: 'APARTMENT', label: 'Apartment / Flats' },
  { value: 'BUNGALOW', label: 'Bungalow / Villa' },
  { value: 'INDEPENDENT_HOUSE', label: 'Independent House' },
  { value: 'PG_HOSTEL', label: 'PG / Hostel' },
  { value: 'SHOP_SHOWROOM', label: 'Shop / Showroom' },
  { value: 'OFFICE_BUILDING', label: 'Office Building' },
  { value: 'WAREHOUSE', label: 'Warehouse / Godown' },
  { value: 'LAND', label: 'Land / Plot' },
];

export const PROPERTY_STATUSES: { value: PropertyStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'VACANT', label: 'Vacant' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
];

const TYPE_LABELS: Record<PropertyType, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  MIXED: 'Mixed',
  INDUSTRIAL: 'Industrial',
  APARTMENT: 'Apartment / Flats',
  BUNGALOW: 'Bungalow / Villa',
  INDEPENDENT_HOUSE: 'Independent House',
  PG_HOSTEL: 'PG / Hostel',
  SHOP_SHOWROOM: 'Shop / Showroom',
  OFFICE_BUILDING: 'Office Building',
  WAREHOUSE: 'Warehouse / Godown',
  LAND: 'Land / Plot',
};

const STATUS_LABELS: Record<PropertyStatus, string> = {
  ACTIVE: 'Active',
  VACANT: 'Vacant',
  MAINTENANCE: 'Maintenance',
};

// Domio brand badge classes per type.
const TYPE_BADGE: Record<PropertyType, string> = {
  RESIDENTIAL: 'border border-blue-200 bg-blue-50 text-blue-700',
  COMMERCIAL: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
  MIXED: 'border border-purple-200 bg-purple-50 text-purple-700',
  INDUSTRIAL: 'border border-amber-200 bg-amber-50 text-amber-800',
  APARTMENT: 'border border-sky-200 bg-sky-50 text-sky-700',
  BUNGALOW: 'border border-rose-200 bg-rose-50 text-rose-700',
  INDEPENDENT_HOUSE: 'border border-teal-200 bg-teal-50 text-teal-700',
  PG_HOSTEL: 'border border-orange-200 bg-orange-50 text-orange-700',
  SHOP_SHOWROOM: 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  OFFICE_BUILDING: 'border border-violet-200 bg-violet-50 text-violet-700',
  WAREHOUSE: 'border border-stone-300 bg-stone-50 text-stone-700',
  LAND: 'border border-lime-200 bg-lime-50 text-lime-800',
};

// Status badges — ACTIVE emerald, VACANT amber, MAINTENANCE rose.
const STATUS_BADGE: Record<PropertyStatus, string> = {
  ACTIVE: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  VACANT: 'border border-amber-200 bg-amber-50 text-amber-700',
  MAINTENANCE: 'border border-rose-200 bg-rose-50 text-rose-700',
};

export function propertyTypeLabel(type: PropertyType): string {
  return TYPE_LABELS[type];
}

export function propertyStatusLabel(status: PropertyStatus): string {
  return STATUS_LABELS[status];
}

export function propertyTypeBadgeClass(type: PropertyType): string {
  return TYPE_BADGE[type];
}

export function propertyStatusBadgeClass(status: PropertyStatus): string {
  return STATUS_BADGE[status];
}

export function isPropertyType(value: unknown): value is PropertyType {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(TYPE_LABELS, value)
  );
}

export function isPropertyStatus(value: unknown): value is PropertyStatus {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(STATUS_LABELS, value)
  );
}
