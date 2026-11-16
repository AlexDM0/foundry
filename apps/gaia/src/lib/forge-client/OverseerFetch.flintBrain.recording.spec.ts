/**
 * The real-system spec of overseer-fetch against a forge that runs Flint's brain, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-flint-brain` with the program of a forge at the version Gaia
 * supports, whose fake agent plays the brain's session, so the recording makes no model call.
 */
import { describeSupportedForgeRecording } from '../../testing/SupportedForgeRecording.ts';

describeSupportedForgeRecording('overseer-fetch-flint-brain', 'flint-brain');
