/**
 * Maps an `OperationRefusal` into the refusal document forge serves: its reason code, the facts its detail names, and the sentence the
 * command line prints, so a client shows the same words a terminal does.
 */
import type { ForgeJsonValue, ForgeRefusalDocument } from 'forge-contracts/ForgeRefusalDocument';

import type { OperationRefusal }       from '../../shared/OperationRefusal.ts';
import { reasonCodeOf }                from '../../shared/OperationRefusal.ts';
import { OperationRefusalWordingUtil } from './OperationRefusalWordingUtil.ts';

const REFUSED_WITHOUT_DETAIL_CODE = 'refused';

/** A value as JSON would carry it: an absent field or a function is left out, a number JSON cannot write reads `null`. */
function jsonValueOf(value: unknown): ForgeJsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((element: unknown) => jsonValueOf(element) ?? null);
  if (typeof value === 'object') return jsonFieldsOf(value);
  return undefined;
}

function jsonFieldsOf(record: object, leftOutField?: string): Record<string, ForgeJsonValue> {
  const fields: Record<string, ForgeJsonValue> = {};
  for (const [field, value] of Object.entries(record)) {
    const jsonValue = jsonValueOf(value);
    if (field !== leftOutField && jsonValue !== undefined) fields[field] = jsonValue;
  }
  return fields;
}

/** The detail's facts without the field its code already says: a board refusal's `reason`, any other detail's `kind`. */
function fieldsOf(refusal: OperationRefusal): Record<string, ForgeJsonValue> {
  const { detail } = refusal;
  if (detail === null) return {};
  if (detail.kind === 'board-refusal') return jsonFieldsOf(detail.boardRefusal, 'reason');
  return jsonFieldsOf(detail, 'kind');
}

function refusalDocumentOf(refusal: OperationRefusal): ForgeRefusalDocument {
  return {
    code:     refusal.detail === null ? REFUSED_WITHOUT_DETAIL_CODE : reasonCodeOf(refusal.detail),
    fields:   fieldsOf(refusal),
    sentence: OperationRefusalWordingUtil.messageOf(refusal),
  };
}

export const RefusalDocumentUtil = {
  jsonFieldsOf,
  refusalDocumentOf,
} as const;
