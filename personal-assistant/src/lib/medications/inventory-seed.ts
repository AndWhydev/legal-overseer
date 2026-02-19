import type { InventoryItem, InTransitItem } from './types'

/**
 * Current on-hand inventory as of Feb 18, 2026.
 * Daily usage is estimated from seed-data.ts schedule patterns.
 */
export const inventoryItems: InventoryItem[] = [
  {
    medicationId: 'omega',
    currentStock: 30,
    daysRemaining: 15,   // ~2/day
    stockHealth: 'green',
  },
  {
    medicationId: 'astax',
    currentStock: 30,
    daysRemaining: 30,   // ~1/day
    stockHealth: 'green',
  },
  {
    medicationId: 'iso',
    currentStock: 34,
    daysRemaining: 17,   // ~2/day (20mg caps)
    stockHealth: 'green',
    scriptExpiry: '2026-05-01',
    scriptRepeatsLeft: 3,
  },
  {
    medicationId: 'clon',
    currentStock: 20,
    daysRemaining: 20,   // ~1/day
    stockHealth: 'green',
    scriptExpiry: '2026-06-01',
    scriptRepeatsLeft: 2,
  },
  {
    medicationId: 'thea',
    currentStock: 15,
    daysRemaining: 7,    // ~2/day
    stockHealth: 'amber',
  },
  {
    medicationId: 'mag',
    currentStock: 10,
    daysRemaining: 10,   // ~1/day
    stockHealth: 'amber',
  },
  {
    medicationId: 'dex',
    currentStock: 30,
    daysRemaining: 5,    // ~6/day when active
    stockHealth: 'red',
    scriptExpiry: '2026-04-15',
    scriptRepeatsLeft: 1,
  },
  {
    medicationId: 'escit',
    currentStock: 28,
    daysRemaining: 28,   // sporadic use
    stockHealth: 'green',
    scriptExpiry: '2026-07-01',
    scriptRepeatsLeft: 4,
  },
  // Propranolol — only 1 left, critical
  {
    medicationId: 'prop',
    currentStock: 1,
    daysRemaining: 1,
    stockHealth: 'red',
    scriptExpiry: '2026-05-01',
    scriptRepeatsLeft: 2,
  },
]

/**
 * In-transit items — ordered, not yet arrived.
 */
export const inTransitItems: InTransitItem[] = [
  {
    medicationId: 'melatonin',
    name: 'Melatonin 20mg',
    quantity: 120,
    form: 'Small white disk tablets (12 strips)',
    arrived: false,
  },
  {
    medicationId: 'iso-10',
    name: 'Isotretinoin 10mg',
    quantity: 200,
    form: 'Orange softgel capsules (20 strips)',
    arrived: false,
  },
  {
    medicationId: 'prop',
    name: 'Propranolol 40mg',
    quantity: 200,
    form: 'Small green round tablets, score line (2 boxes)',
    arrived: false,
  },
  {
    medicationId: 'modafinil',
    name: 'Modafinil 200mg',
    quantity: 100,
    form: 'White round tablets (1 pack)',
    arrived: false,
  },
  {
    medicationId: 'baclofen',
    name: 'Baclofen 10mg',
    quantity: 200,
    form: 'White round tablets (2 packs)',
    arrived: false,
  },
  {
    medicationId: 'mk677',
    name: 'MK-677 10mg',
    quantity: 100,
    form: 'White round tablets (1 pack)',
    arrived: false,
  },
  {
    medicationId: 'creatine',
    name: 'Creatine Monohydrate 750mg',
    quantity: 240,
    form: 'Clear capsules with white powder',
    arrived: false,
  },
  {
    medicationId: 'lycopene',
    name: 'Lycopene 20mg',
    quantity: 60,
    form: 'Red softgel capsules',
    arrived: false,
  },
]
