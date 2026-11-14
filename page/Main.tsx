/**
 * The page's entry: sets the theme before the first paint, registers the design system's fonts, spends the session code the launcher put in
 * the fragment, then follows Gaia's event stream and mounts the one React root over the browser's own location, storage and title. The
 * fleet source starts empty; the event stream fills it.
 */
import { loadDesignSystemFonts } from 'design-system/FontLoader';
import { StrictMode }            from 'react';
import { createRoot }            from 'react-dom/client';

import { CommandSender }                     from './api/CommandSender.ts';
import { FleetStreamClient }                 from './api/FleetStreamClient.ts';
import { createFleetSource }                 from './shell/FleetSource.ts';
import { browserShellSurroundings, GaiaApp } from './shell/GaiaApp.tsx';
import { SessionCodeExchange }               from './shell/SessionCodeExchange.ts';
import { ThemeBootstrap }                    from './shell/ThemeBootstrap.ts';

const ROOT_ELEMENT_ID = 'gaia-root';

const surroundings = browserShellSurroundings();
ThemeBootstrap.applyBeforeFirstPaint(surroundings.theme);
loadDesignSystemFonts();

const fleetSource = createFleetSource();
const fleetStream = FleetStreamClient.create(fleetSource.publish, FleetStreamClient.browserSurroundings());
const commandSender = CommandSender.create({
  sendRequest:    (path, requestOptions) => fetch(path, requestOptions),
  controlsMayAct: () => FleetStreamClient.controlsMayActIn(fleetStream.state()),
});

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
// The session cookie must be set before anything reads the fleet; a page with no code reads with the cookie it has.
void SessionCodeExchange.exchangeCodeInFragment(
  window.location,
  (address) => window.history.replaceState(null, '', address),
  (path, requestOptions) => fetch(path, requestOptions),
).then(() => {
  if (rootElement === null) return;
  fleetStream.follow();
  createRoot(rootElement).render(
    <StrictMode>
      <GaiaApp fleetSource={fleetSource} fleetStream={fleetStream} commandSender={commandSender} surroundings={surroundings} />
    </StrictMode>,
  );
});
