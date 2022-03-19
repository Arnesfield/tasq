export interface TasqResult<T> {
  items: T[];
  error?: unknown;
}

export interface TasqErrorResult<T> extends TasqResult<T> {
  index: number;
  callbackIndex: number;
}

export interface TasqCallbackResult {
  data?: any;
  break?: boolean;
}

export type TasqCallback<T> = (
  data: T,
  task: Tasq<T>
) => TasqCallbackResult | void | Promise<TasqCallbackResult | void>;

export type TasqDoneCallback<T> = (
  items: T[],
  task: Tasq<T>
) => void | Promise<void>;

export type TasqErrorCallback<T> = (
  result: TasqErrorResult<T>,
  task: Tasq<T>
) => void | Promise<void>;

export class Tasq<T> {
  private index: number = 0;
  private callbackIndex: number = 0;
  private running: boolean = false;
  private current: T | undefined;
  private readonly items: T[] = [];
  private readonly callbacks: TasqCallback<any>[] = [];
  private onDone?: TasqDoneCallback<T>;
  private onError?: TasqErrorCallback<T>;

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

  runAsync(): Promise<TasqResult<T> | undefined>;
  runAsync(
    callback: TasqCallback<T>,
    ...callbacks: TasqCallback<any>[]
  ): Promise<TasqResult<T> | undefined>;
  async runAsync(
    callback?: TasqCallback<T>,
    ...callbacks: TasqCallback<any>[]
  ): Promise<TasqResult<T> | undefined> {
    if (typeof callback === 'function') {
      this.do(callback, ...callbacks);
    }
    this.callbackIndex = 0;
    if (this.running) {
      return;
    }
    let { callbackIndex } = this;
    try {
      this.running = true;
      // don't proceed if first callback can't be fired
      let result: TasqCallbackResult = {
        break: this.index >= this.items.length
      };
      while (!result.break && this.callbackIndex < this.callbacks.length) {
        callbackIndex = this.callbackIndex++;
        const callback = this.callbacks[callbackIndex];
        // handle first callback
        while (callbackIndex === 0 && this.index < this.items.length) {
          const item = this.items[this.index++];
          this.current = item;
          result = (await callback(item, this)) || {};
        }
        if (callbackIndex > 0 && !result.break) {
          result = (await callback(result.data, this)) || {};
        }
      }
      return this.finally(callbackIndex);
    } catch (error: unknown) {
      return this.finally(callbackIndex, error, true);
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

  private finally(callbackIndex: number): TasqResult<T>;
  private finally(
    callbackIndex: number,
    error: unknown,
    didError: boolean
  ): TasqResult<T>;
  private finally(
    callbackIndex: number,
    error?: unknown,
    didError = false
  ): TasqResult<T> {
    this.running = false;
    const index = this.index - 1;
    const items = this._clear();
    const result: TasqResult<T> = { items };
    const errorResult: TasqErrorResult<T> = { items, index, callbackIndex };
    if (didError) {
      result.error = error;
      errorResult.error = error;
    }
    this.finish(errorResult, didError);
    return result;
  }

  protected async finish(
    result: TasqErrorResult<T>,
    didError: boolean
  ): Promise<void> {
    try {
      if (didError) {
        await this.onError?.(result, this);
      } else {
        await this.onDone?.(result.items, this);
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
