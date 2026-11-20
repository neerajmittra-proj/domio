// Client-safe: which sub-unit types make sense for each property type.
//
// This only decides which options the "Add unit / sub-unit" screens SHOW.
// The hierarchy rules themselves (what can sit under what) are unchanged and
// live in lib/rentable-entities.ts → VALID_PARENT_TYPES; the server still
// accepts any valid combination, so existing units are never blocked.
import type { PropertyType, RentableEntityType } from '@prisma/client';

const ALL_SUB_UNITS: RentableEntityType[] = [
  'FLOOR', 'FLAT', 'PORTION', 'ROOM', 'OFFICE', 'SHOP', 'BED', 'PARKING', 'STORAGE', 'PLOT',
];

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
