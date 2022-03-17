# tasq

A simple queue for tasks.

```javascript
new Tasq()
  .add('World')
  .do(value => console.log('Hello %s!', value))
  .run();
// Hello World!
```

## Example

- The `run(...callbacks)` method will use the first callback to iterate through `add`ed items and run the next callbacks afterward.
- You can also use `do(...callbacks)` to save the callbacks and start them via `run()`.
- Calling `run()` again will rerun all the callbacks from the start to process new `add`ed items.
  - Occurs only after the current callback has been resolved.
- All `add`ed items get removed after all the callbacks have been resolved.

Code:

```javascript
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const task = new Tasq()
  .add(1, 2)
  .run(
    value => console.log('[input]', value) || { data: value },
    last => console.log('[last: %o] waiting...', last) || wait(200),
    () => console.log('finished') || { break: true },
    () => console.log('unreached')
  )
  .done(items => console.log('done', items));
setTimeout(() => task.add(4, 5).run(), 100);
setTimeout(() => task.add(6).run(), 300);
```

Output:

```text
[input] 1
[input] 2
[last: 2] waiting...
[input] 4
[input] 5
[last: 5] waiting...
[input] 6
[last: 6] waiting...
finished
done [ 1, 2, 4, 5, 6 ]
```
