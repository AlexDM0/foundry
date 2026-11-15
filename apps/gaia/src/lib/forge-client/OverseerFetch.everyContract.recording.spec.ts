/**
 * The real-system spec of overseer-fetch against a forge that serves every contract at monitor contract 2, which Gaia still reads and
 * migrates, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-every-contract` with the program of such a
 * forge. Monitor contract 3, the brain's, is held by `overseer-fetch-monitor-3`.
 */
import { CONTRACT_VERSIONS }              from '../../shared/constants/ContractVersions.ts';
import { describeEveryContractRecording } from '../../testing/EveryContractRecording.ts';

describeEveryContractRecording({
  recordingName:  'overseer-fetch-every-contract',
  monitorVersion: 2,
  controlVersion: CONTRACT_VERSIONS.forgeControl,
});
