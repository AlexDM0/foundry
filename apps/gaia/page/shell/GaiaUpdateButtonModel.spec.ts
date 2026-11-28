/**
 * The brand bar's update button and menu for each state of Gaia's update: what the button reads, its glyph, whether it is the bar's
 * primary or busy, what a press sends, the count and the note beside it; and when the menu's Reboot Gaia is off.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandBody }             from '../@types/CommandDocument.ts';
import type { FleetDocumentGaiaUpdate } from '../@types/FleetDocument.ts';
import { GaiaUpdateButtonModel }        from './GaiaUpdateButtonModel.ts';

const UP_TO_DATE: FleetDocumentGaiaUpdate = {
  state: 'up-to-date', commitsBehind: 0, failure: null, restartIsPossible: true
};

function pressed(update: FleetDocumentGaiaUpdate): CommandBody[] {
  const sent: CommandBody[] = [];
  GaiaUpdateButtonModel.updateButtonOf(update, (command) => sent.push(command))?.onPress();
  return sent;
}

function shownOf(update: FleetDocumentGaiaUpdate): unknown[] {
  const button = GaiaUpdateButtonModel.updateButtonOf(update, () => undefined);
  return button === null ? [] : [button.label, button.glyph, button.emphasis, button.busy, button.disabled];
}

function noteOf(update: FleetDocumentGaiaUpdate): unknown[] {
  const button = GaiaUpdateButtonModel.updateButtonOf(update, () => undefined);
  return button === null ? [] : [button.note, button.noteIsFailure];
}

describe('the update button', () => {
  test('is absent before Gaia knows its update', () => {
    expect(GaiaUpdateButtonModel.updateButtonOf(null, () => undefined)).toBeNull();
  });

  test('reads Up to date with the done glyph, quiet, and a press checks again', () => {
    expect(shownOf(UP_TO_DATE)).toEqual(['Up to date', 'done', 'quiet', false, false]);
    expect(noteOf(UP_TO_DATE)).toEqual([null, false]);
    expect(pressed(UP_TO_DATE)).toEqual([{ kind: 'gaia-update-check' }]);
  });

  test('reads Update Gaia as the bar\'s primary with the count it brings, and a press updates', () => {
    const available: FleetDocumentGaiaUpdate = { ...UP_TO_DATE, state: 'available', commitsBehind: 3 };
    expect(shownOf(available)).toEqual(['Update Gaia', 'fetch', 'primary', false, false]);
    const button = GaiaUpdateButtonModel.updateButtonOf(available, () => undefined);
    expect([button?.count, button?.accessibleName]).toEqual(['3', 'Update Gaia, 3 new commits on main']);
    expect(GaiaUpdateButtonModel.updateButtonOf({ ...available, commitsBehind: 14 }, () => undefined)?.count).toBe('9+');
    expect(pressed(available)).toEqual([{ kind: 'gaia-update' }]);
  });

  test('is busy while a check, an update or a restart is on its way, and a press sends nothing', () => {
    expect(shownOf({ ...UP_TO_DATE, state: 'checking' })).toEqual(['Checking…', 'busy', 'quiet', true, false]);
    expect(shownOf({ ...UP_TO_DATE, state: 'updating' })).toEqual(['Updating…', 'busy', 'primary', true, false]);
    expect(noteOf({ ...UP_TO_DATE, state: 'updating' })).toEqual(['Fast-forwarding and setting up forge', false]);
    expect(shownOf({ ...UP_TO_DATE, state: 'restarting' })).toEqual(['Restarting…', 'busy', 'primary', true, false]);
    expect(pressed({ ...UP_TO_DATE, state: 'updating' })).toEqual([]);
  });

  test('reads Restart Gaia once updated, and a press restarts; a Gaia that cannot restart is off and says to quit and open it again', () => {
    const restartNeeded: FleetDocumentGaiaUpdate = { ...UP_TO_DATE, state: 'restart-needed' };
    expect(shownOf(restartNeeded)).toEqual(['Restart Gaia', 'restart', 'primary', false, false]);
    expect(noteOf(restartNeeded)).toEqual(['Gaia is updated', false]);
    expect(pressed(restartNeeded)).toEqual([{ kind: 'gaia-restart' }]);
    expect(shownOf({ ...restartNeeded, restartIsPossible: false })).toEqual(['Restart Gaia', 'restart', 'primary', false, true]);
    expect(noteOf({ ...restartNeeded, restartIsPossible: false })).toEqual(['Quit Gaia and open it again to run the update.', false]);
  });

  test('says why the last step failed beside the failure dot, and offers to check again when origin did not answer', () => {
    const notKnown: FleetDocumentGaiaUpdate = { ...UP_TO_DATE, state: 'not-known', failure: 'origin-unreachable' };
    expect(shownOf(notKnown)).toEqual(['Check again', 'again', 'quiet', false, false]);
    expect(noteOf(notKnown)).toEqual(['Gaia could not reach its origin.', true]);
    expect(pressed(notKnown)).toEqual([{ kind: 'gaia-update-check' }]);
    expect(noteOf({
      ...UP_TO_DATE, state: 'available', commitsBehind: 2, failure: 'local-changes'
    })).toEqual(['Gaia\'s clone has local changes, so Gaia left it as it is.', true]);
  });
});

describe('the menu', () => {
  test('is absent before Gaia knows its update, and its Reboot Gaia sends the reboot', () => {
    expect(GaiaUpdateButtonModel.menuOf(null, () => undefined)).toBeNull();
    const sent: CommandBody[] = [];
    const menu = GaiaUpdateButtonModel.menuOf(UP_TO_DATE, (command) => sent.push(command));
    menu?.onReboot();
    expect([menu?.rebootIsOff, menu?.rebootTitle, sent]).toEqual([false, null, [{ kind: 'gaia-reboot' }]]);
  });

  test('turns Reboot Gaia off while an update or a restart is on its way, and with its reason when Gaia cannot reopen itself', () => {
    expect(GaiaUpdateButtonModel.menuOf({ ...UP_TO_DATE, state: 'updating' }, () => undefined)?.rebootIsOff).toBe(true);
    expect(GaiaUpdateButtonModel.menuOf({ ...UP_TO_DATE, state: 'restarting' }, () => undefined)?.rebootIsOff).toBe(true);
    expect(GaiaUpdateButtonModel.menuOf({ ...UP_TO_DATE, state: 'checking' }, () => undefined)?.rebootIsOff).toBe(false);
    const fromATerminal = GaiaUpdateButtonModel.menuOf({ ...UP_TO_DATE, restartIsPossible: false }, () => undefined);
    expect([fromATerminal?.rebootIsOff, typeof fromATerminal?.rebootTitle]).toEqual([true, 'string']);
  });
});
