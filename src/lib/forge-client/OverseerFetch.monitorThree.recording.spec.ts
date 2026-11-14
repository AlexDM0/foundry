/**
 * The real-system spec of overseer-fetch against a forge that serves every contract at monitor contract 3 and control contract 2, with
 * Flint's brain (G1 to G3), run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-monitor-3` with the program
 * of such a forge. Until a forge serves them, its recording is authored from those requirements.
 */
import { describeEveryContractRecording } from '../../testing/EveryContractRecording.ts';

describeEveryContractRecording({ recordingName: 'overseer-fetch-monitor-3', monitorVersion: 3, controlVersion: 2 });
