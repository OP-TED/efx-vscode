import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import * as vscode from 'vscode';
import type { EfxAnswer, EfxMethod, EfxRequest, METHODS } from './worker';

/** A request that waits for the worker, or that the worker runs, with what it answers to. */
interface Job {
  readonly id: number;
  readonly replacing: string | undefined;
  readonly method: EfxMethod;
  readonly params: unknown;
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
}

/**
 * The worker thread that reads EFX for the extension (worker.ts, built into dist/worker.js), so that
 * a long reading never holds up VS Code's extension host, where every extension runs. It runs one
 * request at a time, in the order they come. A request may replace those that wait for the same, as
 * the semantic tokens of a document replace those of the document's older text: only the newest of
 * them waits, and the older ones are cancelled. A request that runs cannot be stopped: its answer goes
 * to whoever still waits for it. A worker that fails fails the request it runs, and a new one takes
 * the next.
 */
export class EfxWorker implements vscode.Disposable {
  #worker: Worker | undefined;
  #running: Job | undefined;
  readonly #waiting: Job[] = [];
  #lastId = 0;
  readonly #runs = new Map<EfxMethod, number>();
  #disposed = false;

  /** start: how a worker thread starts, the extension's own (worker.ts), or a stand-in in its tests. */
  constructor(private readonly start: () => Worker = () => new Worker(path.join(__dirname, 'worker.js'))) {}

  /** How many requests of a method the worker has run, for the extension's tests. */
  runsOf(method: EfxMethod): number {
    return this.#runs.get(method) ?? 0;
  }

  /**
   * The answer of a method of the worker, once the worker has run it; a request that replaces those
   * that wait for the same (replacing) cancels them. Once the worker is disposed, a request is cancelled.
   */
  run<M extends EfxMethod>(method: M, params: Parameters<(typeof METHODS)[M]>[0], replacing?: string):
    Promise<ReturnType<(typeof METHODS)[M]>> {
    return new Promise((resolve, reject) => {
      // Once disposed, the worker takes no more requests, and no new worker starts.
      if (this.#disposed) {
        reject(new vscode.CancellationError());
        return;
      }
      for (const older of this.#waiting.filter((job) => replacing !== undefined && job.replacing === replacing)) {
        this.#waiting.splice(this.#waiting.indexOf(older), 1);
        older.reject(new vscode.CancellationError());
      }
      this.#lastId += 1;
      this.#waiting.push({ id: this.#lastId, replacing, method, params, resolve: resolve as (result: unknown) => void, reject });
      this.#next();
    });
  }

  dispose(): void {
    this.#disposed = true;
    const worker = this.#worker;
    this.#worker = undefined;
    void worker?.terminate();
    this.#fail(new vscode.CancellationError());
  }

  /** Gives the worker the request that has waited longest, when it runs none. */
  #next(): void {
    if (this.#disposed || this.#running !== undefined || this.#waiting.length === 0) {
      return;
    }
    const job = this.#waiting.shift() as Job;
    this.#running = job;
    this.#runs.set(job.method, this.runsOf(job.method) + 1);
    this.#workerToRun().postMessage({ id: job.id, method: job.method, params: job.params } as EfxRequest);
  }

  /** The worker, started when a request first needs it, or again after it has failed. */
  #workerToRun(): Worker {
    if (this.#worker === undefined) {
      const worker = this.start();
      worker.on('message', (answer: EfxAnswer) => this.#answer(answer));
      worker.on('error', (error) => this.#failed(worker, error));
      worker.on('exit', (code) => this.#failed(worker, new Error(`The EFX worker stopped (${code})`)));
      this.#worker = worker;
    }
    return this.#worker;
  }

  /** Gives the answer of the worker to its request, and the worker the next one. */
  #answer(answer: EfxAnswer): void {
    const job = this.#running;
    if (job === undefined || job.id !== answer.id) {
      return;
    }
    this.#running = undefined;
    if ('error' in answer) {
      job.reject(new Error(answer.error));
    } else {
      job.resolve(answer.result);
    }
    this.#next();
  }

  /** Fails the requests of a worker that has failed, and lets a new one take the next. */
  #failed(worker: Worker, error: Error): void {
    if (this.#worker !== worker) {
      return;
    }
    this.#worker = undefined;
    const running = this.#running;
    this.#running = undefined;
    running?.reject(error);
    this.#next();
  }

  /** Fails every request, the one that runs and those that wait. */
  #fail(error: Error): void {
    const jobs = [...(this.#running === undefined ? [] : [this.#running]), ...this.#waiting.splice(0)];
    this.#running = undefined;
    jobs.forEach((job) => job.reject(error));
  }
}
