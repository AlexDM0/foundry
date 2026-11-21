/**
 * MonoCrossing, read-only: how a ticket of an app that crosses into a whitelisted package runs, stage by stage, each naming its entity,
 * agent, constitution and gates; the package's stages carry a dashed edge as well as the neutral tint, so they differ without colour.
 * With several packages on the whitelist, User picks the one to see. Nothing here edits: Close is the one action.
 */
import { Button }                                                          from 'design-system/Button';
import { Callout }                                                         from 'design-system/Callout';
import { Card }                                                            from 'design-system/Card';
import { Dialog }                                                          from 'design-system/Dialog';
import { MonoId }                                                          from 'design-system/MonoId';
import { SegmentedControl }                                                from 'design-system/SegmentedControl';
import { Tag }                                                             from 'design-system/Tag';
import { Text }                                                            from 'design-system/Text';
import { View }                                                            from 'design-system/View';
import { useState }                                                        from 'react';
import type { BoardDraftEntityFactsDocument, BoardPipelineEntityDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { CrossingDialogModel, type CrossingStageView }                     from './CrossingDialogModel.ts';

export interface CrossingDialogProps {
  readonly appKey:        string;
  readonly entities:      Readonly<Record<string, BoardPipelineEntityDocument>>;
  /** Each draft entity's facts the forge serves, among them the entities that depend on it. */
  readonly draftEntities: Readonly<Record<string, BoardDraftEntityFactsDocument>>;
  readonly onClose:       () => void;
}

function CrossingStage({ stage }: { readonly stage: CrossingStageView }) {
  const isPackageStage = stage.owner === 'package';
  return (
    <li className="board-crossing-stage" data-owner={stage.owner} aria-label={`Stage ${stage.number}: ${stage.name}`}>
      <Card step={isPackageStage} dashed={isPackageStage} radius="step" gap="six" grow>
        <span className="board-crossing-stage-head">
          <span className="board-crossing-stage-number">{stage.number}</span>
          <Text bold>{stage.name}</Text>
        </span>
        <span className="board-crossing-stage-entity">
          <MonoId text={stage.entityText} tone="strong" size="small" weight="medium" />
          {stage.skippable ? <Tag text="May be skipped" tone="neutral" /> : null}
        </span>
        <Text typeRole="small">{stage.what}</Text>
        <span className="board-crossing-stage-facts">
          <Text typeRole="small" muted>{`Agent · ${stage.agent}`}</Text>
          <Text typeRole="small" muted>{`Constitution · ${stage.constitution}`}</Text>
          <Text typeRole="small" muted>{stage.gates}</Text>
        </span>
      </Card>
    </li>
  );
}

export function CrossingDialog({
  appKey, entities, draftEntities, onClose
}: CrossingDialogProps) {
  const packages = CrossingDialogModel.crossablePackagesOf(entities, appKey);
  const [packageKey, setPackageKey] = useState(packages[0] ?? '');
  const crossing = CrossingDialogModel.crossingOf(entities, draftEntities, appKey, packageKey);
  return (
    <Dialog
      title={crossing.title}
      description={crossing.lead}
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="page"
      foot={(
        <>
          <Text typeRole="small" muted>{crossing.reviewNote}</Text>
          <Button label="Close" onPress={onClose} />
        </>
      )}
    >
      <View gap="fourteen">
        {packages.length > 1
          ? (
            <SegmentedControl
              accessibleName="Package to cross into"
              options={packages.map((key) => ({ value: key, label: key }))}
              selected={packageKey}
              onSelect={setPackageKey}
              size="compact"
              mono
            />
          )
          : null}
        <ol className="board-crossing-stages" aria-label="Stages">
          {crossing.stages.map((stage) => <CrossingStage key={stage.number} stage={stage} />)}
        </ol>
        <Callout tone="neutral" title={crossing.costTitle} titleElement="h3">
          <Text element="p" muted>{crossing.costText}</Text>
        </Callout>
      </View>
    </Dialog>
  );
}
