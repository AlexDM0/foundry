/**
 * The real-system spec of overseer-fetch against a forge at the one system version Gaia supports, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-supported-forge` with the program of such a forge. Forge 1.0
 * serves `/api/versions` and the versioned paths but not Flint's brain (G1 to G3), so its recording is authored from those requirements
 * until a forge serves them.
 */
import { describeSupportedForgeRecording } from '../../testing/SupportedForgeRecording.ts';

describeSupportedForgeRecording('overseer-fetch-supported-forge');
