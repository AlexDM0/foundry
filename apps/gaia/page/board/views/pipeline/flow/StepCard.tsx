/**
 * One step of the open phase: its kind word with its mark, a Conditional pill on a re-review, the pills that say what it waits on or how
 * it changed (each pops in), User's switch on a "You" step, then its title, its gate pills, its sentence, the tickets on it on a live
 * board, and an agent's model, effort and brief files, or the document a writing step writes. A double-click or Enter asks for what the
 * step opens, or for the question it waits on; a press inside a control stays that control's. At an entity of a monorepo, a switch the
 * forge sets is a link to the forge level.
 */

import type { KeyboardEvent, SyntheticEvent } from 'react';
import type { BoardDraftEditDocument }        from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  Card,
  ModelEffortMeter,
  Row,
  Switch,
  Tag,
  Text,
  TextButton,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }        from '../../../shell/BoardRouteLinks.ts';
import { StateToneUtil }         from '../../../utils/StateToneUtil.ts';
import type { OccupantChipView } from '../live/FlowActivityPanelModel.ts';

import { FlowGlyph } from './FlowGlyph.tsx';
import {
  PipelineFlowModel,
  type FlowNodeView,
  type FlowOpenRequest,
  type StepKind
} from './PipelineFlowModel.ts';
import { PipelinePhaseModel } from './PipelinePhaseModel.ts';

const KIND_WORDS: Readonly<Record<StepKind, string>> = Object.freeze({
  agent: 'Agent', you: 'You', gates: 'Gates', automatic: 'Automatic',
});

const NO_TICKET_TEXT = 'No ticket here now';

const SET_AT_THE_FORGE_TEXT = 'Set at the Forge level';

/** The tickets on a live step; null on a board that is not live. */
export type LiveOccupants = readonly OccupantChipView[] | null;

export interface StepCardProps {
  readonly view:               FlowNodeView;
  readonly occupants:          LiveOccupants;
  readonly questionCount:      number;
  readonly selected:           boolean;
  readonly editable:           boolean;
  readonly onOpen:             (request: FlowOpenRequest) => void;
  readonly onEdits:            (edits: readonly BoardDraftEditDocument[]) => void;
  /** Where the forge sets this step's switch, shown in its place; absent shows the switch. */
  readonly setAtTheForgeHref?: string;
}

/** A step waiting on a question opens on the question; any other step opens what its facts name, if anything. */
function openRequestOf(view: FlowNodeView, questionCount: number): FlowOpenRequest | null {
  if (questionCount > 0) return { kind: 'question', nodeId: view.nodeId };
  return view.openAction === null ? null : { kind: 'node', nodeId: view.nodeId, action: view.openAction };
}

function openLabelOf(view: FlowNodeView, questionCount: number): string | null {
  return questionCount > 0 ? PipelineFlowModel.questionOpenLabelOf(view.title) : view.openLabel;
}

function startsInsideControl(event: SyntheticEvent): boolean {
  return event.target instanceof Element && event.target.closest('button, a, input') !== null;
}

function ChangeMarker({ view }: { readonly view: FlowNodeView }) {
  if (view.change === null || view.changeText === null) return null;
  if (view.change === 'removed') return <Tag text={view.changeText} tone="error" pops />;
  return <Tag text={view.changeText} tone="neutral" change={view.change} pops />;
}

function LiveTickets({ occupants }: { readonly occupants: readonly OccupantChipView[] }) {
  const hrefOf = useBoardHrefOf();
  if (occupants.length === 0) return <Text typeRole="small" subtle>{NO_TICKET_TEXT}</Text>;
  return (
    <Row wrap gap="four">
      {occupants.map((occupant) => <Tag key={occupant.key} text={occupant.text} {...StateToneUtil.tagLookOf(occupant.state)} dot href={hrefOf(occupant.route)} />)}
    </Row>
  );
}

