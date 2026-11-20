/**
 * The constitution commit of a draft over entities. What matters: the request lists each entity's drafted constitution and none of the
 * forge's own, the Airlock reads every entity's constitution path on main, and once main holds every drafted text, as after a commit
 * landed or a hand commit of it, stage 2 runs with no commit: the drafted entity names its file, an entity with no draft adopts the file
 * main holds, and the first Apply over entities starts the product owner for the committed tickets without one; a ticket that started while
 * the request waited refuses it E94 before anything is stored, the same check the landing makes before it lands. A forge without entities
 * lists `CONSTITUTION.md` alone, which `Airlocks.constitutionCommit.spec.ts` holds.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { MainConstitution }                                           from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { useRecordedGit }                                                  from '../../testing/RecordedGit.ts';
import { entityAssignmentRequestOf }                                       from '../control/EntityAssignmentRequest.ts';
import { createRecordedAirlocksHarness, HARNESS_AT, type AirlocksHarness } from './testing/AirlocksHarness.ts';

useRecordedGit();

const WEB_TEXT = '# Web\n\n- Keep the basket page fast.\n';

const DESIGN_SYSTEM_TEXT = '# Design system\n\n- Compose before you add a part.\n';

const DESIGN_SYSTEM_FILE: MainConstitution = { path: 'packages/design-system/CONSTITUTION.md', markdown: DESIGN_SYSTEM_TEXT, blob: 'b'.repeat(40) };

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

/** An update of the stored pipeline into the entities `web` and `design-system`, `web`'s constitution drafted, Apply requested. */
function harnessWithAnEntityApply(): { current: AirlocksHarness; setupId: string } {
  const current = createRecordedAirlocksHarness([{ id: '021', status: 'committed' }]);
  harness = current;
  const { board } = current;
  board.addGate({ name: 'merge-tests', run: 'bun test' }, HARNESS_AT, ['merge']);
  const { setupId } = board.openSetup({
    mode: 'update', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, HARNESS_AT).setup;
  board.editDraft(setupId, {
    by:       'user',
    revision: 0,
    edits:    [
      { edit: { target: 'entity', entityKey: 'web', value: { kind: 'app', home: ['/apps/web'] } }, summary: 'The web app.' },
      { edit: { target: 'entity', entityKey: 'design-system', value: { kind: 'package', home: ['/packages/design-system'] } }, summary: 'The design system.' },
    ],
  }, HARNESS_AT);
  board.editConstitution(setupId, { revision: 0, markdown: WEB_TEXT }, HARNESS_AT, 'web');
  const requested = board.requestApply(setupId, {
    draftRevision: 1, resumesBoard: false, mainConstitution: null, entityConstitutions: { 'web': null, 'design-system': DESIGN_SYSTEM_FILE }
  }, HARNESS_AT);
  expect(requested.outcome).toBe('committing');
  return { current, setupId };
}

describe('a constitution commit over entities', () => {
  test('finishes with no commit once main holds every drafted text, adopting a file main holds and starting the product owner', async () => {
    const { current } = harnessWithAnEntityApply();
    const askedPaths: string[] = [];
    current.settings.mainConstitutionAtPath = (constitutionPath) => {
      askedPaths.push(constitutionPath);
      if (constitutionPath === DESIGN_SYSTEM_FILE.path) return { verdict: 'read', constitution: DESIGN_SYSTEM_FILE };
      return { verdict: 'read', constitution: { path: constitutionPath, markdown: WEB_TEXT, blob: 'c'.repeat(40) } };
    };

    await current.slots.sweep();

    expect(askedPaths).toEqual(['apps/web/CONSTITUTION.md', 'packages/design-system/CONSTITUTION.md']);
    expect(current.board.pipelineSetup()).toBeNull();
    const entities = current.board.pipeline()?.entities ?? {};
    expect(entities['web']?.constitution).toEqual({ path: 'apps/web/CONSTITUTION.md' });
    expect(entities['design-system']?.constitution).toEqual({ path: DESIGN_SYSTEM_FILE.path });
    expect(current.board.jobs().filter((job) => job.kind === 'constitution-commit')).toEqual([]);
    const productOwner = current.board.jobs().find((job) => job.kind === 'product-owner');
    expect(productOwner?.intake?.text).toBe(entityAssignmentRequestOf(['021']));
  });

  test('refuses the request entities-while-tickets-in-flight when a committed ticket started while it waited, and stores nothing', async () => {
    const { current } = harnessWithAnEntityApply();
    current.board.moveTicket('021', 'in-progress', { checksLegality: false }, HARNESS_AT);
    const storedBefore = current.board.pipeline();
    current.settings.mainConstitutionAtPath = (constitutionPath) => {
      if (constitutionPath === DESIGN_SYSTEM_FILE.path) return { verdict: 'read', constitution: DESIGN_SYSTEM_FILE };
      return { verdict: 'read', constitution: { path: constitutionPath, markdown: WEB_TEXT, blob: 'c'.repeat(40) } };
    };

    await current.slots.sweep();

    expect(current.board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'refused', reason: 'entities-while-tickets-in-flight' });
    expect(current.board.pipeline()).toEqual(storedBefore);
    expect(current.board.jobs().filter((job) => job.kind === 'product-owner')).toEqual([]);
  });
});
