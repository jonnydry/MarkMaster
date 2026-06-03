// Backward-compat re-export.
// New code should import directly from the canonical barrel:
//   import { orbital, OrbitalCard, TelemetryStat, MissionControlHeader, OrbitalBadge, OrbitalMenu, OrbitalActionPill } from '@/components/orbital'

export type { OrbitalTone } from '@/components/orbital';
export { orbital, primitives } from '@/components/orbital';

// Re-export the thin components for convenience inside the orbit folder
export {
  OrbitalCard,
  TelemetryStat,
  MissionControlHeader,
  OrbitalBadge,
  OrbitalRings,
  OrbitalMenu,
  OrbitalActionPill,
} from '@/components/orbital';

// New Orbit redesign components (pre-flight skeletons)
export { OrbitList } from './orbit-list';
export { OrbitListRow } from './orbit-list-row';
export { OrbitContextualMenu, OrbitActionPill } from './orbit-quick-actions';

export type { OrbitalRingsProps } from '@/components/orbital';
