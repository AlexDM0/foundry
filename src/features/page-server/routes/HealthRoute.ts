/**
 * `GET /api/health`, open to any local caller: that this server is Gaia, at which health and install version, and how far it is with its
 * forges. The launcher's probe and the splash's progress read it, and `serve` reads it to refuse a second Gaia on the same port.
 */
import { CONTRACT_VERSIONS }    from '../../../shared/constants/ContractVersions.ts';
import { GAIA_INSTALL_VERSION } from '../../../shared/constants/InstallVersion.ts';
import { PRODUCT_NAMES }        from '../../../shared/constants/ProductNames.ts';

export const HEALTH_PATH = '/api/health';

/** `forgesRegistered` counts the forges the registry names and the settings do not hide; `forgesAnswered` those Gaia has a reading of. */
export interface ForgeCounts {
  readonly forgesRegistered: number;
  readonly forgesAnswered:   number;
}

export interface HealthDocument extends ForgeCounts {
  readonly application:    typeof PRODUCT_NAMES.programName;
  readonly healthVersion:  typeof CONTRACT_VERSIONS.gaiaHealth;
  readonly installVersion: typeof GAIA_INSTALL_VERSION;
}

export function healthDocumentOf(forgeCounts: ForgeCounts): HealthDocument {
  return {
    application:      PRODUCT_NAMES.programName,
    healthVersion:    CONTRACT_VERSIONS.gaiaHealth,
    installVersion:   GAIA_INSTALL_VERSION,
    forgesRegistered: forgeCounts.forgesRegistered,
    forgesAnswered:   forgeCounts.forgesAnswered,
  };
}

/** Whether a parsed answer of the health route says Gaia, at whatever health version: an older Gaia on the port is still a Gaia. */
export function answerIsGaiaHealth(parsed: unknown): boolean {
  return typeof parsed === 'object' && parsed !== null && Object.hasOwn(parsed, 'application')
    && (parsed as { readonly application: unknown }).application === PRODUCT_NAMES.programName;
}

export function healthAnswerOf(forgeCounts: ForgeCounts): Response {
  return Response.json(healthDocumentOf(forgeCounts), { headers: { 'cache-control': 'no-store' } });
}
