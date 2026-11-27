/**
 * "Copy to another entity" in an entity's gates table head: a popover that ticks the entities to copy the phase's gates to, says that the
 * copy is a set of ordinary edits shown as one row in Changes, and sends them as one copy. Once Hephaestus applied it, the popover closes
 * and the head says where the gates went and how many edits it made.
 */
import { useRef, useState }                     from 'react';
import type { BoardPipelineDefinitionDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardGatePhase }                  from '../../../../@types/board/BoardVocabulary.ts';
import {
  Button,
  Checkbox,
  Popover,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { CountTextUtil }                  from '../../../../shared/utils/CountTextUtil.ts';
import { CommandButton }                  from '../../../shared/commands/CommandButton.tsx';
import { CopyBetweenEntitiesDialogModel } from '../editing/CopyBetweenEntitiesDialogModel.ts';
import type { DraftEditTarget }           from '../flow/PipelineFlowModel.ts';
import { GatesAreaModel }                 from './GatesAreaModel.ts';

export interface CopyToEntityMenuProps {
  readonly phase:         BoardGatePhase;
  readonly fromEntityKey: string;
  /** Every entity of the draft. */
  readonly wholeDraft:    BoardPipelineDefinitionDocument;
  readonly target:        DraftEditTarget;
}

const TRIGGER_LABEL = 'Copy to another entity';

const COPY_NOTE = 'The copy is a set of ordinary edits. It shows as one row in Changes, and each edit undoes alone.';

/** "Copy web's build gates to". */
function headingOf(fromEntityKey: string, phase: BoardGatePhase): string {
  return `Copy ${fromEntityKey}’s ${GatesAreaModel.titleOf(phase).toLowerCase()} to`;
}

export function CopyToEntityMenu({
  phase, fromEntityKey, wholeDraft, target
}: CopyToEntityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [chosenKeys, setChosenKeys] = useState<readonly string[]>([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const request = {
    fromEntityKey, toEntityKeys: chosenKeys, parts: ['gates'] as const, gatePhases: [phase]
  };
  const edits = CopyBetweenEntitiesDialogModel.copyEditsOf(wholeDraft, request);
  const gateCount = wholeDraft.entities?.[fromEntityKey]?.phases[phase].length ?? 0;
  const heading = headingOf(fromEntityKey, phase);
  const toggle = (entityKey: string, checked: boolean): void => {
    setChosenKeys(checked ? [...chosenKeys, entityKey] : chosenKeys.filter((chosenKey) => chosenKey !== entityKey));
  };
  const copied = (): void => {
    setCopiedText(`Copied to ${chosenKeys.join(', ')} · ${CountTextUtil.countedPhrase(edits.length, 'edit', 'edits')} in Changes`);
    setChosenKeys([]);
    setIsOpen(false);
  };
  return (
    <span className="board-pipeline-copy-menu" ref={anchorRef}>
      {copiedText === null ? null : <span className="board-pipeline-copy-menu-done" role="status"><Text typeRole="small" muted>{copiedText}</Text></span>}
      <Button compact label={TRIGGER_LABEL} expanded={isOpen} onPress={() => setIsOpen(!isOpen)} />
      <Popover label={heading} role="dialog" isOpen={isOpen} onDismiss={() => setIsOpen(false)} anchorRef={anchorRef} placement="below-end" width="standard">
        <View gap="ten" padding="fourteen">
          <Text bold>{heading}</Text>
          {CopyBetweenEntitiesDialogModel.targetOptionsOf(wholeDraft, fromEntityKey).map((option) => (
            <Checkbox
              key={option.entityKey}
              label={option.entityKey}
              explanation={option.explanation}
              checked={chosenKeys.includes(option.entityKey)}
              onChange={(checked) => toggle(option.entityKey, checked)}
            />
          ))}
          <Text typeRole="small" subtle>{COPY_NOTE}</Text>
          <span className="board-pipeline-copy-menu-actions">
            <Button compact label="Cancel" onPress={() => setIsOpen(false)} />
            <CommandButton
              compact
              primary
              label={`Copy ${CountTextUtil.countedPhrase(gateCount, 'gate', 'gates')}`}
              command={CopyBetweenEntitiesDialogModel.copyCommandOf(target, edits)}
              onApplied={copied}
            />
          </span>
        </View>
      </Popover>
    </span>
  );
}
