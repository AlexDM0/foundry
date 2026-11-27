/**
 * Attention with no forge registered (`docs/design/screens.md`, "No forge yet"): the welcome, the card that adds a repository and starts its forge,
 * and the line on the forge program. `NoForgeYetLayout` takes no hooks; `NoForgeYet` keeps the shared add-a-repository form and sends its commands.
 */
import {
  CommandSender,
  type CommandStates,
  type CommandSubject,
  useCommandSender,
} from '../../api/CommandSender.ts';
import {
  Button,
  Card,
  MicroCapsLabel,
  Text
} from '../../lib/design-system/DesignSystemInterface.ts';

import { CommandFailureRefusal } from '../../shared/CommandFailureRefusal.tsx';
import {
  AddRepositoryFields,
  type AddRepositorySentResults,
  type AddRepositoryHandlers,
  ForgeProgramMissingLine,
  useAddRepositoryForm,
} from '../../shared/add-repository/AddRepositoryFields.tsx';
import type { AddRepositoryForm } from '../../shared/add-repository/AddRepositoryForm.ts';
import type { NoForgeContent }    from './AttentionModel.ts';

export interface NoForgeYetLayoutProps {
  readonly content:          NoForgeContent;
  readonly form:             AddRepositoryForm;
  readonly sentResults:      AddRepositorySentResults;
  readonly commandStates:    CommandStates;
  readonly handlers:         AddRepositoryHandlers;
  /** Sends Look again, from its button or once more from its refusal. */
  readonly onLookAgain:      () => void;
  readonly onDismissFailure: (subject: CommandSubject) => void;
}

const ADD_HEAD_ID = 'gaia-attention-add-head';

const LOOK_AGAIN: CommandSubject = { fleetCommand: 'fleet-look-again' };

export function NoForgeYetLayout({
  content, form, sentResults, commandStates, handlers, onLookAgain, onDismissFailure
}: NoForgeYetLayoutProps) {
  return (
    <div className="gaia-attention-no-forge">
      <div className="gaia-attention-no-forge-column">
        <div className="gaia-attention-no-forge-intro">
          <div className="gaia-attention-no-forge-welcome">
            <MicroCapsLabel text="Welcome to Gaia" />
            <div className="gaia-attention-no-forge-actions">
              <Button label="Look again" compact disabled={CommandSender.stateOf(commandStates, LOOK_AGAIN).onItsWay !== null} onPress={onLookAgain} />
            </div>
          </div>
          <CommandFailureRefusal commandStates={commandStates} subject={LOOK_AGAIN} commandLabel="Look again" onDismissFailure={onDismissFailure} onTryAgain={onLookAgain} />
          <div className="gaia-attention-no-forge-title">
            <Text typeRole="display" element="h2">Nothing waits on you, because no forge is registered.</Text>
          </div>
          <Text typeRole="lead" element="p" muted>
            Gaia runs no agents of its own. It shows the forges on this machine, and a forge appears here the first time it is set up in a repository.
          </Text>
        </div>
        <section className="gaia-attention-add" aria-labelledby={ADD_HEAD_ID}>
          <Card padding="eighteen" paddingTop="sixteen" gap="sixteen">
            <Text typeRole="section" element="h3" id={ADD_HEAD_ID}>Add a repository</Text>
            <AddRepositoryFields
              form={form}
              sentResults={sentResults}
              forgeProgramIsMissing={content.forgeProgramIsMissing}
              commandStates={commandStates}
              handlers={handlers}
              onDismissFailure={onDismissFailure}
            />
          </Card>
        </section>
        <ForgeProgramMissingLine
          forgeProgramIsMissing={content.forgeProgramIsMissing}
          sentResults={sentResults}
          commandStates={commandStates}
          onChooseForgeProgram={handlers.onChooseForgeProgram}
          onDismissFailure={onDismissFailure}
        />
        {content.forgeProgramText === null ? null : (
          <div className="gaia-attention-no-forge-found">
            <span>Forge program</span>
            <span className="gaia-attention-no-forge-program">{content.forgeProgramText}</span>
            <p className="gaia-attention-no-forge-elsewhere">A forge set up elsewhere appears here by itself.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function NoForgeYet({ content }: { readonly content: NoForgeContent }) {
  const { send, dismissFailure, states } = useCommandSender();
  const { form, sentResults, handlers } = useAddRepositoryForm(send);
  return (
    <NoForgeYetLayout
      content={content}
      form={form}
      sentResults={sentResults}
      commandStates={states}
      handlers={handlers}
      onLookAgain={() => void send({ kind: 'fleet-look-again' })}
      onDismissFailure={dismissFailure}
    />
  );
}
