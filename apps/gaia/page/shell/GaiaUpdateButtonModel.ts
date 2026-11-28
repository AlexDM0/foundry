/**
 * What the brand bar's update button says and does for Gaia's own update (`docs/design/screens.md`, the brand bar): "Up to date" checks
 * origin again, "Update Gaia" updates the clone and the forge program, "Restart Gaia" opens Gaia again on the update, and the note beside
 * it says how far behind Gaia is or why the last step did not finish.
 */
import type { CommandBody }                                                                           from '../@types/CommandDocument.ts';
import type { FleetDocumentGaiaUpdate, FleetDocumentGaiaUpdateFailure, FleetDocumentGaiaUpdateState } from '../@types/FleetDocument.ts';
import type { BrandBarUpdateButton }                                                                  from '../components/BrandBar.tsx';
import { CountTextUtil }                                                                              from '../shared/utils/CountTextUtil.ts';

interface ButtonOfState {
  readonly label:    string;
  readonly emphasis: BrandBarUpdateButton['emphasis'];
  /** The command a press sends; `null` while the step on its way leaves nothing to press. */
  readonly command:  CommandBody | null;
}

const CHECK: CommandBody = { kind: 'gaia-update-check' };

const BUTTON_OF_STATE: Readonly<Record<FleetDocumentGaiaUpdateState, ButtonOfState>> = {
  'checking':       { label: 'Checking for updates…', emphasis: 'quiet', command: null },
  'up-to-date':     { label: 'Up to date', emphasis: 'quiet', command: CHECK },
  'not-known':      { label: 'Check for updates', emphasis: 'quiet', command: CHECK },
  'available':      { label: 'Update Gaia', emphasis: 'primary', command: { kind: 'gaia-update' } },
  'updating':       { label: 'Updating Gaia…', emphasis: 'primary', command: null },
  'restart-needed': { label: 'Restart Gaia', emphasis: 'primary', command: { kind: 'gaia-restart' } },
  'restarting':     { label: 'Restarting Gaia…', emphasis: 'primary', command: null },
};

const FAILURE_SENTENCES: Readonly<Record<FleetDocumentGaiaUpdateFailure, string>> = {
  'origin-unreachable':  'Gaia could not reach its origin to look for an update.',
  'not-a-clone':         'Gaia runs from no git clone with an origin, so it cannot update itself.',
  'local-changes':       'Gaia\'s clone has local changes, so Gaia left it as it is.',
  'diverged':            'Gaia\'s clone has commits that origin\'s main lacks, so Gaia left it as it is.',
  'forge-setup-failed':  'Gaia is updated, but forge\'s setup did not finish: the forge command may still be the old one.',
  'restart-not-started': 'Gaia could not restart itself. Quit Gaia and open it again to run the update.',
};

const RESTART_BY_HAND_NOTE = 'Quit Gaia and open it again to run the update.';

function noteOf(update: FleetDocumentGaiaUpdate): string | null {
  if (update.failure !== null) return FAILURE_SENTENCES[update.failure];
  if (update.state === 'available') return `${CountTextUtil.countedPhrase(update.commitsBehind, 'new commit', 'new commits')} on main`;
  if (update.state === 'restart-needed' && !update.restartIsPossible) return RESTART_BY_HAND_NOTE;
  return null;
}

function updateButtonOf(update: FleetDocumentGaiaUpdate | null, send: (command: CommandBody) => void): BrandBarUpdateButton | null {
  if (update === null) return null;
  const { label, emphasis, command } = BUTTON_OF_STATE[update.state];
  const restartIsOffBy = update.state === 'restart-needed' && !update.restartIsPossible;
  return {
    label,
    emphasis,
    disabled: command === null || restartIsOffBy,
    onPress:  () => {
      if (command !== null) send(command);
    },
    note: noteOf(update),
  };
}

export const GaiaUpdateButtonModel = { updateButtonOf } as const;
