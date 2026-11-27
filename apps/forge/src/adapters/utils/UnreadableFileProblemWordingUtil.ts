/**
 * The words of a problem Hephaestus carries for a file it could not read, where an incident or the header's warning is served or printed:
 * its served `reason` is the sentence the file's ingestion words.
 */
import type { Incident }                        from '../../lib/tracker-model/@types/Incident.ts';
import type { StoredFileProblem }               from '../../shared/@types/StoredFileProblem.ts';
import { StoredFileProblemFactsUtil }           from '../../shared/utils/StoredFileProblemFactsUtil.ts';
import type { UnreadableFileProblem }           from '../@types/UnreadableFileProblem.ts';
import { StoredFileProblemWording }             from '../StoredFileProblemWording.ts';
import { AirlockFactsProblemWording }           from '../airlock-facts/AirlockFactsProblemWording.ts';
import { AssistantChatsProblemWording }         from '../assistant-chats/AssistantChatsProblemWording.ts';
import { CrashLogProblemWording }               from '../crash-log/CrashLogProblemWording.ts';
import { DeliveryBaseProblemWording }           from '../delivery-base/DeliveryBaseProblemWording.ts';
import { GateRunManifestProblemWording }        from '../gate-manifest/GateRunManifestProblemWording.ts';
import { LaunchRegistryProblemWording }         from '../launch-registry/LaunchRegistryProblemWording.ts';
import { LaunchSettingsProblemWording }         from '../launch-settings/LaunchSettingsProblemWording.ts';
import { MergeSettlementProblemWording }        from '../merge-settlement/MergeSettlementProblemWording.ts';
import { PresenceProblemWording }               from '../presence/PresenceProblemWording.ts';
import { RefusedForcedStopsProblemWording }     from '../refused-forced-stops/RefusedForcedStopsProblemWording.ts';
import { StaleGreenSessionOwnerProblemWording } from '../session-owner/StaleGreenSessionOwnerProblemWording.ts';
import { SnapshotStartProblemWording }          from '../snapshot-start/SnapshotStartProblemWording.ts';
import { StageStatementProblemWording }         from '../stage-statement/StageStatementProblemWording.ts';
import { WaiverProposalsProblemWording }        from '../waiver-proposals/WaiverProposalsProblemWording.ts';
import { JobFileShapeUtil }                     from './JobFileShapeUtil.ts';
import { StepIncidentFactsWordingUtil }         from './StepIncidentFactsWordingUtil.ts';

const FILE_FACT = 'file';

const UNREADABLE_FILE_INCIDENT_KIND: Incident['kind'] = 'system-file-unreadable';

function sentenceOf(problem: UnreadableFileProblem): string {
  switch (problem.code) {
    case 'bytes-unreadable':
    case 'not-utf8-text':
    case 'not-json':
    case 'not-a-json-object':
    case 'version-differs':
      return StoredFileProblemWording.sentenceOf(problem);
    case 'field-is-not':
      return JobFileShapeUtil.fieldProblemSentenceOf(problem);
    case 'not-the-phase':
      return GateRunManifestProblemWording.sentenceOf(problem);
    case 'not-a-list-of-file-paths':
    case 'neither-true-nor-false':
      return AirlockFactsProblemWording.sentenceOf(problem);
    case 'chats-not-a-list':
    case 'chat-not-an-object':
    case 'not-a-chat-sequence':
    case 'not-a-list-of-incident-ids':
    case 'neither-a-message-number-nor-null':
      return AssistantChatsProblemWording.sentenceOf(problem);
    case 'not-a-delivery-number':
      return DeliveryBaseProblemWording.sentenceOf(problem);
    case 'not-a-settlement':
      return MergeSettlementProblemWording.sentenceOf(problem);
    case 'start-commit-not-a-commit':
      return SnapshotStartProblemWording.sentenceOf(problem);
    case 'not-a-statement-stage':
      return StageStatementProblemWording.sentenceOf(problem);
    case 'neither-a-job-id-nor-null':
      return StaleGreenSessionOwnerProblemWording.sentenceOf(problem);
    case 'not-a-list-of-proposals':
    case 'proposal-without-text-item-and-reason':
      return WaiverProposalsProblemWording.sentenceOf(problem);
    case 'crash-log-field-malformed':
      return CrashLogProblemWording.sentenceOf(problem);
    case 'registry-line-not-json':
    case 'registry-line-not-a-json-object':
    case 'registry-line-field-malformed':
      return LaunchRegistryProblemWording.sentenceOf(problem);
    case 'launch-setting-not-text':
      return LaunchSettingsProblemWording.sentenceOf(problem);
    case 'presence-field-malformed':
      return PresenceProblemWording.sentenceOf(problem);
    case 'refused-forced-stops-field-malformed':
      return RefusedForcedStopsProblemWording.sentenceOf(problem);
  }
}

/** A problem that came back untyped, from an incident's stored facts or the board state, which only a carrier of the union wrote. */
function sentenceOfCarried(problem: StoredFileProblem): string {
  return sentenceOf(problem as UnreadableFileProblem);
}

/**
 * An incident's facts as served and printed: an unreadable file's are `file` and `reason`, a step's problem `step` and `reason`, any other
 * incident's as they are stored.
 */
function wordedIncidentFactsOf(incident: Pick<Incident, 'kind' | 'facts'>): Record<string, string> {
  const problem = incident.kind === UNREADABLE_FILE_INCIDENT_KIND ? StoredFileProblemFactsUtil.problemOf(incident.facts, [FILE_FACT]) : null;
  if (problem === null) return StepIncidentFactsWordingUtil.wordedFactsOf(incident) ?? { ...incident.facts };
  return { [FILE_FACT]: incident.facts[FILE_FACT] ?? '', reason: sentenceOfCarried(problem) };
}

export const UnreadableFileProblemWordingUtil = Object.freeze({ sentenceOf, sentenceOfCarried, wordedIncidentFactsOf });
