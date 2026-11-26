import { writeFileAtomically }                                 from '../../lib/atomic-file/AtomicFile.ts';
import { JsonTextUtil }                                        from '../../shared/utils/JsonTextUtil.ts';
import { STAGE_STATEMENT_FORMAT_VERSION, type StageStatement } from './StageStatementIngestion.ts';

/** Through `src/lib/atomic-file/AtomicFile.ts`, so a later stage never reads half a statement. */
export function createStageStatementWriter(statementFilePath: string): { write(statement: Readonly<StageStatement>): void } {
  function write(statement: Readonly<StageStatement>): void {
    writeFileAtomically(statementFilePath, JsonTextUtil.storedFileTextOf({ version: STAGE_STATEMENT_FORMAT_VERSION, ...statement }));
  }

  return { write };
}
