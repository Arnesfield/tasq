export interface TasqOptions {
  blocking?: boolean;
}

export interface TasqDoneResult<T> {
  nth: number;
  items: T[];
}

export interface TasqRunResult<T> extends TasqDoneResult<T> {
  error?: unknown;
}

export interface TasqErrorResult<T> extends TasqDoneResult<T> {
  error?: unknown;
  index: number;
  callbackIndex: number;
}

export interface TasqCallbackResult {
  data?: any;
  break?: boolean;
}

export interface TasqCallbackArgs<T> {
  data: T;
  nth: number;
}

export type TasqCallback<T> = (
  args: TasqCallbackArgs<T>,
  task: Tasq<T>
) => TasqCallbackResult | void | Promise<TasqCallbackResult | void>;

export type TasqDoneCallback<T> = (
  result: TasqDoneResult<T>,
  task: Tasq<T>
) => void | Promise<void>;

export type TasqErrorCallback<T> = (
  result: TasqErrorResult<T>,
  task: Tasq<T>
) => void | Promise<void>;

export class Tasq<T> {
  private nth: number = 0;
  private index: number = 0;
  private callbackIndex: number = 0;
  private running: boolean = false;
  private current: T | undefined;
  private readonly items: T[] = [];
  private readonly callbacks: TasqCallback<any>[] = [];
  private onDone?: TasqDoneCallback<T>;
  private onError?: TasqErrorCallback<T>;
  protected readonly options: Readonly<TasqOptions>;

  constructor(options: TasqOptions = {}) {
    const { blocking = true } = options;
    this.options = Object.freeze({ blocking });
  }

  isRunning(): boolean {
    return this.running;
  }

  getItems(): T[] {
    return this.items;
  }

  getCurrent(): T | undefined {
    return this.current;
  }

  getIndex(): number {
    return this.index;
  }

  getCallbackIndex(): number {
    return this.callbackIndex;
  }

  add(...items: T[]): this {
    this.items.push(...items);
    return this;
  }

  done(callback: TasqDoneCallback<T>): this {
    this.onDone = callback;
    return this;
  }

  catch(callback: TasqErrorCallback<T>): this {
    this.onError = callback;
    return this;
  }

  clear(): this {
    this._clear();
    return this;
  }

  do(
    callback: TasqCallback<T> | null,
    ...callbacks: TasqCallback<any>[]
  ): this {
    const all = callback ? [callback].concat(callbacks) : [];
    this.callbacks.splice(0, this.callbacks.length, ...all);
    return this;
  }

  run(): this;
  run(callback: TasqCallback<T>, ...callbacks: TasqCallback<any>[]): this;
  run(callback?: TasqCallback<T>, ...callbacks: TasqCallback<any>[]): this {
    if (typeof callback === 'function') {
      this.do(callback, ...callbacks);
    }
    this.runAsync();
    return this;
  }

  runAsync(): Promise<TasqRunResult<T> | undefined>;
  runAsync(
    callback: TasqCallback<T>,
    ...callbacks: TasqCallback<any>[]
  ): Promise<TasqRunResult<T> | undefined>;
  async runAsync(
    callback?: TasqCallback<T>,
    ...callbacks: TasqCallback<any>[]
  ): Promise<TasqRunResult<T> | undefined> {
    if (typeof callback === 'function') {
      this.do(callback, ...callbacks);
    }
    this.callbackIndex = 0;
    if (this.running && this.options.blocking) {
      return;
    }
    const nth = ++this.nth;
    try {
      this.running = true;
      // don't proceed if first callback can't be fired
      let result: TasqCallbackResult = {
        break: this.index >= this.items.length
      };
      while (!result.break && this.callbackIndex < this.callbacks.length) {
        const callbackIndex = this.callbackIndex++;
        const callback = this.callbacks[callbackIndex];
        // handle first callback
        while (callbackIndex === 0 && this.index < this.items.length) {
          const item = this.items[this.index++];
          this.current = item;
          result = (await callback({ nth, data: item }, this)) || {};
        }
        if (callbackIndex > 0 && !result.break) {
          result = (await callback({ nth, data: result.data }, this)) || {};
        }
      }
      return this.finally(nth);
    } catch (error: unknown) {
      return this.finally(nth, error, true);
    }
  }

  private _clear(): T[] {
    this.index = 0;
    const items = this.items.splice(0, this.items.length);
    if (!this.running) {
      this.current = undefined;
    }
    return items;
  }

  private finally(
    nth: number,
    error?: unknown,
    didError = false
  ): TasqRunResult<T> {
    this.nth = 0;
    this.running = false;
    const index = this.index - 1;
    const { callbackIndex } = this;
    const items = this._clear();
    const doneResult: TasqDoneResult<T> = { nth, items };
    const runResult: TasqRunResult<T> = { ...doneResult };
    if (didError) {
      runResult.error = error;
    }
    const errorResult: TasqErrorResult<T> = {
      ...doneResult,
      index,
      callbackIndex
    };
    this.finish(doneResult, errorResult, didError);
    return runResult;
  }

  protected async finish(
    doneResult: TasqDoneResult<T>,
    errorResult: TasqErrorResult<T>,
    didError: boolean
  ): Promise<void> {
    try {
      if (didError) {
        await this.onError?.(errorResult, this);
      } else {
        await this.onDone?.(doneResult, this);
      }
    } catch (error: unknown) {
      const label = didError ? 'error' : 'done';
      console.error(
        `[tasq] An error occurred within "${label}" callback.`,
        error
      );
    }
  }
}
