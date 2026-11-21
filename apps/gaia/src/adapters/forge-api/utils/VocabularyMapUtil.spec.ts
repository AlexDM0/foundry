/**
 * The value lists of a forge's board mapped into Gaia's unions. What matters: each record maps exactly the forge's values, compared with the
 * contract's own list where the contract keeps one; a value the forge adds is a compile error in the record that maps it, proved by a
 * planted value; and the mappers keep order, `null` and a keyed object's every key.
 */
import { describe, expect, test } from 'bun:test';
import {
  AGENT_EFFORTS,
  DISPLAY_STATES,
  DRAFT_STATES,
  ENTITY_KINDS,
  FORGE_LEVEL_AGENT_ROLES,
  GATE_PHASES,
  JOB_STATES,
  PIPELINE_AGENT_ROLES,
  TASK_STATUSES,
  TICKET_PRIORITIES,
  TICKET_SIZES,
  TICKET_STAGES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type TicketStatus,
} from 'forge-contracts/BoardVocabulary';
import { FORGE_CONTROL_COMMAND_KINDS } from 'forge-contracts/ForgeControlCommandKinds';
import { MONITOR_INTERRUPTION_CAUSES } from 'forge-contracts/MonitorInterruptionCauses';

import type { BoardTicketStatus }                      from '../../../shared/@types/board/BoardVocabulary.ts';
import { VocabularyMapUtil, type BoardVocabularyName } from './VocabularyMapUtil.ts';

const VOCABULARIES = VocabularyMapUtil.vocabularies;

/** The value lists the contract keeps at run time, each beside the record that maps it. */
const CONTRACT_LISTS: Partial<Record<BoardVocabularyName, readonly string[]>> = {
  ticketStatus:        TICKET_STATUSES,
  ticketPriority:      TICKET_PRIORITIES,
  ticketType:          TICKET_TYPES,
  ticketSize:          TICKET_SIZES,
  taskStatus:          TASK_STATUSES,
  displayState:        DISPLAY_STATES,
  ticketStage:         TICKET_STAGES,
  draftState:          DRAFT_STATES,
  jobState:            JOB_STATES,
  gatePhase:           GATE_PHASES,
  pipelineAgentRole:   PIPELINE_AGENT_ROLES,
  forgeLevelAgentRole: FORGE_LEVEL_AGENT_ROLES,
  entityAgentRole:     PIPELINE_AGENT_ROLES.filter((role) => !(FORGE_LEVEL_AGENT_ROLES as readonly string[]).includes(role)),
  entityKind:          ENTITY_KINDS,
  agentEffort:         AGENT_EFFORTS,
  interruptionCause:   MONITOR_INTERRUPTION_CAUSES,
  offeredCommandKind:  FORGE_CONTROL_COMMAND_KINDS.slice(FORGE_CONTROL_COMMAND_KINDS.indexOf('chart-range-set')),
};

describe('the vocabulary records', () => {
  for (const [name, record] of Object.entries(VOCABULARIES)) {
    test(`${name} maps each forge value to a Gaia value`, () => {
      const forgeValues = VocabularyMapUtil.forgeValuesOf(record);
      expect(forgeValues.length).toBeGreaterThan(0);
      const gaiaValueOfForgeValue: Readonly<Record<string, string>> = record;
      for (const forgeValue of forgeValues) expect(Object.values(gaiaValueOfForgeValue)).toContain(gaiaValueOfForgeValue[forgeValue] ?? '');
      const contractList = CONTRACT_LISTS[name as BoardVocabularyName];
      if (contractList !== undefined) expect([...forgeValues].sort()).toEqual([...contractList].sort());
    });
  }

  test('a value the forge adds is a compile error in the record that maps it', () => {
    type PlantedTicketStatus = TicketStatus | 'example-added-status';
    // @ts-expect-error the record maps no `example-added-status`, so it is no record of the planted list
    const planted: Readonly<Record<PlantedTicketStatus, BoardTicketStatus>> = VOCABULARIES.ticketStatus;
    expect(Object.keys(planted)).toEqual(Object.keys(VOCABULARIES.ticketStatus));
  });
});

describe('the mappers', () => {
  test('map a value, a list in its order, and a null', () => {
    expect(VocabularyMapUtil.gaiaValueOf(VOCABULARIES.ticketStatus, 'committed')).toBe('committed');
    expect(VocabularyMapUtil.gaiaValuesOf(VOCABULARIES.ticketPriority, ['high', 'low'])).toEqual(['high', 'low']);
    expect(VocabularyMapUtil.nullableGaiaValueOf(VOCABULARIES.jobTurn, null)).toBeNull();
  });

  test('map an object keyed by every value of a list, and one keyed by some, leaving out the absent keys', () => {
    expect(VocabularyMapUtil.keyedRecordOf(VOCABULARIES.gatePhase, { build: 1, review: 0, merge: 2 }, (count) => count * 2)).toEqual({ build: 2, review: 0, merge: 4 });
    expect(VocabularyMapUtil.partiallyKeyedRecordOf(VOCABULARIES.pipelineApproval, { merge: true }, (isOn) => !isOn)).toEqual({ merge: false });
    expect(VocabularyMapUtil.partiallyKeyedRecordOf(VOCABULARIES.pipelineApproval, undefined, (isOn) => isOn)).toEqual({});
  });
});
