/**
 * The real-system spec of hephaestus-fetch against a forge at the one system version Gaia supports, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record hephaestus-fetch-supported-forge` with the program of such a forge.
 */
import { describeSupportedForgeRecording } from '../../testing/SupportedForgeRecording.ts';

describeSupportedForgeRecording('hephaestus-fetch-supported-forge');
