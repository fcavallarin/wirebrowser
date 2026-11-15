import { SerialQueue } from "#src/app/utils.js";

class DebuggerStateMachine {
  constructor(dbg) {
    this.dbg = dbg;
    this.resetLock();
    this.dbg.on("paused", this._onPaused);
  }

  resetLock() {
    this._queue = new SerialQueue();
  }

  // Ensures all BDHS operations run sequentially.
  // CDP events may arrive while an async step is still running, which could
  // cause overlapping scans, duplicate stepping, or corrupted state.
  //
  // `_withLock()` serializes all operations through a SerialQueue: each task
  // waits for the previous one to finish, guaranteeing strict FIFO order and
  // preventing race conditions.
  //
  // Errors are passed to onError and never break the queue (an onError that
  // throws is logged instead of leaving a rejected chain behind).
  _withLock = (fn) => {
    return this._queue.run(fn).catch((err) => {
      try {
        if (this.onError) {
          this.onError(err);
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  _onPaused = (event) => {
    this._withLock(async () => {
      await this.onPaused(event);
    });
  }

  onPaused = async (event) => {}
  onError = (err) => {}
}

export default DebuggerStateMachine;