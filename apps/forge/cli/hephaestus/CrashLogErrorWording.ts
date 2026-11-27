import type { CrashErrorOrigin, CrashLogError } from '../../src/adapters/crash-log/@types/CrashLogRecord.ts';
import { OperationRefusalWordingUtil }          from '../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { CrashLog }                             from '../../src/services/hephaestus/CrashLog.ts';
import { OperationRefusal }                     from '../../src/shared/OperationRefusal.ts';

/** A refusal's message is only its code, so the crash log keeps the refusal's sentence in its place. */
export function crashLogErrorOf(origin: CrashErrorOrigin, thrown: unknown): CrashLogError {
  const error = CrashLog.errorOf(origin, thrown);
  return thrown instanceof OperationRefusal ? { ...error, message: OperationRefusalWordingUtil.messageOf(thrown) } : error;
}
