/**
 * The stage moves of a crossing ticket (strategy 4.2 and 5.2 to 5.7). What matters: the first crossing runs build, package build, package
 * review, adapt and review in that order, and adapt may be skipped; every way back the strategy names is legal and nothing else is, so a
 * later unit cannot jump a package review or a seal; only a move from `adapt` or `review` into a package build counts as a package return,
 * since the second one opens a decision; a stage's number is the job's `stage`, and its counter key is its job launch's key, so a return to
 * a stage finds its counts; and a stage name read from outside is a membership test.
 */
import { describe, expect, test } from 'bun:test';

import type { TicketStageName }                                     from '../@types/Task.ts';
import { LEGAL_SOURCE_STAGES_FOR_TICKET_STAGE, TICKET_STAGE_NAMES } from '../constants/TicketStages.ts';
import { FailedPassUtil }                                           from './FailedPassUtil.ts';
import { TicketStageUtil }                                          from './TicketStageUtil.ts';

const {
  stageNameIsKnown, stageNumberOf, stageKeyOf, stageMoveIsLegal, stageMoveIsAPackageReturn
} = TicketStageUtil;

function legalMovesOf(): string[] {
  return TICKET_STAGE_NAMES.flatMap((current) => TICKET_STAGE_NAMES.filter((target) => stageMoveIsLegal(current, target)).map((target) => `${current} -> ${target}`));
}

describe('the stage move table', () => {
  test('names every stage, and no stage reaches itself', () => {
    expect(Object.keys(LEGAL_SOURCE_STAGES_FOR_TICKET_STAGE).sort()).toEqual([...TICKET_STAGE_NAMES].sort());
    for (const [target, sources] of Object.entries(LEGAL_SOURCE_STAGES_FOR_TICKET_STAGE)) expect(sources, target).not.toContain(target);
  });

  test('the first crossing runs every stage in order, and adapt may be skipped (E40)', () => {
    expect(stageMoveIsLegal('build', 'package-build')).toBe(true);
    expect(stageMoveIsLegal('package-build', 'package-review')).toBe(true);
    expect(stageMoveIsLegal('package-review', 'adapt')).toBe(true);
    expect(stageMoveIsLegal('adapt', 'review')).toBe(true);
    expect(stageMoveIsLegal('package-review', 'review')).toBe(true);
  });

  test('every way back the strategy names is legal', () => {
    expect(stageMoveIsLegal('package-build', 'build'), 'E22: a refused package change').toBe(true);
    expect(stageMoveIsLegal('package-review', 'package-build'), 'E34, and the next package').toBe(true);
    expect(stageMoveIsLegal('adapt', 'package-build'), 'E41, E42').toBe(true);
    expect(stageMoveIsLegal('review', 'adapt'), 'E51, E52, E65 for a home gate').toBe(true);
    expect(stageMoveIsLegal('review', 'package-build'), 'E65 for a package or dependent gate').toBe(true);
  });

  test('allows exactly these moves, so no stage skips a package review or a seal', () => {
    expect(legalMovesOf()).toEqual([
      'build -> package-build',
      'package-build -> build',
      'package-build -> package-review',
      'package-review -> package-build',
      'package-review -> adapt',
      'package-review -> review',
      'adapt -> package-build',
      'adapt -> review',
      'review -> package-build',
      'review -> adapt',
    ]);
  });
});

describe('a package return', () => {
  test('is a move from adapt or review into a package build', () => {
    expect(stageMoveIsAPackageReturn('adapt', 'package-build')).toBe(true);
    expect(stageMoveIsAPackageReturn('review', 'package-build')).toBe(true);
  });

  test('is not a package review that does not hold, the next package, or a refused change going back to build', () => {
    expect(stageMoveIsAPackageReturn('package-review', 'package-build')).toBe(false);
    expect(stageMoveIsAPackageReturn('build', 'package-build')).toBe(false);
    expect(stageMoveIsAPackageReturn('package-build', 'build')).toBe(false);
    expect(stageMoveIsAPackageReturn('review', 'adapt')).toBe(false);
  });
});

describe('a stage name and number', () => {
  test('a stage\'s number is its place in the crossing table, which a job stores as its stage', () => {
    const numbers = TICKET_STAGE_NAMES.map((name: TicketStageName) => stageNumberOf(name));
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });

  test('a stage\'s counter key is the key of its job launch, the same for every return to it and apart for each entity', () => {
    expect(stageKeyOf({ name: 'package-review', entity: 'design-system' })).toBe(FailedPassUtil.stageKeyOf({ entity: 'design-system', stage: 3 }));
    expect(stageKeyOf({ name: 'package-review', entity: 'design-system' })).toBe('design-system/3');
    expect(stageKeyOf({ name: 'package-review', entity: 'brand' })).not.toBe(stageKeyOf({ name: 'package-review', entity: 'design-system' }));
    expect(stageKeyOf({ name: 'review', entity: 'shop' })).not.toBe(stageKeyOf({ name: 'adapt', entity: 'shop' }));
  });

  test('only a stage name is known, never an inherited property or another word', () => {
    for (const name of TICKET_STAGE_NAMES) expect(stageNameIsKnown(name), name).toBe(true);
    for (const text of ['constructor', 'landing', 'Build', '']) expect(stageNameIsKnown(text), text).toBe(false);
  });
});
