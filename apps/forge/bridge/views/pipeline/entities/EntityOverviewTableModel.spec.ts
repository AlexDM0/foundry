/**
 * The forge level's table of entities. What matters: one row per entity in the draft's order; a constitution drafted in this setup reads as
 * drafted before the path the entity names, an entity without one has the default, and a root without gates is kept for a person; an app
 * or a package without gates says so, plainly, and no row claims an entity is ready; the root's home reads as every other path.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineEntity }      from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { EntityOverviewTableModel } from './EntityOverviewTableModel.ts';

const NO_PHASES = { build: [], review: [], merge: [] };

const ENTITIES: Record<string, PipelineEntity> = {
  web: {
    kind: 'app', home: ['/apps/web', '/apps/web-shared'], prepare: [], gates: [{ name: 'lint', run: 'lint' }, { name: 'test', run: 'test' }], phases: NO_PHASES,
  },
  ui: {
    kind: 'package', home: ['/packages/ui'], constitution: { path: '/packages/ui/CONSTITUTION.md' }, prepare: [], gates: [], phases: NO_PHASES,
  },
  config: {
    kind: 'package', home: ['/packages/config'], prepare: [], gates: [{ name: 'lint', run: 'lint' }], phases: NO_PHASES
  },
  root: {
    kind: 'root', home: ['/'], prepare: [], gates: [], phases: NO_PHASES
  },
};

const CONSTITUTION_DRAFT = {
  markdown: '# Web', annotations: [], draftedFrom: { contributing: true, research: true, installedDefault: false }, baseBlob: null, revision: 1,
};

describe('a row of the entities table', () => {
  test('names each entity\'s kind, homes, gates, constitution and questions, in the draft\'s order', () => {
    const rows = EntityOverviewTableModel.rowsOf({
      entities:          ENTITIES,
      setupParts:        { web: { constitution: CONSTITUTION_DRAFT }, ui: { constitution: null } },
      openQuestionCount: (entityKey) => (entityKey === 'web' ? 2 : 0),
    });
    expect(rows.map((row) => [row.entityKey, row.kindText, row.homeText, row.gatesText, row.constitutionText, row.openQuestionCount])).toEqual([
      ['web', 'app', 'apps/web, apps/web-shared', '2 gates', 'Drafted', 2],
      ['ui', 'package', 'packages/ui', 'No gates', 'In its folder', 0],
      ['config', 'package', 'packages/config', '1 gate', 'Default', 0],
      ['root', 'root', 'every other path', 'None', 'For a person', 0],
    ]);
  });
});
