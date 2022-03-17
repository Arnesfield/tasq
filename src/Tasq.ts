export interface TasqResult<T> {
  items: T[];
  error?: unknown;
  didError?: boolean;
}

export interface TasqCallbackResult {
  data?: any;
  break?: boolean;
}

export type TasqCallback<T> = (
  item: T,
  task: Tasq<T>
) => TasqCallbackResult | void | Promise<TasqCallbackResult | void>;

export type TasqDoneCallback<T> = (
  items: T[],
  task: Tasq<T>
) => void | Promise<void>;
export type TasqErrorCallback<T> = (
  error: unknown,
  items: T[],
  task: Tasq<T>
) => void | Promise<void>;

export class Tasq<T> {
  private index: number = 0;
  private cbIndex: number = 0;
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

  getIndex(): { items: number; callback: number } {
    return { items: this.index, callback: this.cbIndex };
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
    this.cbIndex = 0;
    if (this.running) {
      return;
    }
    try {
      this.running = true;
      let result: TasqCallbackResult = {};
      while (!result.break && this.cbIndex < this.callbacks.length) {
        const cbIndex = this.cbIndex++;
        const callback = this.callbacks[cbIndex];
        // handle first callback
        while (cbIndex === 0 && this.index < this.items.length) {
          const item = this.items[this.index++];
          this.current = item;
          result = (await callback(item, this)) || {};
        }
        if (cbIndex > 0 && !result.break) {
          result = (await callback(result.data, this)) || {};
        }
      }
      return this.finally();
    } catch (error: unknown) {
      return this.finally(error, true);
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

  private finally(error?: unknown, didError = false): TasqResult<T> {
    this.running = false;
    const items = this._clear();
    const result: TasqResult<T> = { items, error, didError };
    this.finish(result);
    return result;
  }

  protected async finish(result: TasqResult<T>): Promise<void> {
    const { items, error, didError } = result;
    try {
      if (didError) {
        await this.onError?.(error, items, this);
      } else {
        await this.onDone?.(items, this);
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
