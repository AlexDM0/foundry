/**
 * Calls are a median while tokens are a mean, each pinned by a cohort with one outlier, and a split places every agent, one with no stamp
 * included. The rows are constructed, as the claim is about the arithmetic.
 */
import { describe, expect, test } from 'bun:test';

import type { SubagentUsage } from '../../../../src/lib/agent-launch/AgentTranscripts.ts';
import { UsageCohortUtil }    from './UsageCohortUtil.ts';

const { cohortSplitAt, cohortSummaryOf } = UsageCohortUtil;

interface ConstructedUsage {
  apiCallCount?:                number;
  inputTokens?:                 number;
  cacheReadInputTokens?:        number;
  outputTokens?:                number;
  endContextTokens?:            number;
  oversizedContextTokens?:      number;
  browserCallCount?:            number;
  shellEditScriptCount?:        number;
  verificationRunCount?:        number;
  nestedInstructionCharacters?: number;
  startedAt?:                   string | null;
}

/** `totalInputTokens` is fresh input plus both cache figures, as the adapter answers it. */
function usageRow(fields: ConstructedUsage): SubagentUsage {
  const inputTokens          = fields.inputTokens ?? 0;
  const cacheReadInputTokens = fields.cacheReadInputTokens ?? 0;
  return {
    sessionIdentifier:           'session-example',
    agentIdentifier:             'agent-example',
    transcriptPath:              '/example/transcripts/agent-example.jsonl',
    startedAt:                   fields.startedAt ?? null,
    model:                       'example-model',
    apiCallCount:                fields.apiCallCount ?? 0,
    inputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens:    0,
    outputTokens:                fields.outputTokens ?? 0,
    totalInputTokens:            inputTokens + cacheReadInputTokens,
    endContextTokens:            fields.endContextTokens ?? 0,
    oversizedContextTokens:      fields.oversizedContextTokens ?? 0,
    browserCallCount:            fields.browserCallCount ?? 0,
    shellEditScriptCount:        fields.shellEditScriptCount ?? 0,
    verificationRunCount:        fields.verificationRunCount ?? 0,
    nestedInstructionCharacters: fields.nestedInstructionCharacters ?? 0,
    briefExcerpt:                'Do the thing',
  };
}

