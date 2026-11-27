/**
 * The state of an entity's constitution: its own draft wins, a named file is adopted, a root without gates is kept for a person, any other
 * entity reads not started or the default, and the attention line counts only the default.
 */
import { describe, expect, test }                                  from 'bun:test';
import type { BoardPipelineEntityDocument }                        from '../../../../@types/board/BoardPipelineDocuments.ts';
import { exampleGate }                                             from '../../../testing/PipelineFixture.ts';
import { ConstitutionStateTagModel, type ConstitutionStateRecord } from './ConstitutionStateTagModel.ts';

const LINT_GATE = exampleGate('lint', 'bun run lint');

const APP: Pick<BoardPipelineEntityDocument, 'kind' | 'gates' | 'constitutionPath'> = { kind: 'app', gates: [LINT_GATE], constitutionPath: null };

const ROOT: Pick<BoardPipelineEntityDocument, 'kind' | 'gates' | 'constitutionPath'> = { kind: 'root', gates: [], constitutionPath: null };

function record(changes: Partial<ConstitutionStateRecord> = {}): ConstitutionStateRecord {
  return {
    mode: 'setup', stepStates: { constitution: 'in-progress' }, entities: null, ...changes,
  };
}

describe('the state', () => {
  test('a draft of its own wins, even over a file in its folder', () => {
    const drafting = record({ entities: { web: { constitution: { markdown: '- One.' } } } });
    expect(ConstitutionStateTagModel.stateOf(drafting, 'web', { ...APP, constitutionPath: '/apps/web/CONSTITUTION.md' })).toBe('drafted');
    expect(ConstitutionStateTagModel.stateOf(drafting, 'admin', APP)).toBe('not-started');
  });

  test('a file the entity names is adopted', () => {
    expect(ConstitutionStateTagModel.stateOf(record(), 'web', { ...APP, constitutionPath: '/apps/web/CONSTITUTION.md' })).toBe('adopted');
  });

  test('a root without gates is kept for a person; one with gates is not', () => {
    expect(ConstitutionStateTagModel.stateOf(record(), 'root', ROOT)).toBe('kept-for-a-person');
    expect(ConstitutionStateTagModel.stateOf(record(), 'root', { ...ROOT, gates: [LINT_GATE] })).toBe('not-started');
  });

  test('without a document it is not started while the step is open, and the default once it is done, in an update or with no record', () => {
    expect(ConstitutionStateTagModel.stateOf(record({ entities: { web: { constitution: null } } }), 'web', APP)).toBe('not-started');
    expect(ConstitutionStateTagModel.stateOf(record({ stepStates: { constitution: 'done' } }), 'web', APP)).toBe('default');
    expect(ConstitutionStateTagModel.stateOf(record({ mode: 'update' }), 'web', APP)).toBe('default');
    expect(ConstitutionStateTagModel.stateOf(null, 'web', APP)).toBe('default');
  });
});

describe('the words', () => {
  test('each state has its word and its meaning in the title', () => {
    expect(ConstitutionStateTagModel.textOf('not-started')).toBe('Not started');
    expect(ConstitutionStateTagModel.titleOf('adopted')).toBe('Adopted: kept from the repository, byte for byte');
    expect(ConstitutionStateTagModel.textOf('kept-for-a-person')).toBe('For a person');
    expect(ConstitutionStateTagModel.titleOf('kept-for-a-person')).toBe('For a person: no constitution: agents change it only through an app’s reach');
  });

  test('the attention line counts only the entities that read the default', () => {
    expect(ConstitutionStateTagModel.attentionTextOf(['drafted', 'not-started', 'kept-for-a-person'])).toBeNull();
    expect(ConstitutionStateTagModel.attentionTextOf(['default', 'adopted'])).toBe('1 entity has the default constitution');
    expect(ConstitutionStateTagModel.attentionTextOf(['default', 'default'])).toBe('2 entities have the default constitution');
  });
});

describe('the rail', () => {
  test('each entity gets its state in the order given, and the rail words it with the attention line', () => {
    const constitutions = ConstitutionStateTagModel.entityConstitutionsOf(record({ stepStates: { constitution: 'done' } }), { web: APP, root: ROOT });
    expect(constitutions.map(({ entityKey, state }) => [entityKey, state])).toEqual([['web', 'default'], ['root', 'kept-for-a-person']]);
    const marks = ConstitutionStateTagModel.railMarkTextsOf(constitutions);
    expect(marks.textOf('root')).toBe('For a person');
    expect(marks.textOf('missing')).toBe('Default');
    expect(marks.attentionText).toBe('1 entity has the default constitution');
  });
});
