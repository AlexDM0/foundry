/**
 * `GET /api/versions`, open to any local caller and never versioned or removed: Gaia's system version and the oldest Gaia a page or a
 * launcher may have been built for and still be served. A client reads it to learn which paths it may call.
 */
import type { VersionsDocument } from 'overseer-contracts/VersionsDocument';

import { GAIA_SYSTEM_VERSION, MINIMUM_SUPPORTED_GAIA_VERSION } from '../../../shared/constants/GaiaSystemVersions.ts';

export function versionsAnswerOf(): Response {
  const versionsDocument: VersionsDocument = { current: GAIA_SYSTEM_VERSION, minimumSupported: MINIMUM_SUPPORTED_GAIA_VERSION };
  return Response.json(versionsDocument, { headers: { 'cache-control': 'no-store' } });
}
