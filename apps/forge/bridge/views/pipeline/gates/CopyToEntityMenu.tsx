/**
 * "Copy to another entity" in an entity's gates table head: a popover that ticks the entities to copy the phase's gates to, says that the
 * copy is a set of ordinary edits shown as one row in Changes, and sends them as one copy. Once the Overseer applied it, the popover closes
 * and the head says where the gates went and how many edits it made.
 */
import { Button }           from 'design-system/Button';
import { Checkbox }         from 'design-system/Checkbox';
import { Popover }          from 'design-system/Popover';
import { Text }             from 'design-system/Text';
import { View }             from 'design-system/View';
import { useRef, useState } from 'react';

import type { GatePhase }                 from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { EntityKey, Pipeline }       from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import { CommandButton }                  from '../../../shell/CommandButton.tsx';
import { CopyBetweenEntitiesDialogModel } from '../editing/CopyBetweenEntitiesDialogModel.ts';
import type { DraftEditTarget }           from '../flow/PipelineFlowModel.ts';
import { GatesAreaModel }                 from './GatesAreaModel.ts';

export interface CopyToEntityMenuProps {
  readonly phase:         GatePhase;
  readonly fromEntityKey: EntityKey;
  /** Every entity of the draft. */
  readonly wholeDraft:    Pipeline;
  readonly target:        DraftEditTarget;
}

const TRIGGER_LABEL = 'Copy to another entity';

const COPY_NOTE = 'The copy is a set of ordinary edits. It shows as one row in Changes, and each edit undoes alone.';

/** "Copy web's build gates to". */
function headingOf(fromEntityKey: EntityKey, phase: GatePhase): string {
  return `Copy ${fromEntityKey}’s ${GatesAreaModel.titleOf(phase).toLowerCase()} to`;
}

export function CopyToEntityMenu({
  phase, fromEntityKey, wholeDraft, target
}: CopyToEntityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [chosenKeys, setChosenKeys] = useState<readonly EntityKey[]>([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const request = {
    fromEntityKey, toEntityKeys: chosenKeys, parts: ['gates'] as const, gatePhases: [phase]
  };
  const edits = CopyBetweenEntitiesDialogModel.copyEditsOf(wholeDraft, request);
  const gateCount = wholeDraft.entities?.[fromEntityKey]?.phases[phase].length ?? 0;
  const heading = headingOf(fromEntityKey, phase);
  const toggle = (entityKey: EntityKey, checked: boolean): void => {
    setChosenKeys(checked ? [...chosenKeys, entityKey] : chosenKeys.filter((chosenKey) => chosenKey !== entityKey));
  };
  const copied = (): void => {
    setCopiedText(`Copied to ${chosenKeys.join(', ')} · ${edits.length} ${edits.length === 1 ? 'edit' : 'edits'} in Changes`);
    setChosenKeys([]);
    setIsOpen(false);
  };
  return (
    <span className="bridge-pipeline-copy-menu" ref={anchorRef}>
      {copiedText === null ? null : <span className="bridge-pipeline-copy-menu-done" role="status"><Text typeRole="small" muted>{copiedText}</Text></span>}
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
          <span className="bridge-pipeline-copy-menu-actions">
            <Button compact label="Cancel" onPress={() => setIsOpen(false)} />
            <CommandButton
              compact
              primary
              label={`Copy ${gateCount} ${gateCount === 1 ? 'gate' : 'gates'}`}
              command={CopyBetweenEntitiesDialogModel.copyCommandOf(target, edits)}
              onApplied={copied}
            />
          </span>
        </View>
      </Popover>
    </span>
  );
}
