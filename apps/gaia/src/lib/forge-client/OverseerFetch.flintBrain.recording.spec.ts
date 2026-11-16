/**
 * The real-system spec of overseer-fetch against a forge that runs Flint's brain, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-flint-brain` with the program of such a forge. No forge serves the
 * brain (G1 to G3) before forge 1.1, so its recording is authored from those requirements until one does.
 */
import { describeSupportedForgeRecording } from '../../testing/SupportedForgeRecording.ts';

describeSupportedForgeRecording('overseer-fetch-flint-brain', 'flint-brain');
