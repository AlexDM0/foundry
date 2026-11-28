/** Why forge's confinement refuses a session: the port has none here, or the profile allows some network domains, which it cannot hold. */
import type { ConfinementUnavailability } from '../../lib/gate-confinement/GateConfinement.ts';

export type ConfinementRefusal =
  | { readonly cause: 'confinement-unavailable'; readonly unavailability: ConfinementUnavailability }
  | { readonly cause: 'network-domains-unconfinable' };
