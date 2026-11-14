/**
 * The real-system spec of overseer-fetch against a forge that serves every contract at monitor contract 1, which Gaia still reads and
 * migrates, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-monitor-1` with the program of such a forge,
 * such as a forge checkout at 55beb9cd.
 */
import { describeEveryContractRecording } from '../../testing/EveryContractRecording.ts';

describeEveryContractRecording({ recordingName: 'overseer-fetch-monitor-1', monitorVersion: 1 });
