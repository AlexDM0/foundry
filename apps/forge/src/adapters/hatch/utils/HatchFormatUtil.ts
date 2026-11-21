/** Maps a control command to the Hatch's request and reads requests and replies back, refusing a request that claims an identity. */
import type { ControlCommand }         from '../../../shared/@types/ControlCommand.ts';
import type { OperationRefusalStatus } from '../../../shared/OperationRefusal.ts';
import type {
  HatchFormatVersion,
  HatchReply,
  HatchReplyReading,
  HatchRequest,
  HatchRequestReading
} from '../@types/HatchFormat.ts';

const HATCH_FORMAT_VERSION: HatchFormatVersion = 1;

/** Fields only Hephaestus may decide: who sent the request, and what its admission stamped. */
const IDENTITY_FIELDS = ['jobId', 'role'] as const;

const ADMISSION_FIELD = 'admission';

const REFUSAL_STATUSES: readonly OperationRefusalStatus[] = ['refused', 'unrepaired'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function carriesIdentity(record: Record<string, unknown>): boolean {
  return IDENTITY_FIELDS.some((field) => Object.hasOwn(record, field));
}

interface BodyField {
  field:   string;
  /** What the command holds in the field while its body travels beside it. */
  emptied: string | null;
}

/**
 * The command field each kind carries its body in: a ticket's, need's or epic's markdown, or the whole constitution the pipeline agent
 * drafts.
 */
const BODY_FIELD_OF_KIND: Readonly<Partial<Record<ControlCommand['kind'], BodyField>>> = {
  'ticket-add':                  { field: 'bodyText', emptied: null },
  'ticket-edit':                 { field: 'bodyText', emptied: null },
  'epic-add':                    { field: 'bodyText', emptied: '' },
  'need-declare':                { field: 'bodyText', emptied: '' },
  'pipeline-constitution-draft': { field: 'markdown', emptied: '' },
};

function bodyFieldOf(kind: unknown): BodyField | null {
  if (typeof kind !== 'string' || !Object.hasOwn(BODY_FIELD_OF_KIND, kind)) return null;
  return BODY_FIELD_OF_KIND[kind as ControlCommand['kind']] ?? null;
}

function requestOf(requestId: string, command: ControlCommand): HatchRequest {
  const bodyField = bodyFieldOf(command.kind);
  const bodyText  = bodyField === null ? null : (command as unknown as Record<string, unknown>)[bodyField.field];
  if (bodyField === null || typeof bodyText !== 'string') return { hatchFormatVersion: HATCH_FORMAT_VERSION, requestId, command };
  return {
    hatchFormatVersion: HATCH_FORMAT_VERSION, requestId, command: { ...command, [bodyField.field]: bodyField.emptied } as ControlCommand, bodyText
  };
}

function commandWithBody(command: Record<string, unknown>, bodyText: unknown): Record<string, unknown> | null {
  if (bodyText === undefined) return command;
  const bodyField = bodyFieldOf(command['kind']);
  if (typeof bodyText !== 'string' || bodyField === null || !Object.hasOwn(command, bodyField.field)) return null;
  return { ...command, [bodyField.field]: bodyText };
}

/**
 * Checks only what the Hatch owns: the version, the request id, that the command is an object of a named kind, and that neither the
 * request nor its command claims an identity or an admission. Whether the kind is one the role may run is `Bouncer`'s.
 */
function requestReadingOf(text: string): HatchRequestReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { verdict: 'refused', reason: 'malformed-hatch-request' };
  }
  if (!isRecord(parsed)) return { verdict: 'refused', reason: 'malformed-hatch-request' };
  const { command, requestId } = parsed;
  if (!isRecord(command)) return { verdict: 'refused', reason: 'malformed-hatch-request' };
  if (carriesIdentity(parsed) || carriesIdentity(command) || Object.hasOwn(command, ADMISSION_FIELD)) {
    return { verdict: 'refused', reason: 'hatch-identity-mismatch' };
  }
  if (parsed['hatchFormatVersion'] !== HATCH_FORMAT_VERSION || typeof requestId !== 'string' || requestId === '' || typeof command['kind'] !== 'string') {
    return { verdict: 'refused', reason: 'malformed-hatch-request' };
  }
  const restoredCommand = commandWithBody(command, parsed['bodyText']);
  if (restoredCommand === null) return { verdict: 'refused', reason: 'malformed-hatch-request' };
  // The kind and its fields are checked by the policy and the applier; the Hatch only carries them.
  return { verdict: 'read', requestId, command: restoredCommand as unknown as ControlCommand };
}

function replyReadingOf(text: string): HatchReplyReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { verdict: 'malformed' };
  }
  if (!isRecord(parsed) || parsed['hatchFormatVersion'] !== HATCH_FORMAT_VERSION || typeof parsed['requestId'] !== 'string') return { verdict: 'malformed' };
  const { outcome, ticketIds } = parsed;
  if (outcome === 'done' || outcome === 'nothing-to-do') {
    if (!Array.isArray(ticketIds) || !ticketIds.every((ticketId) => typeof ticketId === 'string')) return { verdict: 'malformed' };
    return { verdict: 'read', reply: parsed as unknown as HatchReply };
  }
  const statusIsKnown = REFUSAL_STATUSES.some((status) => status === parsed['status']);
  if (outcome !== 'refused' || !statusIsKnown || !isRecord(parsed['detail']) || typeof parsed['detail']['kind'] !== 'string') return { verdict: 'malformed' };
  return { verdict: 'read', reply: parsed as unknown as HatchReply };
}

export const HatchFormatUtil = Object.freeze({
  requestOf,
  requestReadingOf,
  replyReadingOf,
});
