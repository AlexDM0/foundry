/**
 * The DOM preload for the marks' `.dom.tsx` specs alone: registering happy-dom replaces `fetch` and the other globals for every spec in
 * the run, so the package's `test` script passes it with `--preload` to the DOM specs' own run, never to the plain `bun test`.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
