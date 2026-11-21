/**
 * The "What notifies" list as C2 draws it in version 2. What matters: the count of kinds on sits at the end of the dialog's title line and
 * follows the settings, never a number of its own; the seven kinds sit in one card with a hairline between each two
 * (SCREENS C2). The behaviour of the list is held in `GaiaPanel.spec.tsx`.
 */
import { describe, expect, test } from 'bun:test';
import { Card }                   from 'design-system/Card';
import { Checkbox }               from 'design-system/Checkbox';
import { Dialog }                 from 'design-system/Dialog';

import type { CommandStates }                                  from '../../api/CommandSender.ts';
import { senderOver }                                          from '../../testing/CommandServer.ts';
import { ReactElementTree }                                    from '../../testing/ReactElementTree.ts';
import { FLEET_FIVE_FORGES }                                   from '../../testing/fixtures/fleet-five-forges.ts';
import { GaiaPanelModel }                                      from './GaiaPanelModel.ts';
import { kindsOnLineOf, WhatNotifiesBody, WhatNotifiesDialog } from './WhatNotifiesDialog.tsx';

const tree = ReactElementTree;

const IDLE_STATES: CommandStates = senderOver([]).states();

const doNothing = () => undefined;

const HANDLERS = { onSettingsCheckbox: doNothing, onDismissFailure: doNothing };

function contentOf(fleetDocument = FLEET_FIVE_FORGES) {
  return GaiaPanelModel.whatNotifiesOf(fleetDocument, { commandStates: IDLE_STATES, sentSettingsChange: null });
}

describe('"What notifies" in version 2 (C2)', () => {
  test('counts the kinds on at the end of the title line, as the five on by default read "5 of 7 on"', () => {
    const dialog = tree.onlyOfComponent(tree.unfolded(<WhatNotifiesDialog content={contentOf()} handlers={HANDLERS} onClose={doNothing} />), Dialog);
    expect(dialog.props['title']).toBe('What notifies');
    const headEnd = tree.unfoldedProp(dialog, 'headEnd');
    expect([tree.onlyWithClass(headEnd, 'gaia-forges-what-notifies-count').tag, tree.textOf(headEnd)]).toEqual(['span', '5 of 7 on']);
  });

  test('is the package\'s wide dialog, the one closest to the width C2 draws', () => {
    const dialog = tree.onlyOfComponent(tree.unfolded(<WhatNotifiesDialog content={contentOf()} handlers={HANDLERS} onClose={doNothing} />), Dialog);
    expect(dialog.props['width']).toBe('wide');
  });

  test('the count follows the settings: a kind switched on adds one, and all off reads "0 of 7 on"', () => {
    const { notifications } = FLEET_FIVE_FORGES.settings;
    const withKinds = (kinds: typeof notifications.kinds) => ({ ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, notifications: { ...notifications, kinds } } });
    const withDrafts = withKinds({ ...notifications.kinds, 'draft-tickets': true });
    const noneOn = withKinds(Object.fromEntries(Object.keys(notifications.kinds).map((kind) => [kind, false])) as typeof notifications.kinds);
    expect([kindsOnLineOf(contentOf(withDrafts)), kindsOnLineOf(contentOf(noneOn))]).toEqual(['6 of 7 on', '0 of 7 on']);
  });

  test('sets the seven kinds in one card, a hairline between each two', () => {
    const unfolded = tree.unfolded(<WhatNotifiesBody content={contentOf()} handlers={HANDLERS} />);
    const card = tree.onlyOfComponent(unfolded, Card);
    expect(tree.hostElementsIn([card], tree.withComponent(Checkbox))).toHaveLength(7);
    expect(card.props['divider']).toBe(true);
  });

  test('the kinds are the seven of C2, in its order', () => {
    const labels = contentOf().kinds.map((checkbox) => checkbox.label);
    expect(labels).toEqual([
      'Escalated questions',
      'Questions',
      'Reviews and merge accepts',
      'A forge holds its launches or stops answering',
      'A quiet agent',
      'The machine is at its agent limit',
      'Draft tickets',
    ]);
  });
});
