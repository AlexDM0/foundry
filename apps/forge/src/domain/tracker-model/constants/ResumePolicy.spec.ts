/**
 * The resume policy table is the one statement of how each interruption comes back: a cause missing from it, or a crash cause that waits
 * forever, would let work resume by itself after a crash or never resume after an answer. Each policy's causes are named here, so a row
 * moved to another policy fails one claim.
 */
import { expect, test } from 'bun:test';

import type { InterruptionCause }                         from '../@types/Job.ts';
import { CRASH_INTERRUPTION_CAUSES, INTERRUPTION_CAUSES } from './JobStates.ts';
import type { ResumePolicy }                              from './ResumePolicy.ts';
import { RESUME_POLICY_OF_CAUSE, WAITING_POLICIES }       from './ResumePolicy.ts';

function causesUnder(policy: ResumePolicy): InterruptionCause[] {
  return INTERRUPTION_CAUSES.filter((cause) => RESUME_POLICY_OF_CAUSE[cause] === policy).toSorted();
}

test('every interruption cause has exactly one policy, and the table names no other cause', () => {
  expect(Object.keys(RESUME_POLICY_OF_CAUSE).toSorted()).toEqual([...INTERRUPTION_CAUSES].toSorted());
});

test('the crash causes are exactly the causes resumed twice before they wait', () => {
  expect(causesUnder('resumes-twice-then-waits')).toEqual([...CRASH_INTERRUPTION_CAUSES].toSorted());
});

test('a reboot, a stop or crash of the forge, an ended lease and a network outage wait for an instruction', () => {
  expect(causesUnder('waits-for-instruction')).toEqual(['forge-crashed', 'forge-stopped', 'lease-ended', 'network-outage', 'reboot']);
});

test('an answer delivery, a red handoff, a usage limit and a paused Talos resume by themselves', () => {
  expect(causesUnder('resumes-by-itself')).toEqual(['answer-delivery', 'handoff-red', 'talos-paused', 'usage-limit']);
});

test('a refused forced stop never resumes, and a failed authentication resumes once its decision is answered', () => {
  expect(causesUnder('never-resumes')).toEqual(['forced-stop-refused']);
  expect(causesUnder('resumes-once-decision-answered')).toEqual(['authentication-failed']);
});

test('the waiting policies are waiting for an instruction and the crash bound once spent, and the table cannot be changed', () => {
  expect([...WAITING_POLICIES].toSorted()).toEqual(['resumes-twice-then-waits', 'waits-for-instruction']);
  expect(Object.isFrozen(RESUME_POLICY_OF_CAUSE)).toBe(true);
});
