/** The stages of a ticket that crosses into a whitelisted package: which names exist, their numbers, and which moves between them are legal. */
import type { TicketStage, TicketStageName } from '../@types/Task.ts';
import {
  LEGAL_SOURCE_STAGES_FOR_TICKET_STAGE,
  PACKAGE_RETURN_SOURCE_STAGES,
  TICKET_STAGE_NAMES,
  TICKET_STAGE_NUMBERS
} from '../constants/TicketStages.ts';
import { FailedPassUtil } from './FailedPassUtil.ts';

/** A membership test, not a record lookup: outside text can spell `constructor`. */
function stageNameIsKnown(text: string): text is TicketStageName {
  return (TICKET_STAGE_NAMES as readonly string[]).includes(text);
}

function stageNumberOf(stageName: TicketStageName): number {
  return TICKET_STAGE_NUMBERS[stageName];
}

/** The key a row's `stageCounters` holds the stage's counts under: the key of the stage's job launch, so a return to the stage finds them. */
function stageKeyOf(stage: TicketStage): string {
  return FailedPassUtil.stageKeyOf({ entity: stage.entity, stage: stageNumberOf(stage.name) });
}

function stageMoveIsLegal(currentStage: TicketStageName, targetStage: TicketStageName): boolean {
  return LEGAL_SOURCE_STAGES_FOR_TICKET_STAGE[targetStage].includes(currentStage);
}

/** A legal move back into a package build after the package was sealed for the home stages; the owner agreed to one such return. */
function stageMoveIsAPackageReturn(currentStage: TicketStageName, targetStage: TicketStageName): boolean {
  return targetStage === 'package-build' && PACKAGE_RETURN_SOURCE_STAGES.includes(currentStage);
}

export const TicketStageUtil = {
  stageNameIsKnown,
  stageNumberOf,
  stageKeyOf,
  stageMoveIsLegal,
  stageMoveIsAPackageReturn,
} as const;