export function StepCard({
  view, occupants, questionCount, selected, editable, onOpen, onEdits, setAtTheForgeHref
}: StepCardProps) {
  const openRequest = openRequestOf(view, questionCount);
  const liveStateText = occupants === null ? null : PipelinePhaseModel.liveStateTextOf(view.kind, occupants.length);
  const { meter, switchView } = view;
  const open = (event: SyntheticEvent): void => {
    if (openRequest === null || startsInsideControl(event)) return;
    onOpen(openRequest);
  };
  const keyDownOnStep = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' || event.target !== event.currentTarget || openRequest === null) return;
    event.preventDefault();
    onOpen(openRequest);
  };
  return (
    <div
      className="board-pipeline-step"
      role="group"
      aria-label={openLabelOf(view, questionCount) ?? view.cardTitle}
      aria-haspopup={openRequest === null ? undefined : 'dialog'}
      tabIndex={openRequest === null ? undefined : 0}
      data-step-node-id={view.nodeId}
      data-kind={view.kind}
      data-highlighted={view.highlighted ? '' : undefined}
      data-change={view.change ?? undefined}
      onDoubleClick={open}
      onKeyDown={keyDownOnStep}
    >
      <Card step dashed={view.conditional} interactive={openRequest !== null} selected={selected} highlighted={view.highlighted} grow gap="six">
        <Row between centerY gap="six">
          <Row centerY gap="seven">
            <FlowGlyph glyph={view.kind} />
            <Text typeRole="small" muted>{KIND_WORDS[view.kind]}</Text>
            {view.conditional ? <Tag text="Conditional" tone="neutral" /> : null}
          </Row>
          <Row centerY gap="six">
            {questionCount > 0
              ? (
                <Tag
                  text={PipelineFlowModel.questionCountTextOf(questionCount)}
                  tone="warn"
                  title={PipelineFlowModel.questionOpenLabelOf(view.title)}
                  onPress={() => onOpen({ kind: 'question', nodeId: view.nodeId })}
                  pops
                />
              )
              : null}
            {liveStateText === null ? null : <Tag text={liveStateText} tone="warn" pops />}
            <ChangeMarker view={view} />
            {switchView !== null && setAtTheForgeHref !== undefined ? <TextButton label={SET_AT_THE_FORGE_TEXT} href={setAtTheForgeHref} /> : null}
            {switchView === null || setAtTheForgeHref !== undefined
              ? null
              : (
                <Switch
                  accessibleName={switchView.accessibleName}
                  checked={switchView.checked}
                  disabled={!editable}
                  onToggle={() => onEdits([PipelineFlowModel.switchEditOf(switchView)])}
                />
              )}
          </Row>
        </Row>
        <Text typeRole="lead" bold struck={view.change === 'removed'}>{view.cardTitle}</Text>
        {view.gatePills.length === 0
          ? null
          : (
            <Row wrap gap="four">
              {view.gatePills.map((pill) => (
                <Tag key={pill.gateName} text={pill.text} tone="neutral" {...(pill.change === null ? {} : { change: pill.change })} />
              ))}
            </Row>
          )}
        <Text muted>{view.sentence}</Text>
        {occupants === null ? null : <LiveTickets occupants={occupants} />}
        {meter === null && view.briefText === null && view.documentFileName === null
          ? null
          : (
            <View gap="four" paddingTop="eight">
              {meter === null
                ? null
                : (
                  <ModelEffortMeter
                    model={meter.model}
                    effort={meter.effort}
                    level={meter.level}
                    levelCount={meter.levelCount}
                    accessibleName={meter.accessibleName}
                    size="node"
                    {...(meter.derivedNote === null ? {} : { derivedNote: meter.derivedNote })}
                  />
                )}
              {view.briefText === null ? null : <Text typeRole="small" mono subtle>{view.briefText}</Text>}
              {view.documentFileName === null ? null : <Text typeRole="small" mono subtle>{view.documentFileName}</Text>}
            </View>
          )}
      </Card>
    </div>
  );
}
