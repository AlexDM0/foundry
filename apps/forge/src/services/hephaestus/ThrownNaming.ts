import type { ThrownNamed } from '../../adapters/@types/HephaestusLogRecord.ts';
import { OperationRefusal } from '../../shared/OperationRefusal.ts';

/** A thrown value as a log record names it: a refusal with a detail keeps the detail, so the log words it as the refusal's sentence. */
export function thrownNamedOf(thrown: unknown): ThrownNamed {
  const thrownMessage = thrown instanceof Error ? thrown.message : String(thrown);
  return thrown instanceof OperationRefusal && thrown.detail !== null ? { thrownMessage, thrownRefusal: thrown.detail } : { thrownMessage };
}
