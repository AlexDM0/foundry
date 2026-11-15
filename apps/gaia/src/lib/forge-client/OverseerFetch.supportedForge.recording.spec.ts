/**
 * The real-system spec of overseer-fetch against a forge at the one system version Gaia supports, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-supported-forge` with the program of such a forge. No released
 * forge serves `/api/versions`, the versioned paths or Flint's brain yet (V1 to V3, G1 to G3), so its recording is authored from those
 * requirements until one does.
 */
import { describeSupportedForgeRecording } from '../../testing/SupportedForgeRecording.ts';

describeSupportedForgeRecording('overseer-fetch-supported-forge');
