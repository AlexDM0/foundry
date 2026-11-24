/**
 * The kept runs of the agent's programs, on the answers the real program check recorded and a program file identity the spec sets. What
 * matters: a run is answered as kept while the program file is the one that ran; once the file is replaced, rewritten or removed the kept
 * run is no longer answered and the program runs anew, so a view never shows "runs" for a program that is gone.
 */
import { expect, test } from 'bun:test';

import { createPosixLaunchEnvironment }                     from '../../lib/agent-launch/PosixLaunchEnvironment.ts';
import { createPosixExecutableResolver }                    from '../../lib/executable-resolver/PosixExecutableResolver.ts';
import { fakeAgentAdapter }                                 from '../../testing/FakeAgentAdapter.ts';
import { PROGRAM_CHECK_RECORDING, recordedProgramCheckRun } from '../../testing/RecordedProgramChecks.ts';
import { waitUntil }                                        from '../../testing/WaitUntil.ts';
import { AgentProgramChecks }                               from './AgentProgramChecks.ts';

const PROGRAM = '/opt/example/bin/agent';

test('a kept run is answered while its program file stays the same, and a replaced or removed file runs the program anew', async () => {
  let programIsThere = true;
  let identity: string | null = 'example-file-1';
  let runs = 0;
  const recordedRun = recordedProgramCheckRun({ [PROGRAM]: PROGRAM_CHECK_RECORDING.ANSWERS });
  const checks = new AgentProgramChecks(
    {
      adapter:  fakeAgentAdapter(),
      resolver: createPosixExecutableResolver({
        lookUp:        () => null,
        realPathOf:    (path) => path,
        programKindOf: () => (programIsThere ? 'program' : 'missing'),
      }),
      forbiddenRoots:       [],
      launchEnvironment:    createPosixLaunchEnvironment(() => []),
      inheritedEnvironment: {},
      run:                  async (request) => {
        runs += 1;
        return await recordedRun(request);
      },
      timeoutMilliseconds: 1000,
    },
    () => undefined,
    () => identity,
  );

  expect(checks.checkOf(PROGRAM)).toBeNull();
  await waitUntil(() => checks.checkOf(PROGRAM)?.verdict === 'runs', () => 'the first run of the program');
  expect(checks.checkOf(PROGRAM)?.verdict).toBe('runs');
  expect(runs).toBe(1);

  identity = 'example-file-2';
  expect(checks.checkOf(PROGRAM)).toBeNull();
  await waitUntil(() => runs === 2 && checks.checkOf(PROGRAM) !== null, () => 'the run of the replaced program');

  programIsThere = false;
  identity = null;
  expect(checks.checkOf(PROGRAM)).toBeNull();
  await waitUntil(() => checks.checkOf(PROGRAM) !== null, () => 'the check of the removed program');
  expect(checks.checkOf(PROGRAM)).toMatchObject({ verdict: 'does-not-run', cause: 'not-there' });
  expect(runs).toBe(2);
});
