/**
 * A phase's gates table under its steps: "<Phase> gates", the gate count, the phase's line and the add buttons, then the rows in a
 * reorderable list, prepare steps first. A reorder sends the phase's run order (or the prepare steps' order) and Delete on a focused row
 * takes it out, both as draft edits through the open phase's sender. "Add gate", and "Add prepare step" in the Build phase, ask for an
 * empty Gate dialog; both hide on a live board, whose head names the tickets in the phase's gates now, once for the phase, since the facts
 * place a ticket in the phase's gates and not in one gate. A phase with no gates says so beside "Add <phase> gate". At an entity's level of
 * a monorepo screen, a profile measures that entity's gate, and the head may lead with the copy of the phase's gates to another entity;
 * on a live board there, the head's line also names the entity's gate profiles of the phase under way (MonoLive). Every row shows its
 * line's last recorded run in the phase, for the entity in view.
 */
import type { ReactNode }                                                                   from 'react';
import type { BoardGateProfileRunDocument, BoardGateRowDocument, BoardStepRunTimeDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardGatePhase }                                                              from '../../../../@types/board/BoardVocabulary.ts';
import {
  Button,
  ReorderableList,
  Row,
  Tag,
  Text
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }                          from '../../../shared/routing/BoardRouteLinks.ts';
import { StateToneUtil }                           from '../../../utils/StateToneUtil.ts';
import { entityKeyOfScope, useMonorepoLevelScope } from '../entities/MonorepoLevelContext.ts';
import { FlowGlyph }                               from '../flow/FlowGlyph.tsx';
import type { PipelineFlowEditSender }             from '../flow/PipelineFlowEditSender.ts';
import type { OccupantChipView }                   from '../live/FlowActivityPanelModel.ts';
import { LivePipelineModel }                       from '../live/LivePipelineModel.ts';

import { GateRow }                               from './GateRow.tsx';
import { GatesAreaModel, type GatesOpenRequest } from './GatesAreaModel.ts';

const ADD_GATE_LABEL = 'Add gate';

const ADD_PREPARE_STEP_LABEL = 'Add prepare step';

const NOW_LEAD_TEXT = 'Now:';

const IDLE_TEXT = 'Idle';

export interface GatesTableProps {
  readonly phase:          BoardGatePhase;
  readonly rows:           readonly BoardGateRowDocument[];
  readonly profileRuns:    readonly BoardGateProfileRunDocument[];
  /** The newest run of every step line the forge recorded. */
  readonly stepRunTimes:   readonly BoardStepRunTimeDocument[];
  /** The open record a profile measures the draft's gate of; null on a live board, which profiles the applied gate. */
  readonly profileSetupId: string | null;
  readonly reviewRuns:     boolean;
  /** The tickets in the phase's gates on a live board, which the head names; null on a board that is not live. */
  readonly nowTickets:     readonly OccupantChipView[] | null;
  readonly selectedRowKey: string | null;
  readonly editSender:     PipelineFlowEditSender;
  readonly onOpen:         (request: GatesOpenRequest) => void;
  /** A control before the add buttons, such as the copy of the phase's gates to another entity. */
  readonly headStart?:     ReactNode;
}

function ColumnHeads() {
  return (
    <div className="board-pipeline-gates-columns" aria-hidden="true">
      <span />
      <span>Gate</span>
      <span>Command</span>
      <span>Also in</span>
      <span>Network</span>
      <span>Time</span>
      <span>Last run</span>
    </div>
  );
}

interface NowTicketsProps {
  readonly tickets:      readonly OccupantChipView[];
  /** "test being profiled", at an entity's level only. */
  readonly profileTexts: readonly string[];
}

