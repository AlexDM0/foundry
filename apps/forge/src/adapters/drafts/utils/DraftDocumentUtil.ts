/**
 * A draft file's JSON document both ways: the text read into a draft as a verdict, never a throw, and a draft written back with `version`
 * first, then the keys the model owns, then every key it does not, in the order they were stored.
 */
import { JsonRecordUtil }             from '../../../lib/json-record/JsonRecordUtil.ts';
import type { Draft, DraftClaim }     from '../../../lib/tracker-model/@types/Draft.ts';
import { FIRST_DRAFT_ITEM_NUMBER }    from '../../../lib/tracker-model/constants/DraftFields.ts';
import { DraftIdUtil }                from '../../../lib/tracker-model/utils/DraftIdUtil.ts';
import { StoredValueUtil }            from '../../utils/StoredValueUtil.ts';
import type { DraftFileProblem }      from '../@types/DraftFileProblem.ts';
import { CURRENT_DRAFT_FILE_VERSION } from '../constants/DraftFileVersions.ts';
import { DraftContentParsingUtil }    from './DraftContentParsingUtil.ts';

export type DraftDocumentParsing =
  | { verdict: 'parsed'; draft: Draft }
  | { verdict: 'malformed'; problem: DraftFileProblem };

const OWNED_KEYS = [
  'version', 'id', 'title', 'request', 'openedAt', 'claim', 'notes', 'questions', 'nextNoteNumber', 'nextQuestionNumber', 'entity', 'crosses'
] as const;

const INDENTATION_SPACES = 2;

function malformed(problem: DraftFileProblem): { verdict: 'malformed'; problem: DraftFileProblem } {
  return { verdict: 'malformed', problem };
}

/** A stored value as its JSON text, as a problem names it; `null` for a missing key, which JSON cannot write. */
function storedValueTextOf(value: unknown): string | null {
  return JSON.stringify(value) ?? null;
}

function isItemNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= FIRST_DRAFT_ITEM_NUMBER;
}

function claimOf(value: unknown): DraftClaim | null | undefined {
  if (value === null) return null;
  const claim = JsonRecordUtil.recordOf(value);
  if (claim === undefined) return undefined;
  const { owner, claimedAt } = claim;
  if (typeof owner !== 'string' || owner.trim() === '' || typeof claimedAt !== 'string') return undefined;
  return { owner, claimedAt };
}

/** Absent stays absent, so a draft stored before entities existed writes back byte for byte. */
function entityFieldsOf(document: Record<string, unknown>): { verdict: 'read'; fields: Pick<Draft, 'entity' | 'crosses'> } | { verdict: 'malformed'; problem: DraftFileProblem } {
  const fields: Pick<Draft, 'entity' | 'crosses'> = {};
  if (Object.hasOwn(document, 'entity')) {
    const { entity } = document;
    if (typeof entity !== 'string' || entity.trim() === '') return malformed({ code: 'entity-not-an-entity-key', field: 'entity' });
    fields.entity = entity;
  }
  if (Object.hasOwn(document, 'crosses')) {
    const { crosses } = document;
    if (!Array.isArray(crosses) || !crosses.every((crossedEntityKey) => typeof crossedEntityKey === 'string' && crossedEntityKey.trim() !== '')) {
      return malformed({ code: 'crosses-malformed', field: 'crosses' });
    }
    fields.crosses = crosses;
  }
  return { verdict: 'read', fields };
}

function parsedDraftDocumentOf(text: string): DraftDocumentParsing {
  const parsing = StoredValueUtil.parsedJsonOf(text);
  if (parsing.verdict === 'unparseable') return malformed(parsing.problem);
  const document = JsonRecordUtil.recordOf(parsing.value);
  if (document === undefined) return malformed({ code: 'document-not-a-json-object' });

  const {
    version, id, title, request, openedAt
  } = document;
  if (version !== CURRENT_DRAFT_FILE_VERSION) {
    return malformed({
      code: 'version-not-read', field: 'version', storedValue: storedValueTextOf(version), readVersion: CURRENT_DRAFT_FILE_VERSION
    });
  }
  if (typeof id !== 'string' || DraftIdUtil.draftNumberOf(id) === null) return malformed({ code: 'not-a-draft-id', field: 'id', storedValue: storedValueTextOf(id) });
  if (typeof title !== 'string' || title.trim() === '') return malformed({ code: 'title-blank', field: 'title' });
  if (typeof request !== 'string') return malformed({ code: 'request-not-text', field: 'request' });
  if (typeof openedAt !== 'string') return malformed({ code: 'opened-at-not-a-timestamp', field: 'openedAt' });
  const claim = claimOf(document['claim']);
  if (claim === undefined) return malformed({ code: 'claim-malformed', field: 'claim' });
  const notes = DraftContentParsingUtil.notesOf(document['notes']);
  if (notes === undefined) return malformed({ code: 'notes-malformed', field: 'notes' });
  const questions = DraftContentParsingUtil.questionsOf(document['questions']);
  if (questions === undefined) return malformed({ code: 'questions-malformed', field: 'questions' });
  const { nextNoteNumber, nextQuestionNumber } = document;
  if (!isItemNumber(nextNoteNumber) || !isItemNumber(nextQuestionNumber)) {
    return malformed({ code: 'item-numbers-below-first', firstItemNumber: FIRST_DRAFT_ITEM_NUMBER });
  }

  const entityFieldsReading = entityFieldsOf(document);
  if (entityFieldsReading.verdict === 'malformed') return entityFieldsReading;

  const ownedKeys: readonly string[] = OWNED_KEYS;
  const extra = Object.entries(document).filter(([key]) => !ownedKeys.includes(key));
  return {
    verdict: 'parsed',
    draft:   {
      id, title, request, openedAt, claim, notes, questions, nextNoteNumber, nextQuestionNumber, ...entityFieldsReading.fields, extra
    },
  };
}

/** The stored document a draft file holds, which `draft show --json` prints, so a rebooted session resumes from it alone. */
function draftDocumentOf(draft: Readonly<Draft>): Record<string, unknown> {
  // `fromEntries` makes every stored key an own property, so a stored `__proto__` stays data instead of setting the prototype.
  return Object.fromEntries([
    ['version', CURRENT_DRAFT_FILE_VERSION],
    ['id', draft.id],
    ['title', draft.title],
    ['request', draft.request],
    ['openedAt', draft.openedAt],
    ['claim', draft.claim],
    ['notes', draft.notes],
    ['questions', draft.questions],
    ['nextNoteNumber', draft.nextNoteNumber],
    ['nextQuestionNumber', draft.nextQuestionNumber],
    ...(draft.entity === undefined ? [] : [['entity', draft.entity]]),
    ...(draft.crosses === undefined ? [] : [['crosses', draft.crosses]]),
    ...draft.extra,
  ]);
}

function draftDocumentTextOf(draft: Readonly<Draft>): string {
  return `${JSON.stringify(draftDocumentOf(draft), null, INDENTATION_SPACES)}\n`;
}

export const DraftDocumentUtil = { parsedDraftDocumentOf, draftDocumentOf, draftDocumentTextOf } as const;
