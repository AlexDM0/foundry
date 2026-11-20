/**
 * Gaia's health contract, `GET /api/v1/health` and `/api/health`: that a server is Gaia, at which health and install version, and how far
 * it is with its forges. The page server answers it; the launcher's probe and `serve`'s refusal of a second Gaia read it.
 */
import { JsonValueUtil }          from '../../lib/json-value/JsonValueUtil.ts';
import { GAIA_INSTALL_VERSION }   from '../../shared/constants/InstallVersion.ts';
import { PAGE_CONTRACT_VERSIONS } from '../../shared/constants/PageContractVersions.ts';
import { PRODUCT_NAMES }          from '../../shared/constants/ProductNames.ts';
import { ContractVersionUtil }    from '../../shared/utils/ContractVersionUtil.ts';

/** `forgesRegistered` counts the forges the registry names and the settings do not hide; `forgesAnswered` those Gaia has a reading of. */
export interface ForgeCounts {
  readonly forgesRegistered: number;
  readonly forgesAnswered:   number;
}

export interface HealthDocument extends ForgeCounts {
  readonly application:    typeof PRODUCT_NAMES.programName;
  readonly healthVersion:  typeof PAGE_CONTRACT_VERSIONS.gaiaHealth;
  readonly installVersion: typeof GAIA_INSTALL_VERSION;
}

export function healthDocumentOf(forgeCounts: ForgeCounts): HealthDocument {
  return {
    application:      PRODUCT_NAMES.programName,
    healthVersion:    PAGE_CONTRACT_VERSIONS.gaiaHealth,
    installVersion:   GAIA_INSTALL_VERSION,
    forgesRegistered: forgeCounts.forgesRegistered,
    forgesAnswered:   forgeCounts.forgesAnswered,
  };
}

function ownValueOf(parsed: unknown, key: string): unknown {
  const document = JsonValueUtil.jsonObjectOf(parsed);
  return document === null ? undefined : JsonValueUtil.ownValueOf(document, key);
}

/** Whether a parsed answer of the health route says Gaia, at whatever health version: an older Gaia on the port is still a Gaia. */
export function answerIsGaiaHealth(parsed: unknown): boolean {
  return ownValueOf(parsed, 'application') === PRODUCT_NAMES.programName;
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

const HEALTH_VERSION_KEYS = { majorKey: 'healthVersion' } as const;

/** The forge counts of a Gaia health answer at the known health version; `null` at another version or for counts that are no counts. */
export function forgeCountsOf(parsed: unknown): ForgeCounts | null {
  if (!answerIsGaiaHealth(parsed) || ContractVersionUtil.readMajorOf(parsed, HEALTH_VERSION_KEYS, PAGE_CONTRACT_VERSIONS.gaiaHealth) === null) return null;
  const forgesRegistered = ownValueOf(parsed, 'forgesRegistered');
  const forgesAnswered   = ownValueOf(parsed, 'forgesAnswered');
  return isCount(forgesRegistered) && isCount(forgesAnswered) ? { forgesRegistered, forgesAnswered } : null;
}
