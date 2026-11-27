import type { BaseStoredFileProblem }         from '../../shared/@types/StoredFileProblem.ts';
import type { AirlockFactsProblem }           from '../airlock-facts/@types/AirlockFactsProblem.ts';
import type { AssistantChatsProblem }         from '../assistant-chats/@types/AssistantChatsProblem.ts';
import type { CrashLogProblem }               from '../crash-log/@types/CrashLogProblem.ts';
import type { DeliveryBaseProblem }           from '../delivery-base/@types/DeliveryBaseProblem.ts';
import type { GateRunManifestProblem }        from '../gate-manifest/@types/GateRunManifestProblem.ts';
import type { JobStartProblem }               from '../job-start/@types/JobStartProblem.ts';
import type { LaunchRegistryProblem }         from '../launch-registry/@types/LaunchRegistryProblem.ts';
import type { LaunchSettingsProblem }         from '../launch-settings/@types/LaunchSettingsProblem.ts';
import type { MainMergeConflictProblem }      from '../main-conflict/@types/MainMergeConflictProblem.ts';
import type { MainMergeResolutionProblem }    from '../main-resolution/@types/MainMergeResolutionProblem.ts';
import type { MergeSettlementProblem }        from '../merge-settlement/@types/MergeSettlementProblem.ts';
import type { MergeSidesProblem }             from '../merge-sides/@types/MergeSidesProblem.ts';
import type { PresenceProblem }               from '../presence/@types/PresenceProblem.ts';
import type { RedHandoffProblem }             from '../red-handoff/@types/RedHandoffProblem.ts';
import type { RefusedForcedStopsProblem }     from '../refused-forced-stops/@types/RefusedForcedStopsProblem.ts';
import type { SandboxRefusalProblem }         from '../sandbox-refusal/@types/SandboxRefusalProblem.ts';
import type { StaleGreenSessionOwnerProblem } from '../session-owner/@types/StaleGreenSessionOwnerProblem.ts';
import type { SnapshotStartProblem }          from '../snapshot-start/@types/SnapshotStartProblem.ts';
import type { StageStatementProblem }         from '../stage-statement/@types/StageStatementProblem.ts';
import type { StepVerdictProblem }            from '../step-verdict/@types/StepVerdictProblem.ts';
import type { TargetConflictProblem }         from '../target-conflict/@types/TargetConflictProblem.ts';
import type { WaiverProposalsProblem }        from '../waiver-proposals/@types/WaiverProposalsProblem.ts';
import type { JobFileFieldProblem }           from './JobFileFieldProblem.ts';

/**
 * Why a job file or a board-wide file of forge's own could not be read, as Hephaestus carries it to an incident or to the header's warning.
 * A format whose problem reaches one adds its union here and its codes to `UnreadableFileProblemWordingUtil.sentenceOf`.
 */
export type UnreadableFileProblem =
  | BaseStoredFileProblem
  | JobFileFieldProblem
  | AirlockFactsProblem
  | AssistantChatsProblem
  | DeliveryBaseProblem
  | GateRunManifestProblem
  | JobStartProblem
  | MainMergeConflictProblem
  | MainMergeResolutionProblem
  | MergeSettlementProblem
  | MergeSidesProblem
  | RedHandoffProblem
  | SandboxRefusalProblem
  | SnapshotStartProblem
  | StageStatementProblem
  | StaleGreenSessionOwnerProblem
  | StepVerdictProblem
  | TargetConflictProblem
  | WaiverProposalsProblem
  | CrashLogProblem
  | LaunchRegistryProblem
  | LaunchSettingsProblem
  | PresenceProblem
  | RefusedForcedStopsProblem;
