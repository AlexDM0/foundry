/**
 * The page's entry: sets the theme before the first paint, spends the session code the launcher put in the fragment, then mounts the one
 * React root over the browser's own location, storage and title. The fleet source starts empty; the event stream fills it.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createFleetSource }                 from './shell/FleetSource.ts';
import { browserShellSurroundings, GaiaApp } from './shell/GaiaApp.tsx';
import { SessionCodeExchange }               from './shell/SessionCodeExchange.ts';
import { ThemeBootstrap }                    from './shell/ThemeBootstrap.ts';

const ROOT_ELEMENT_ID = 'gaia-root';

const surroundings = browserShellSurroundings();
ThemeBootstrap.applyBeforeFirstPaint(surroundings.theme);

const fleetSource = createFleetSource();

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
// The session cookie must be set before anything reads the fleet; a page with no code reads with the cookie it has.
void SessionCodeExchange.exchangeCodeInFragment(
  window.location,
  (address) => window.history.replaceState(null, '', address),
  (input, init) => fetch(input, init),
).then(() => {
  if (rootElement === null) return;
  createRoot(rootElement).render(
    <StrictMode>
      <GaiaApp fleetSource={fleetSource} surroundings={surroundings} />
    </StrictMode>,
  );
});
