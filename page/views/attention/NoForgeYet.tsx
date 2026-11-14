/**
 * Attention with no forge registered (SCREENS B4), one column that heads itself: the welcome with Look again, why nothing waits, the card
 * that adds a repository and starts its forge, and under it either the line that says no forge program is known, with a way to choose one,
 * or that a forge set up elsewhere appears by itself. `NoForgeYetLayout` takes no hooks; `NoForgeYet` keeps the form through the shared
 * add-a-repository form and sends its commands.
 */
import { Button }         from 'design-system/Button';
import { Card }           from 'design-system/Card';
import { MicroCapsLabel } from 'design-system/MicroCapsLabel';
import { Text }           from 'design-system/Text';

import {
  CommandSender,
  type CommandStates,
  type CommandSubject,
  useCommandSender,
} from '../../api/CommandSender.ts';
import { CommandFailureRefusal } from '../../shared/CommandFailureRefusal.tsx';
import {
  AddRepositoryFields,
  type AddRepositoryHandlers,
  ForgeProgramMissingLine,
  type PathChooser,
  useAddRepositoryForm,
} from '../../shared/add-repository/AddRepositoryFields.tsx';
import type { AddRepositoryForm } from '../../shared/add-repository/AddRepositoryForm.ts';
import type { NoForgeContent }    from './AttentionModel.ts';

export interface NoForgeYetLayoutProps {
  readonly content:          NoForgeContent;
  readonly form:             AddRepositoryForm;
  readonly pathChooser:      PathChooser;
  readonly commandStates:    CommandStates;
  readonly handlers:         AddRepositoryHandlers;
  /** Sends Look again, from its button or once more from its refusal. */
  readonly onLookAgain:      () => void;
  readonly onDismissFailure: (subject: CommandSubject) => void;
}

const ADD_HEAD_ID = 'gaia-attention-add-head';

const LOOK_AGAIN: CommandSubject = { fleetCommand: 'fleet-look-again' };

export function NoForgeYetLayout({
  content, form, pathChooser, commandStates, handlers, onLookAgain, onDismissFailure
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
            <Text typeRole="page" element="h3" id={ADD_HEAD_ID}>Add a repository</Text>
            <AddRepositoryFields
              form={form}
              pathChooser={pathChooser}
              forgeProgramIsMissing={content.forgeProgramIsMissing}
              commandStates={commandStates}
              handlers={handlers}
              onDismissFailure={onDismissFailure}
            />
          </Card>
        </section>
        <ForgeProgramMissingLine
          forgeProgramIsMissing={content.forgeProgramIsMissing}
          pathChooser={pathChooser}
          commandStates={commandStates}
          onChooseForgeProgram={handlers.onChooseForgeProgram}
          onDismissFailure={onDismissFailure}
        />
        {content.forgeProgramIsMissing ? null : <p className="gaia-attention-no-forge-elsewhere">A forge set up elsewhere appears here by itself.</p>}
      </div>
    </div>
  );
}

export function NoForgeYet({ content }: { readonly content: NoForgeContent }) {
  const { send, dismissFailure, states } = useCommandSender();
  const { form, pathChooser, handlers } = useAddRepositoryForm(send);
  return (
    <NoForgeYetLayout
      content={content}
      form={form}
      pathChooser={pathChooser}
      commandStates={states}
      handlers={handlers}
      onLookAgain={() => void send({ kind: 'fleet-look-again' })}
      onDismissFailure={dismissFailure}
    />
  );
}
