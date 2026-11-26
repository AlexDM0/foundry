/**
 * `stage-statement.json`, what a package stage's verified report stated, kept in its job folder for the stages after it, read into the
 * statement: read, validate, map.
 */
import { type FieldCheck, JobFileShapeUtil } from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil }            from '../utils/StoredJsonDocumentUtil.ts';

export const STAGE_STATEMENT_FORMAT_VERSION = 1;

/**
 * A package review also keeps the `reach` paths its package's stages changed, which its seal covers (E3). An adapt build that sent the
 * ticket back keeps the package and what the package must give (E41, E42). A package review that does not hold keeps its Review (E34).
 */
export type StageStatement =
  | { stage: 'package-build'; exposedSurfaceChanged: boolean }
  | { stage: 'package-review'; exposedSurfaceConfirmed: boolean; reviewText: string; sealedReachPaths: readonly string[] }
  | { stage: 'package-review-findings'; reviewSection: string }
  | { stage: 'adapt'; returnedPackage: string; packageReturnReason: string }
  | { stage: 'package-refused'; refusedReason: string };

export type StageStatementReading =
  | { verdict: 'readable'; statement: StageStatement }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

const BOOLEAN: FieldCheck = [(value) => typeof value === 'boolean', 'true or false'];
const TEXT: FieldCheck = [JobFileShapeUtil.valueIsText, 'text'];

const STATEMENT_CHECKS: Readonly<Record<StageStatement['stage'], Readonly<Record<string, FieldCheck>>>> = {
  'package-build':           { exposedSurfaceChanged: BOOLEAN },
  'package-review':          { exposedSurfaceConfirmed: BOOLEAN, reviewText: TEXT, sealedReachPaths: [JobFileShapeUtil.valueIsATextList, 'a list of paths'] },
  'package-review-findings': { reviewSection: TEXT },
  'adapt':                   { returnedPackage: TEXT, packageReturnReason: TEXT },
  'package-refused':         { refusedReason: TEXT },
};

function isStatementStage(value: unknown): value is StageStatement['stage'] {
  return typeof value === 'string' && Object.hasOwn(STATEMENT_CHECKS, value);
}

function statementOf(document: Readonly<Record<string, unknown>>, stage: StageStatement['stage']): StageStatement {
  const textOf = (field: string): string => document[field] as string;
  const booleanOf = (field: string): boolean => document[field] as boolean;
  switch (stage) {
    case 'package-build':
      return { stage, exposedSurfaceChanged: booleanOf('exposedSurfaceChanged') };
    case 'package-review':
      return {
        stage, exposedSurfaceConfirmed: booleanOf('exposedSurfaceConfirmed'), reviewText: textOf('reviewText'), sealedReachPaths: [...document['sealedReachPaths'] as string[]]
      };
    case 'package-review-findings':
      return { stage, reviewSection: textOf('reviewSection') };
    case 'adapt':
      return { stage, returnedPackage: textOf('returnedPackage'), packageReturnReason: textOf('packageReturnReason') };
    default:
      return { stage, refusedReason: textOf('refusedReason') };
  }
}

export class StageStatementIngestion {
  constructor(private readonly statementFilePath: string) {}

  /** Never throws: a statement that cannot be read whole is `unreadable`, never a stage that stated nothing. */
  read(): StageStatementReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.statementFilePath, STAGE_STATEMENT_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const { stage } = document;
    if (!isStatementStage(stage)) return { verdict: 'unreadable', reason: 'its "stage" is not a stage that keeps a statement' };
    const problem = JobFileShapeUtil.firstFieldProblemOf(document, STATEMENT_CHECKS[stage]);
    if (problem !== null) return { verdict: 'unreadable', reason: problem };
    return { verdict: 'readable', statement: statementOf(document, stage) };
  }
}
