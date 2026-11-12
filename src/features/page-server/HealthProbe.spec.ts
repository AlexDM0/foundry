/**
 * The health probe against servers of this spec on loopback ports: a health answer that says Gaia, at any health version, is Gaia; any
 * other answer is another program; a port where nothing listens answers nothing. The page server's spec proves the probe against a real
 * Gaia.
 */
import { describe, expect, test } from 'bun:test';

import { healthProbeVerdictFor } from './HealthProbe.ts';

const SHORT_PROBE_MILLISECONDS = 500;

async function verdictAgainst(answer: () => Response): Promise<string> {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answer });
  try {
    return await healthProbeVerdictFor(server.port ?? 0, SHORT_PROBE_MILLISECONDS);
  } finally {
    await server.stop(true);
  }
}

describe('the health probe', () => {
  test('knows Gaia by its health answer, also at another health version', async () => {
    expect(await verdictAgainst(() => Response.json({ application: 'gaia', healthVersion: 2 }))).toBe('gaia-answers');
  });

  test('takes a JSON answer of another application for another program', async () => {
    expect(await verdictAgainst(() => Response.json({ application: 'example-application' }))).toBe('another-program-answers');
  });

  test('takes an answer that is no JSON for another program', async () => {
    expect(await verdictAgainst(() => new Response('<!doctype html>'))).toBe('another-program-answers');
  });

  test('answers nothing for a port where nothing listens', async () => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const freedPort = server.port ?? 0;
    await server.stop(true);
    expect(await healthProbeVerdictFor(freedPort, SHORT_PROBE_MILLISECONDS)).toBe('nothing-answers');
  });
});
