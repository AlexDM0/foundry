/**
 * The Bridge's entry point: sets the theme and the embedded mark before the first paint and follows an embedding parent's theme from
 * then on, exchanges the session code `open` put in the fragment, then mounts the one React root inside the error boundary, over the
 * browser's own fetch, EventSource, storage and location.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { CommandClient }                                  from './api/CommandClient.ts';
import { EventStreamClient }                              from './api/EventStreamClient.ts';
import { IdentityClient }                                 from './api/IdentityClient.ts';
import { PictureUploadClient }                            from './api/PictureUploadClient.ts';
import { SessionCodeExchange }                            from './api/SessionCodeExchange.ts';
import { SessionTokenSource }                             from './api/SessionTokenSource.ts';
import { TranscriptStreamClient }                         from './api/TranscriptStreamClient.ts';
import { BROWSER_STORAGE_AREAS, sharedPreferenceStoreOf } from './preferences/PreferenceStore.ts';
import { BridgeApp, type BridgeServices }                 from './shell/BridgeApp.tsx';
import { BridgeErrorBoundary }                            from './shell/BridgeErrorBoundary.tsx';
import { EmbeddedChannel }                                from './shell/EmbeddedChannel.ts';
import { FirstPaint }                                     from './shell/FirstPaint.ts';
import { QuestionAlerts }                                 from './views/questions/QuestionAlerts.ts';

const ROOT_ELEMENT_ID = 'bridge-root';

const { embedded } = FirstPaint.prepare(sharedPreferenceStoreOf());

// One token source, so a token the command client rotated is the one the picture upload carries; each client then fetches through it.
const sessionTokenSource = SessionTokenSource.create();

const services: BridgeServices = {
  commandClient:        CommandClient.create(undefined, sessionTokenSource),
  pictureUploadClient:  PictureUploadClient.create(undefined, sessionTokenSource),
  openEventStream:      (handlers) => EventStreamClient.open(handlers),
  fetchIdentity:        () => IdentityClient.fetchIdentity(),
  reload:               () => window.location.reload(),
  storage:              BROWSER_STORAGE_AREAS.local,
  embedded,
  embeddedSurroundings: EmbeddedChannel.browserSurroundings,
  now:                  () => new Date(),
  followTranscript:     (jobId, handlers) => TranscriptStreamClient.follow(jobId, handlers),
  questionNotifier:     QuestionAlerts.browserQuestionNotifier(),
};

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
// The session cookie must be set before the event stream and the first reads go out; a page with no code reads with the cookie it has.
void SessionCodeExchange.exchangeCodeInFragment(window.location, (address) => window.history.replaceState(null, '', address)).then((outcome) => {
  if (rootElement === null) return;
  createRoot(rootElement).render(
    <StrictMode>
      <BridgeErrorBoundary>
        <BridgeApp services={services} sessionExchangeOutcome={outcome} />
      </BridgeErrorBoundary>
    </StrictMode>,
  );
});
