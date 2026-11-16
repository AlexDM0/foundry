/**
 * The real-system spec of overseer-fetch against a forge at the one system version Gaia supports, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-supported-forge` with the program of such a forge. Flint's brain's
 * states are `overseer-fetch-flint-brain`'s.
 */
import { describeSupportedForgeRecording } from '../../testing/SupportedForgeRecording.ts';

describeSupportedForgeRecording('overseer-fetch-supported-forge', 'supported-forge');
