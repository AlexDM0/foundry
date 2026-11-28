/**
 * The brand bar's update button for each state of Gaia's update: what it reads, whether it is the bar's primary, what a press sends, and
 * the note beside it; a step on its way and a restart Gaia cannot make leave it off.
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
  return button === null ? [] : [button.label, button.emphasis, button.disabled, button.note];
}

describe('the update button', () => {
  test('is absent before Gaia knows its update', () => {
    expect(GaiaUpdateButtonModel.updateButtonOf(null, () => undefined)).toBeNull();
  });

  test('reads Up to date, quiet, and a press checks again', () => {
    expect(shownOf(UP_TO_DATE)).toEqual(['Up to date', 'quiet', false, null]);
    expect(pressed(UP_TO_DATE)).toEqual([{ kind: 'gaia-update-check' }]);
  });

  test('reads Update Gaia as the bar\'s primary with the commits it brings, and a press updates', () => {
    const available: FleetDocumentGaiaUpdate = { ...UP_TO_DATE, state: 'available', commitsBehind: 3 };
    expect(shownOf(available)).toEqual(['Update Gaia', 'primary', false, '3 new commits on main']);
    expect(pressed(available)).toEqual([{ kind: 'gaia-update' }]);
  });

  test('is off while a check, an update or a restart is on its way', () => {
    expect(shownOf({ ...UP_TO_DATE, state: 'checking' })).toEqual(['Checking for updates…', 'quiet', true, null]);
    expect(shownOf({ ...UP_TO_DATE, state: 'updating' })).toEqual(['Updating Gaia…', 'primary', true, null]);
    expect(shownOf({ ...UP_TO_DATE, state: 'restarting' })).toEqual(['Restarting Gaia…', 'primary', true, null]);
    expect(pressed({ ...UP_TO_DATE, state: 'updating' })).toEqual([]);
  });

  test('reads Restart Gaia once updated, and a press restarts; a Gaia that cannot restart says to quit and open it again', () => {
    const restartNeeded: FleetDocumentGaiaUpdate = { ...UP_TO_DATE, state: 'restart-needed' };
    expect(shownOf(restartNeeded)).toEqual(['Restart Gaia', 'primary', false, null]);
    expect(pressed(restartNeeded)).toEqual([{ kind: 'gaia-restart' }]);
    expect(shownOf({ ...restartNeeded, restartIsPossible: false })).toEqual(['Restart Gaia', 'primary', true, 'Quit Gaia and open it again to run the update.']);
  });

  test('says why the last step did not finish, and offers to check again when origin did not answer', () => {
    expect(shownOf({ ...UP_TO_DATE, state: 'not-known', failure: 'origin-unreachable' }))
      .toEqual(['Check for updates', 'quiet', false, 'Gaia could not reach its origin to look for an update.']);
    expect(shownOf({
      ...UP_TO_DATE, state: 'available', commitsBehind: 2, failure: 'local-changes'
    })[3]).toBe('Gaia\'s clone has local changes, so Gaia left it as it is.');
    expect(shownOf({ ...UP_TO_DATE, state: 'restart-needed', failure: 'forge-setup-failed' })[3])
      .toBe('Gaia is updated, but forge\'s setup did not finish: the forge command may still be the old one.');
  });
});
