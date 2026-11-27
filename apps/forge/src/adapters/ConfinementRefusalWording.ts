/** The words of a confinement that cannot be had or cannot hold a session, from its cause and the values it names. */
import type { ConfinementUnavailability } from '../lib/gate-confinement/GateConfinement.ts';
import type { ConfinementRefusal }        from '../shared/@types/ConfinementRefusal.ts';

function unavailabilitySentenceOf(unavailability: ConfinementUnavailability): string {
  switch (unavailability.cause) {
    case 'no-adapter':                    return `no gate confinement exists for the platform ${unavailability.platformName}`;
    case 'mechanism-unusable':            return `${unavailability.mechanism} cannot apply a profile here`;
    case 'bubblewrap-not-on-search-path': return 'bwrap (bubblewrap) is not on the search path';
    case 'bubblewrap-version-unread':     return `bwrap --version gave no version: ${unavailability.processMessage}`;
    case 'bubblewrap-namespaces-refused':
      return 'bwrap cannot create its namespaces here, as under an AppArmor user-namespace rule such as Ubuntu 24.04\'s'
        + ` kernel.apparmor_restrict_unprivileged_userns or in many containers: ${unavailability.processMessage}`;
  }
}

function sentenceOf(refusal: ConfinementRefusal): string {
  switch (refusal.cause) {
    case 'confinement-unavailable':      return unavailabilitySentenceOf(refusal.unavailability);
    case 'network-domains-unconfinable':
      return 'Hephaestus\'s confinement gives a session the network whole or not at all, and this session\'s profile'
        + ' allows only some domains, which it never widens';
  }
}

export const ConfinementRefusalWording = Object.freeze({
  unavailabilitySentenceOf,
  sentenceOf,
});
