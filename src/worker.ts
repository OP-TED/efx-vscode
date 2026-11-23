// The worker thread of the extension (EfxWorker.ts), which reads EFX texts with the highlighter's
// parser, away from VS Code's extension host: to tell what a text holds, and to colour it. It answers
// requests one at a time, each a method of METHODS with its parameters, by the request's number.

import { parentPort } from 'node:worker_threads';
import { efxHighlights, inferEfx, type EfxReading } from '@op-ted/efx-syntax-highlighter';
import { encodedTokens } from './EfxTokenKinds';

/** The methods of the worker, each with its parameters and its answer. */
export const METHODS = {
  /** What a text holds (inferEfx): its version of EFX and its kind of file, or only its kind, in a version given. */
  reading({ text, version }: { text: string; version?: 2 }): EfxReading {
    return version === undefined ? inferEfx(text) : inferEfx(text, { version });
  },

  /** The semantic tokens of a text, read in a version of EFX as a kind of file (EfxTokenKinds.ts). */
  semanticTokens({ text, reading }: { text: string; reading: EfxReading }): Uint32Array {
    const highlights = reading.version === 2 ? efxHighlights(text, reading.kind) : efxHighlights(text, reading.kind, { version: 1 });
    return encodedTokens(text, highlights);
  },
};

export type EfxMethod = keyof typeof METHODS;

/** A request to the worker: its number, the method, and the method's parameters. */
export interface EfxRequest<M extends EfxMethod = EfxMethod> {
  readonly id: number;
  readonly method: M;
  readonly params: Parameters<(typeof METHODS)[M]>[0];
}

/** The answer to a request, by its number: the method's answer, or the message of its error. */
export type EfxAnswer<M extends EfxMethod = EfxMethod> =
  | { readonly id: number; readonly result: ReturnType<(typeof METHODS)[M]> }
  | { readonly id: number; readonly error: string };

parentPort?.on('message', ({ id, method, params }: EfxRequest) => {
  try {
    const result = (METHODS[method] as (parameters: unknown) => unknown)(params);
    // An answer of numbers, as the semantic tokens are, is handed over, not copied.
    parentPort?.postMessage({ id, result } as EfxAnswer, ArrayBuffer.isView(result) ? [result.buffer as ArrayBuffer] : []);
  } catch (error) {
    parentPort?.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies EfxAnswer);
  }
});
