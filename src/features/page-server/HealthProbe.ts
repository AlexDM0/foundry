/** Asks the health route of a port of 127.0.0.1 whether Gaia already serves there, so a second Gaia refuses to start beside it. */
import { answerIsGaiaHealth, HEALTH_PATH } from './routes/HealthRoute.ts';

export type HealthProbeVerdict = 'gaia-answers' | 'another-program-answers' | 'nothing-answers';

/** A Gaia that is up answers its health at once; one that takes longer is treated as absent, and the port then decides. */
export const HEALTH_PROBE_TIMEOUT_MILLISECONDS = 1_000;

export async function healthProbeVerdictFor(port: number, timeoutMilliseconds = HEALTH_PROBE_TIMEOUT_MILLISECONDS): Promise<HealthProbeVerdict> {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMilliseconds) });
  } catch {
    return 'nothing-answers';
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return 'another-program-answers';
  }
  return answerIsGaiaHealth(parsed) ? 'gaia-answers' : 'another-program-answers';
}
