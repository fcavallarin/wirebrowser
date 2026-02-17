class DebuggerStateMachine {
  constructor(dbg) {
    this.dbg = dbg;
    this.resetLock();
    this.dbg.on("paused", this._onPaused);
  }

  resetLock() {
    this._lock = Promise.resolve();
  }

  // Ensures all BDHS operations run sequentially.
  // CDP events may arrive while an async step is still running, which could
  // cause overlapping scans, duplicate stepping, or corrupted state.
  //
  // `_withLock()` serializes all operations by chaining them onto a shared
  // promise (`this._lock`). Each task waits for the previous one to finish,
  // guaranteeing strict FIFO order and preventing race conditions.
  //
  // If an error occurs inside the task, it is caught so the chain is never
  // broken (the lock remains alive).
  _withLock = (fn) => {
    this._lock = this._lock
      .then(() => Promise.resolve().then(fn))
      .catch((err) => {
        if(this.onError){
          this.onError(err);
        }
        // Reset the chain to avoid deadlock
        this.resetLock();
      });

    return this._lock;
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