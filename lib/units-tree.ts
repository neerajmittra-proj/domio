import type { RentableEntityType } from '@prisma/client';
import type { RentableEntityNode } from '@/lib/rentable-entities';
import type { SubPropertyListItem } from '@/lib/sub-properties';

/**
 * True when the property already has a real hierarchy: at least one entity
 * node that actually has sub-units. A lone auto-provisioned root PROPERTY row
 * does not count, otherwise it would hide every flat/imported unit.
 */
export function hasRealHierarchy(entities: RentableEntityNode[] | undefined | null): boolean {
  return Boolean(entities && entities.some((e) => e.children.length > 0));
}

/**
 * Build a Property -> Floor -> Unit tree from flat SubProperty units (e.g. data
 * imported without a hierarchy). Units are grouped by their `floor` value; units
 * with no floor hang directly off the property. Pure and read-only: nothing is
 * written to the database.
 */
export function buildTreeFromUnits(
  units: SubPropertyListItem[],
  propertyId: string,
  propertyName: string,
): RentableEntityNode[] {
  if (!units || units.length === 0) return [];
  const rootId = `prop-${propertyId}`;

  const unitNode = (u: SubPropertyListItem, parentId: string): RentableEntityNode => ({
    id: u.id,
    displayId: null,
    propertyId,
    name: u.name,
    type: 'ROOM' as RentableEntityType,
    code: u.unitNumber || '',
    areaSqft: u.areaSqft,
    rentAmount: u.rentAmount || 0,
    status: u.status,
    notes: u.notes,
    sortOrder: null,
    parentId,
    activeLease: u.currentTenantName
      ? {
          tenantName: u.currentTenantName,
          tenancyId: '',
          monthlyRent: u.rentAmount || 0,
          startDate: new Date(),
          endDate: new Date(),
        }
      : null,
    aggregatedRent: u.rentAmount || 0,
    aggregatedCollection: 0,
    synthetic: 'unit',
    children: [],
  });

  const floors = new Map<string, SubPropertyListItem[]>();
  const loose: SubPropertyListItem[] = [];
  for (const u of units) {
    const f = u.floor?.trim();
    if (f) {
      if (!floors.has(f)) floors.set(f, []);
      floors.get(f)!.push(u);
    } else {
      loose.push(u);
    }
  }

  const children: RentableEntityNode[] = [];
  for (const [floorName, list] of floors) {
    const floorId = `floor-${propertyId}-${floorName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    children.push({
      id: floorId,
      displayId: null,
      propertyId,
      name: floorName,
      type: 'FLOOR' as RentableEntityType,
      code: floorName,
      areaSqft: null,
      rentAmount: 0,
      status: 'VACANT',
      notes: null,
      sortOrder: null,
      parentId: rootId,
      activeLease: null,
      aggregatedRent: list.reduce((s, u) => s + (u.rentAmount || 0), 0),
      aggregatedCollection: 0,
      synthetic: 'floor',
      children: list.map((u) => unitNode(u, floorId)),
    });
  }
  for (const u of loose) children.push(unitNode(u, rootId));

  return [
    {
      id: rootId,
      displayId: null,
      propertyId,
      name: propertyName,
      type: 'PROPERTY' as RentableEntityType,
      code: 'ROOT',
      areaSqft: null,
      rentAmount: 0,
      status: 'VACANT',
      notes: null,
      sortOrder: null,
      parentId: null,
      activeLease: null,
      aggregatedRent: units.reduce((sum, u) => sum + (u.rentAmount || 0), 0),
      aggregatedCollection: 0,
      synthetic: 'root',
      children,
    },
  ];
}

/** Number of nodes in a tree (used for the "Hierarchy Tree (n)" tab label). */
export function countTreeNodes(nodes: RentableEntityNode[]): number {
  let n = 0;
  for (const x of nodes) n += 1 + countTreeNodes(x.children ?? []);
  return n;
}
