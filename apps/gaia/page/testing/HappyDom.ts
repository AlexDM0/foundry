/**
 * The DOM preload for the board's `.dom.tsx` specs alone: registering happy-dom replaces `fetch` and the other globals for every spec in
 * the run, so it is never a preload of the main `bun test` run. `page/testing/RunDomSpecs.ts` passes it with `--preload`. A stylesheet link
 * loads nothing and reports success.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://127.0.0.1:4790/', settings: { handleDisabledFileLoadingAsSuccess: true } });

/**
 * Bun prints a node in a failed assertion by walking all it reaches, document and window included: up to seconds of CPU a print, which under
 * load outlasts a waitFor's whole bound. The node's opening tag names it as well.
 */
function openingTagOf(node: Node): string {
  if (!(node instanceof Element)) return node.nodeName;
  const attributes = [...node.attributes].map((attribute) => ` ${attribute.name}="${attribute.value}"`).join('');
  return `<${node.localName}${attributes}>`;
}

Object.defineProperty(Node.prototype, Bun.inspect.custom, {
  configurable: true,
  value(this: Node) {
    return openingTagOf(this);
  },
});
