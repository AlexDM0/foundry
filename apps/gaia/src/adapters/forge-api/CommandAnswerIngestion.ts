/**
 * The ingestion of a forge's answer to a board command (`POST /api/v1/commands`) into Gaia's `BoardCommandAnswer`: 200 applied, 423 held for
 * an install change, any other status a refusal, each under `controlVersion` as `CONTRACT_VERSIONS` knows it. A refusal keeps the forge's
 * code, fields and sentence unchanged. A body at another control version, or one that is no such answer, is `unreadable`.
 */
import { JsonValueUtil }                                             from '../../lib/json-value/JsonValueUtil.ts';
import type { BoardCommandAnswer }                                   from '../../shared/@types/board/BoardCommandAnswer.ts';
import { CONTRACT_VERSIONS }                                         from '../../shared/constants/ContractVersions.ts';
import { ContractVersionUtil }                                       from '../../shared/utils/ContractVersionUtil.ts';
import type { ForgeCommandAppliedAnswer, ForgeCommandRefusalAnswer } from './@types/ForgeStreamDocuments.ts';
import { DocumentShapeUtil, type ShapeOf }                           from './utils/DocumentShapeUtil.ts';

const APPLIED_STATUS = 200;
const INSTALL_HELD_STATUS = 423;

const VERSION_KEYS = { majorKey: 'controlVersion' } as const;

const APPLIED_ANSWER_SHAPE = {
  controlVersion: 'whole-number',
  outcome:        { oneOf: ['done', 'nothing-to-do'] },
  result:         'passed-over',
} as const satisfies ShapeOf<ForgeCommandAppliedAnswer>;

const REFUSAL_ANSWER_SHAPE = {
  controlVersion: 'whole-number',
  refusal:        'text',
  fields:         { recordOf: 'json' },
  text:           'text',
} as const satisfies ShapeOf<ForgeCommandRefusalAnswer>;

/**
 * The job an applied command started, read as `result.job.id`, as an applied `intake-start` names its product owner; `null` from any other
 * result. The result is the forge's own record, which no contract declares, so this one key is all Gaia reads of it.
 */
function startedJobIdOf(result: unknown): string | null {
  const resultRecord = JsonValueUtil.jsonObjectOf(result);
  const job = resultRecord === null ? null : JsonValueUtil.jsonObjectOf(JsonValueUtil.ownValueOf(resultRecord, 'job'));
  const jobId = job === null ? null : JsonValueUtil.ownValueOf(job, 'id');
  return typeof jobId === 'string' ? jobId : null;
}

export class CommandAnswerIngestion {
  public answerOf(status: number, body: unknown): BoardCommandAnswer {
    if (ContractVersionUtil.readMajorOf(body, VERSION_KEYS, CONTRACT_VERSIONS.forgeControl) === null) {
      return { outcome: 'unreadable', status, invalidKeys: [VERSION_KEYS.majorKey] };
    }
    if (status === APPLIED_STATUS) {
      const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, APPLIED_ANSWER_SHAPE);
      if (invalidKeys.length > 0) return { outcome: 'unreadable', status, invalidKeys };
      const applied = body as ForgeCommandAppliedAnswer;
      return { outcome: 'applied', applied: applied.outcome, startedJobId: startedJobIdOf(applied.result) };
    }
    const invalidKeys = DocumentShapeUtil.invalidKeysOf(body, REFUSAL_ANSWER_SHAPE);
    if (invalidKeys.length > 0) return { outcome: 'unreadable', status, invalidKeys };
    const answer = body as ForgeCommandRefusalAnswer;
    const refusal = { code: answer.refusal, fields: answer.fields, sentence: answer.text };
    if (status === INSTALL_HELD_STATUS) return { outcome: 'install-held', refusal };
    return { outcome: 'refused', status, refusal };
  }
}
