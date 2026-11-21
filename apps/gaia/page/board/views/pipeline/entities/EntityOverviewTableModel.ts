/**
 * The forge level's table of entities, pure: one row per entity of the draft, else of the stored pipeline, with its kind, its home folders,
 * its gates and the state of its constitution, and its open questions; each row opens that entity's level. No row says an entity is ready:
 * an entity without gates or with the default constitution is plain from its cells, and never blocks Apply.
 */
import type { BoardPipelineEntityDocument, BoardSetupEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardEntityKind }                                       from '../../../../@types/board/BoardVocabulary.ts';

/** Drafted in this setup, named in the entity's own folder, the installed default, or none for a root kept for a person. */
export type EntityConstitutionState = 'drafted' | 'in-its-folder' | 'default' | 'kept-for-a-person';

export interface EntityOverviewFacts {
  readonly entities:          Readonly<Record<string, BoardPipelineEntityDocument>>;
  /** Each entity's part of the open setup record; empty with no record. */
  readonly setupParts:        Readonly<Record<string, Pick<BoardSetupEntityDocument, 'constitution'>>>;
  readonly openQuestionCount: (entityKey: string) => number;
}

export interface EntityOverviewRowView {
  readonly entityKey:         string;
  readonly kindText:          string;
  readonly homeText:          string;
  readonly gatesText:         string;
  readonly hasGates:          boolean;
  readonly constitutionState: EntityConstitutionState;
  readonly constitutionText:  string;
  readonly openQuestionCount: number;
}

const KIND_TEXTS: Readonly<Record<BoardEntityKind, string>> = Object.freeze({ app: 'app', package: 'package', root: 'root' });

const CONSTITUTION_TEXTS: Readonly<Record<EntityConstitutionState, string>> = Object.freeze({
  'drafted':           'Drafted',
  'in-its-folder':     'In its folder',
  'default':           'Default',
  'kept-for-a-person': 'For a person',
});

const ROOT_HOME_TEXT = 'every other path';

function constitutionStateOf(entityKey: string, entity: BoardPipelineEntityDocument, facts: EntityOverviewFacts): EntityConstitutionState {
  const part = Object.hasOwn(facts.setupParts, entityKey) ? facts.setupParts[entityKey] : undefined;
  if ((part?.constitution ?? null) !== null) return 'drafted';
  if (entity.constitutionPath !== null) return 'in-its-folder';
  return entity.kind === 'root' && entity.gates.length === 0 ? 'kept-for-a-person' : 'default';
}

/** A home folder without its leading `/`, as a path of the repository reads; the root's `/` is every path no other entity owns. */
function homeTextOf(entity: BoardPipelineEntityDocument): string {
  if (entity.kind === 'root') return ROOT_HOME_TEXT;
  return entity.home.map((folder) => folder.replace(/^\/+/u, '')).join(', ');
}

function gatesTextOf(entity: BoardPipelineEntityDocument): string {
  if (entity.gates.length === 0) return entity.kind === 'root' ? 'None' : 'No gates';
  return `${entity.gates.length} ${entity.gates.length === 1 ? 'gate' : 'gates'}`;
}

function rowsOf(facts: EntityOverviewFacts): EntityOverviewRowView[] {
  return Object.entries(facts.entities).map(([entityKey, entity]) => {
    const constitutionState = constitutionStateOf(entityKey, entity, facts);
    return {
      entityKey,
      kindText:          KIND_TEXTS[entity.kind],
      homeText:          homeTextOf(entity),
      gatesText:         gatesTextOf(entity),
      hasGates:          entity.gates.length > 0,
      constitutionState,
      constitutionText:  CONSTITUTION_TEXTS[constitutionState],
      openQuestionCount: facts.openQuestionCount(entityKey),
    };
  });
}

export const EntityOverviewTableModel = Object.freeze({ rowsOf });