/** "Now: 12", "Now: test being profiled" or "Now: Idle" in a live table's head. */
function NowTickets({ tickets, profileTexts }: NowTicketsProps) {
  const hrefOf = useBoardHrefOf();
  return (
    <Row centerY gap="seven" wrap>
      <Text typeRole="tab" muted>{NOW_LEAD_TEXT}</Text>
      {tickets.length === 0 && profileTexts.length === 0
        ? <Text typeRole="small" subtle>{IDLE_TEXT}</Text>
        : tickets.map((ticket) => <Tag key={ticket.key} text={ticket.text} {...StateToneUtil.tagLookOf(ticket.state)} dot href={hrefOf(ticket.route)} />)}
      {profileTexts.map((text) => <Tag key={text} text={text} tone="state" stateTone="accent" busy />)}
    </Row>
  );
}

export function GatesTable({
  phase, rows, profileRuns, stepRunTimes, profileSetupId, reviewRuns, nowTickets, selectedRowKey, editSender, onOpen, headStart = null
}: GatesTableProps) {
  const profileEntity = entityKeyOfScope(useMonorepoLevelScope());
  const views = GatesAreaModel.rowViewsOf(rows, phase, profileRuns);
  const profileTexts = profileEntity === null ? [] : LivePipelineModel.profilesUnderWayTextsOf(profileRuns, phase);
  const headEnd = nowTickets !== null
    ? <NowTickets tickets={nowTickets} profileTexts={profileTexts} />
    : (
      <Row gap="eight">
        {headStart}
        <Button
          compact
          leading={<FlowGlyph glyph="plus" />}
          label={rows.length === 0 ? GatesAreaModel.addGateLabelOf(phase) : ADD_GATE_LABEL}
          accessibleName={GatesAreaModel.addGateLabelOf(phase)}
          onPress={() => onOpen({ kind: 'new-gate', phase })}
        />
        {phase === 'build'
          ? <Button compact leading={<FlowGlyph glyph="plus" />} label={ADD_PREPARE_STEP_LABEL} onPress={() => onOpen({ kind: 'new-prepare-step' })} />
          : null}
      </Row>
    );

  return (
    <section className="board-pipeline-gates" aria-label={GatesAreaModel.titleOf(phase)} data-gates-table="" data-empty={rows.length === 0 ? '' : undefined}>
      <div className="board-pipeline-gates-head">
        <Row centerY gap="ten" wrap>
          <Text typeRole="lead" bold element="h3">{GatesAreaModel.titleOf(phase)}</Text>
          <Text typeRole="tab" subtle mono>{GatesAreaModel.gateCountOf(rows)}</Text>
          <Text muted>{rows.length === 0 ? GatesAreaModel.emptyTextOf(phase, reviewRuns) : GatesAreaModel.lineOf(phase)}</Text>
        </Row>
        {headEnd}
      </div>
      {rows.length === 0
        ? null
        : (
          <div className="board-pipeline-gates-rows">
            <ColumnHeads />
            <ReorderableList
              label={GatesAreaModel.titleOf(phase)}
              announce={(fromIndex, toIndex) => GatesAreaModel.announcementOf(rows, fromIndex, toIndex)}
              onReorder={(fromIndex, toIndex) => {
                const edits = GatesAreaModel.reorderEditsOf(rows, phase, fromIndex, toIndex);
                if (edits.length > 0) editSender.sendEdits(edits);
              }}
              items={views.map((view, index) => {
                const row = rows[index];
                const openRequest = row === undefined ? null : GatesAreaModel.openRequestOf(row, phase);
                const deleteEdits = GatesAreaModel.deleteEditsOf(rows, phase, index);
                return {
                  key:       view.key,
                  band:      view.band,
                  grabLabel: view.grabLabel,
                  faded:     view.change === 'removed',
                  content:   (
                    <GateRow
                      view={view}
                      profileCommand={GatesAreaModel.profileStartCommandOf(profileSetupId, view.name, phase, profileEntity)}
                      selected={selectedRowKey === view.key}
                      runTime={row === undefined ? null : GatesAreaModel.lineRunTimeOf(row, phase, stepRunTimes, profileEntity)}
                      onOpen={openRequest === null ? null : () => onOpen(openRequest)}
                      onDelete={deleteEdits.length === 0 || !editSender.enabled ? null : () => editSender.sendEdits(deleteEdits)}
                    />
                  ),
                };
              })}
            />
          </div>
        )}
    </section>
  );
}
