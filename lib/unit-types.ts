// Client-safe: which sub-unit types make sense for each property type.
//
// This only decides which options the "Add unit / sub-unit" screens SHOW.
// The hierarchy rules themselves (what can sit under what) are unchanged and
// live in lib/rentable-entities.ts → VALID_PARENT_TYPES; the server still
// accepts any valid combination, so existing units are never blocked.
import type { PropertyType, RentableEntityType } from '@prisma/client';

// ── Hierarchy rules: the ONE place that says what may sit inside what ──────
// Used by the server (lib/rentable-entities.ts re-exports these) and by every
// "add unit / sub-unit" screen, so they can never disagree.
//
//   Property ─┬─ Floor ─┬─ Flat ──── Room ── Bed
//             │         ├─ Portion ─ Room ── Bed
//             │         ├─ Room ──── Bed
//             │         ├─ Bed
//             │         └─ Office · Shop · Parking · Storage
//             ├─ Flat / Portion / Room / Office / Shop / Parking / Storage
//             └─ Plot
//
// Office, Shop, Bed, Parking, Storage and Plot never hold anything.
// Rent rolls up the same way for every type: a node with sub-units shows the
// sum of its children's rent (lib/rentable-entities.ts, lib/portfolio-overview.ts).

/** All unit types, in hierarchy order (used for lists and menus). */
export const RENTABLE_ENTITY_TYPES: RentableEntityType[] = [
  'PROPERTY', 'FLOOR', 'FLAT', 'PORTION', 'ROOM', 'OFFICE', 'SHOP', 'BED', 'PARKING', 'STORAGE', 'PLOT',
];

export const RENTABLE_ENTITY_TYPE_LABELS: Record<RentableEntityType, string> = {
  PROPERTY: 'Whole Property',
  FLOOR: 'Floor',
  FLAT: 'Flat / Apartment',
  PORTION: 'Portion',
  ROOM: 'Room',
  OFFICE: 'Office',
  SHOP: 'Shop',
  BED: 'Bed',
  PARKING: 'Parking',
  STORAGE: 'Storage / Godown',
  PLOT: 'Plot',
};

/** For each type, which types it may be placed directly inside. */
export const VALID_PARENT_TYPES: Record<RentableEntityType, RentableEntityType[]> = {
  PROPERTY: [],
  FLOOR: ['PROPERTY'],
  FLAT: ['PROPERTY', 'FLOOR'],
  PORTION: ['PROPERTY', 'FLOOR'],
  ROOM: ['PROPERTY', 'FLOOR', 'FLAT', 'PORTION'],
  OFFICE: ['PROPERTY', 'FLOOR'],
  SHOP: ['PROPERTY', 'FLOOR'],
  BED: ['ROOM', 'FLOOR'],
  PARKING: ['PROPERTY', 'FLOOR'],
  STORAGE: ['PROPERTY', 'FLOOR'],
  PLOT: ['PROPERTY'],
};

/** The types that may be added directly inside `parent`, in hierarchy order. */
export function childTypesOf(parent: RentableEntityType | string): RentableEntityType[] {
  return RENTABLE_ENTITY_TYPES.filter((t) => VALID_PARENT_TYPES[t].includes(parent as RentableEntityType));
}

/** Whether anything at all may be added inside this type. */
export function canHaveChildren(type: RentableEntityType | string): boolean {
  return childTypesOf(type).length > 0;
}

const ALL_SUB_UNITS: RentableEntityType[] = RENTABLE_ENTITY_TYPES.filter((t) => t !== 'PROPERTY');

export const UNIT_TYPES_BY_PROPERTY_TYPE: Record<PropertyType, RentableEntityType[]> = {
  RESIDENTIAL:       ['FLOOR', 'FLAT', 'PORTION', 'ROOM', 'BED', 'PARKING', 'STORAGE'],
  APARTMENT:         ['FLOOR', 'FLAT', 'ROOM', 'SHOP', 'PARKING', 'STORAGE'],
  BUNGALOW:          ['FLOOR', 'PORTION', 'ROOM', 'PARKING', 'STORAGE'],
  INDEPENDENT_HOUSE: ['FLOOR', 'PORTION', 'ROOM', 'PARKING', 'STORAGE'],
  PG_HOSTEL:         ['FLOOR', 'ROOM', 'BED', 'PARKING'],
  COMMERCIAL:        ['FLOOR', 'OFFICE', 'SHOP', 'STORAGE', 'PARKING'],
  SHOP_SHOWROOM:     ['FLOOR', 'SHOP', 'STORAGE', 'PARKING'],
  OFFICE_BUILDING:   ['FLOOR', 'OFFICE', 'PARKING', 'STORAGE'],
  WAREHOUSE:         ['FLOOR', 'STORAGE', 'OFFICE', 'PARKING'],
  INDUSTRIAL:        ['FLOOR', 'STORAGE', 'OFFICE', 'PARKING', 'PLOT'],
  LAND:              ['PLOT', 'PARKING'],
  MIXED:             ALL_SUB_UNITS,
};

/** Sub-unit types to offer for a property type (all of them if unknown). */
export function unitTypesForProperty(type?: string | null): RentableEntityType[] {
  return (type && UNIT_TYPES_BY_PROPERTY_TYPE[type as PropertyType]) || ALL_SUB_UNITS;
}

/**
 * What can be added inside `parent` for a property of `propertyType`:
 * the hierarchy rule first, then narrowed to the types that suit the property.
 */
export function allowedChildTypes(
  parent: RentableEntityType | string,
  propertyType?: string | null,
): RentableEntityType[] {
  const fit = unitTypesForProperty(propertyType);
  return childTypesOf(parent).filter((t) => fit.includes(t));
}
