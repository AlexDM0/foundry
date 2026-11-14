/**
 * The real-system spec of overseer-fetch against a forge that serves every contract at the monitor contract this Gaia knows, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-every-contract` with the program of such a forge.
 */
import { CONTRACT_VERSIONS }              from '../../shared/constants/ContractVersions.ts';
import { describeEveryContractRecording } from '../../testing/EveryContractRecording.ts';

describeEveryContractRecording({
  recordingName:  'overseer-fetch-every-contract',
  monitorVersion: CONTRACT_VERSIONS.forgeMonitor,
  controlVersion: CONTRACT_VERSIONS.forgeControl,
});