describe('what a cohort of transcripts is summarised as', () => {
  /** The reason for the median: an agent stuck in a screenshot loop must not decide what a typical agent did. */
  test('one runaway agent moves the mean input and leaves the median call count where the cohort is', () => {
    const cohort = [
      usageRow({ apiCallCount: 30, inputTokens: 1_000, endContextTokens: 100_000 }),
      usageRow({ apiCallCount: 32, inputTokens: 2_000, endContextTokens: 160_000 }),
      usageRow({ apiCallCount: 34, inputTokens: 3_000, endContextTokens: 170_000 }),
      usageRow({ apiCallCount: 36, inputTokens: 4_000, endContextTokens: 180_000 }),
      usageRow({ apiCallCount: 400, inputTokens: 990_000, endContextTokens: 720_000 }),
    ];

    const summary = cohortSummaryOf(cohort);

    expect(summary.transcriptCount).toBe(5);
    expect(summary.medianApiCallCount).toBe(34);
    expect(summary.medianEndContextTokens).toBe(170_000);
    expect(summary.meanTotalInputTokens).toBe(200_000);
  });

  test('the input figure is the whole of what was sent, cache reads included', () => {
    const cohort = [
      usageRow({ inputTokens: 1_000, cacheReadInputTokens: 9_000 }),
      usageRow({ inputTokens: 3_000, cacheReadInputTokens: 7_000 }),
    ];

    expect(cohortSummaryOf(cohort).meanTotalInputTokens).toBe(10_000);
  });

  test('an even count takes the two middle values, so neither of a pair is reported as the cohort', () => {
    const cohort = [usageRow({ apiCallCount: 10 }), usageRow({ apiCallCount: 21 })];

    expect(cohortSummaryOf(cohort).medianApiCallCount).toBe(15.5);
  });

  /** A cohort where one agent in five reached for the browser has to read as 0.2, not as 0, which is why this mean alone is not rounded. */
  test('the mean browser call count keeps its fraction while the token means are whole', () => {
    const cohort = [
      usageRow({ browserCallCount: 1, outputTokens: 1_000 }),
      usageRow({ browserCallCount: 0, outputTokens: 1_001 }),
      usageRow({ browserCallCount: 0, outputTokens: 1_001 }),
      usageRow({ browserCallCount: 0, outputTokens: 1_001 }),
      usageRow({ browserCallCount: 0, outputTokens: 1_001 }),
    ];

    const summary = cohortSummaryOf(cohort);

    expect(summary.meanBrowserCallCount).toBeCloseTo(0.2);
    expect(Number.isInteger(summary.meanOutputTokens)).toBe(true);
  });

  /** Each agent's own share, averaged: one agent that sent ten times as much as the rest must not decide the cohort's share on its own. */
  test('the oversized share is the mean of each agent\'s share of its own input, not of the cohort\'s pooled tokens', () => {
    const cohort = [
      usageRow({ inputTokens: 100, oversizedContextTokens: 100 }),
      usageRow({ inputTokens: 100_000, oversizedContextTokens: 0 }),
    ];

    expect(cohortSummaryOf(cohort).meanOversizedContextShare).toBeCloseTo(0.5);
  });

  test('an agent that sent nothing counts as a zero share rather than dividing by zero', () => {
    expect(cohortSummaryOf([usageRow({})]).meanOversizedContextShare).toBe(0);
  });

  /** The two figures a breached brief shows up in: editing through Bash, and checking after every edit. */
  test('the bash edit scripts and the verification runs are averaged, fraction and all', () => {
    const cohort = [
      usageRow({ shellEditScriptCount: 4, verificationRunCount: 9 }),
      usageRow({ shellEditScriptCount: 1, verificationRunCount: 0 }),
    ];

    const summary = cohortSummaryOf(cohort);

    expect(summary.meanBashEditScriptCount).toBeCloseTo(2.5);
    expect(summary.meanVerificationRunCount).toBeCloseTo(4.5);
  });

  test('the injected characters are averaged too, because that is the part of the length nobody wrote', () => {
    const cohort = [usageRow({ nestedInstructionCharacters: 1_000 }), usageRow({ nestedInstructionCharacters: 3_000 })];

    expect(cohortSummaryOf(cohort).meanNestedInstructionCharacters).toBe(2_000);
  });

  /** A side of a split that nothing fell into still gets a line printed for it, so it must answer zeroes rather than `null` or a throw. */
  test('an empty cohort is zero of everything and not an error', () => {
    expect(cohortSummaryOf([])).toEqual({
      transcriptCount:                 0,
      medianApiCallCount:              0,
      medianEndContextTokens:          0,
      meanTotalInputTokens:            0,
      meanOutputTokens:                0,
      meanBrowserCallCount:            0,
      meanOversizedContextShare:       0,
      meanBashEditScriptCount:         0,
      meanVerificationRunCount:        0,
      meanNestedInstructionCharacters: 0,
    });
  });
});

describe('splitting a cohort on an instant', () => {
  const BOUNDARY = new Date('2026-09-19T08:55:00Z');

  test('before is what started strictly earlier and after holds the boundary itself', () => {
    const earlier    = usageRow({ apiCallCount: 1, startedAt: '2026-09-19T08:54:59.000Z' });
    const onTheMark  = usageRow({ apiCallCount: 2, startedAt: '2026-09-19T08:55:00.000Z' });
    const later      = usageRow({ apiCallCount: 3, startedAt: '2026-09-19T09:30:00.000Z' });

    const split = cohortSplitAt([later, earlier, onTheMark], BOUNDARY);

    expect(split.before.map((entry) => entry.apiCallCount)).toEqual([1]);
    expect(split.after.map((entry) => entry.apiCallCount)).toEqual([3, 2]);
  });

  /** Fail closed: an agent that cannot be shown to have run after the change must never be counted as evidence the change helped. */
  test('a subagent with no stamp, and one whose stamp will not parse, both fall on the before side', () => {
    const undated    = usageRow({ apiCallCount: 1, startedAt: null });
    const unreadable = usageRow({ apiCallCount: 2, startedAt: 'the day before yesterday' });

    const split = cohortSplitAt([undated, unreadable], BOUNDARY);

    expect(split.before).toHaveLength(2);
    expect(split.after).toEqual([]);
  });

  test('a stamp with an offset is compared as the instant it names, not as the digits it is written with', () => {
    // 10:55 in +02:00 is 08:55 UTC, so this is the boundary itself and belongs on the after side.
    const split = cohortSplitAt([usageRow({ startedAt: '2026-09-19T10:55:00+02:00' })], BOUNDARY);

    expect(split.after).toHaveLength(1);
  });

  test('an empty cohort splits into two empty sides', () => {
    expect(cohortSplitAt([], BOUNDARY)).toEqual({ before: [], after: [] });
  });
});
