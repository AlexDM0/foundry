/**
 * What the brand bar's update button and its menu say and do for Gaia's own update (`docs/design/screens.md`, the brand bar): "Up to date"
 * checks origin again, "Update Gaia" updates the clone and the forge program, "Restart Gaia" opens Gaia again on the update, and the menu's
 * Reboot Gaia does so at any time but during an update. The note beside the button says what is under way or why the last step failed.
 */
import type { CommandBody }                                                                           from '../@types/CommandDocument.ts';
import type { FleetDocumentGaiaUpdate, FleetDocumentGaiaUpdateFailure, FleetDocumentGaiaUpdateState } from '../@types/FleetDocument.ts';
import type { BrandBarMenu, BrandBarUpdateButton }                                                    from '../components/BrandBar.tsx';
import { CountTextUtil }                                                                              from '../shared/utils/CountTextUtil.ts';

type ButtonOfState = Pick<BrandBarUpdateButton, 'label' | 'glyph' | 'emphasis' | 'busy'> & {
  /** The command a press sends; `null` while the step on its way leaves nothing to press. */
  readonly command: CommandBody | null;
};

const CHECK: CommandBody = { kind: 'gaia-update-check' };

const BUTTON_OF_STATE: Readonly<Record<FleetDocumentGaiaUpdateState, ButtonOfState>> = {
  'checking': {
    label: 'Checking…', glyph: 'busy', emphasis: 'quiet', busy: true, command: null
  },
  'up-to-date': {
    label: 'Up to date', glyph: 'done', emphasis: 'quiet', busy: false, command: CHECK
  },
  'not-known': {
    label: 'Check again', glyph: 'again', emphasis: 'quiet', busy: false, command: CHECK
  },
  'available': {
    label: 'Update Gaia', glyph: 'fetch', emphasis: 'primary', busy: false, command: { kind: 'gaia-update' }
  },
  'updating': {
    label: 'Updating…', glyph: 'busy', emphasis: 'primary', busy: true, command: null
  },
  'restart-needed': {
    label: 'Restart Gaia', glyph: 'restart', emphasis: 'primary', busy: false, command: { kind: 'gaia-restart' }
  },
  'restarting': {
    label: 'Restarting…', glyph: 'busy', emphasis: 'primary', busy: true, command: null
  },
};

const FAILURE_SENTENCES: Readonly<Record<FleetDocumentGaiaUpdateFailure, string>> = {
  'origin-unreachable':  'Gaia could not reach its origin.',
  'not-a-clone':         'Gaia runs from no git clone with an origin.',
  'local-changes':       'Gaia\'s clone has local changes, so Gaia left it as it is.',
  'diverged':            'Gaia\'s clone has commits that origin\'s main lacks.',
  'forge-setup-failed':  'Gaia is updated, but forge\'s setup did not finish.',
  'restart-not-started': 'Gaia could not restart itself.',
};

const UPDATING_NOTE = 'Fast-forwarding and setting up forge';

const UPDATED_NOTE = 'Gaia is updated';

const RESTART_BY_HAND_NOTE = 'Quit Gaia and open it again to run the update.';

/** The count in the button stays two characters wide. */
const LARGEST_COUNT_SHOWN = 9;

const STATES_A_REBOOT_WAITS_ON: ReadonlySet<FleetDocumentGaiaUpdateState> = new Set(['updating', 'restarting']);

const REBOOT_BY_HAND_TITLE = 'Gaia was not opened from Gaia.app, so it cannot reopen itself: quit Gaia and open it again.';

function noteOf(update: FleetDocumentGaiaUpdate): string | null {
  if (update.failure !== null) return FAILURE_SENTENCES[update.failure];
  if (update.state === 'updating') return UPDATING_NOTE;
  if (update.state !== 'restart-needed') return null;
  return update.restartIsPossible ? UPDATED_NOTE : RESTART_BY_HAND_NOTE;
}

function countOf(update: FleetDocumentGaiaUpdate): Pick<BrandBarUpdateButton, 'count' | 'accessibleName'> {
  if (update.state !== 'available' || update.commitsBehind === 0) return { count: null, accessibleName: null };
  const commitsPhrase = CountTextUtil.countedPhrase(update.commitsBehind, 'new commit', 'new commits');
  return {
    count:          update.commitsBehind > LARGEST_COUNT_SHOWN ? `${LARGEST_COUNT_SHOWN}+` : String(update.commitsBehind),
    accessibleName: `Update Gaia, ${commitsPhrase} on main`,
  };
}

function updateButtonOf(update: FleetDocumentGaiaUpdate | null, send: (command: CommandBody) => void): BrandBarUpdateButton | null {
  if (update === null) return null;
  const { command, ...shown } = BUTTON_OF_STATE[update.state];
  const restartIsOff = update.state === 'restart-needed' && !update.restartIsPossible;
  return {
    ...shown,
    ...countOf(update),
    disabled: restartIsOff,
    onPress:  () => {
      if (command !== null) send(command);
    },
    note:          noteOf(update),
    noteIsFailure: update.failure !== null,
  };
}

function menuOf(update: FleetDocumentGaiaUpdate | null, send: (command: CommandBody) => void): BrandBarMenu | null {
  if (update === null) return null;
  return {
    rebootIsOff: !update.restartIsPossible || STATES_A_REBOOT_WAITS_ON.has(update.state),
    rebootTitle: update.restartIsPossible ? null : REBOOT_BY_HAND_TITLE,
    onReboot:    () => send({ kind: 'gaia-reboot' }),
  };
}

export const GaiaUpdateButtonModel = { updateButtonOf, menuOf } as const;
