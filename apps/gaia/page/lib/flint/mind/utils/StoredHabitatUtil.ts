/**
 * The stored habitat through the host's storage port: `<version>:<kind>`, the version `FLINT_CONTRACT_VERSIONS.storedHabitat`, an empty
 * kind the home. A value of another version, or none, reads as nothing stored, so Flint starts at home.
 */
import { FLINT_CONTRACT_VERSIONS }  from '../../SpriteHabitat.ts';
import { STORED_HABITAT_SEPARATOR } from '../../constants/Sensors.ts';

/** `kind` null is the home. */
export interface StoredHabitat {
  readonly kind: string | null;
}

const VERSION_PREFIX = `${FLINT_CONTRACT_VERSIONS.storedHabitat}${STORED_HABITAT_SEPARATOR}`;

export const StoredHabitatUtil = Object.freeze({
  storedValueOf: (kind: string | null): string => `${VERSION_PREFIX}${kind ?? ''}`,

  storedHabitatOf: (value: string | null): StoredHabitat | null => {
    if (value === null || !value.startsWith(VERSION_PREFIX)) return null;
    const kind = value.slice(VERSION_PREFIX.length);
    return { kind: kind === '' ? null : kind };
  },
});
