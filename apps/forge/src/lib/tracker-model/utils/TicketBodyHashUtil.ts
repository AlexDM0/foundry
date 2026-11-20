/**
 * The content hashes of the model: 64-bit FNV-1a over a text's UTF-8 bytes, computed in plain script because the page compiles this model.
 * A ticket's content hash covers its title and body, so whether the builder saw the kept content is a hash comparison, never a clock.
 */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME        = 0x100000001b3n;
const HASH_WIDTH_BITS  = 64;
const HASH_HEX_DIGITS  = 16;

function bodyHashOf(body: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(body)) {
    hash = BigInt.asUintN(HASH_WIDTH_BITS, (hash ^ BigInt(byte)) * FNV_PRIME);
  }
  return hash.toString(16).padStart(HASH_HEX_DIGITS, '0');
}

/** Hashed as a canonical record, as a gate and a pipeline are, so a title and a body never run into each other. */
function contentHashOf(title: string, body: string): string {
  return bodyHashOf(JSON.stringify({ title, body }));
}

export const TicketBodyHashUtil = { bodyHashOf, contentHashOf } as const;
