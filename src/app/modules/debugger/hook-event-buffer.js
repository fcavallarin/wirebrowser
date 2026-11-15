// Collects hook output (results, logs, warnings, errors) so that it can be
// pulled on demand instead of being pushed through callbacks.
// Intended for programmatic / agent-facing callers (e.g. an MCP server):
//
//   const buffer = new HookEventBuffer();
//   debuggerModule.addHook(location, handlers, buffer.handleResult);
//   await debuggerModule.startHooks(pageId, buffer.events);
//   await buffer.waitForEvents({ minResults: 1, timeoutMs: 10000 });
//   const { events, dropped } = buffer.drain();
//
// The buffer is bounded: when full, the oldest events are discarded and
// counted in `dropped`.
//
// Function sources are deduplicated: each result carries a `functionSourceId`
// instead of the full `functionSource`, and the source text is stored once.
// The id is derived from the content (not from the hook location) because,
// after ctx.followReturn()/ctx.step*(), events keep the hook location but
// refer to a different function.

class HookEventBuffer {
  constructor({ maxEvents = 1000 } = {}) {
    this.maxEvents = maxEvents;
    this.buffer = [];
    this.dropped = 0;
    this.seq = 0;
    this.waiters = new Set();
    this.sourceIds = new Map();  // source text -> id
    this.sources = new Map();    // id -> source text

    // To be passed as the `events` argument of startHooks
    this.events = {
      log: (e) => this.push("log", { message: e.message }),
      warn: (e) => this.push("warn", { message: e.message }),
      error: (e) => this.push("error", { message: e.message }),
    };
  }

  push = (type, data) => {
    this.buffer.push({ seq: ++this.seq, ts: Date.now(), type, ...data });
    if (this.buffer.length > this.maxEvents) {
      this.buffer.shift();
      this.dropped++;
    }
    for (const w of this.waiters) {
      w.check();
    }
  };

  storeFunctionSource = (source) => {
    if (!source) {
      return undefined;
    }
    let id = this.sourceIds.get(source);
    if (!id) {
      id = `src${this.sourceIds.size + 1}`;
      this.sourceIds.set(source, id);
      this.sources.set(id, source);
    }
    return id;
  };

  getFunctionSource = (id) => {
    return this.sources.get(id);
  };

  // To be passed as the hook's handleResult
  handleResult = async (result) => {
    const { functionSource, ...rest } = result;
    const functionSourceId = this.storeFunctionSource(functionSource);
    this.push(result.error ? "hookError" : "result", {
      result: { ...rest, functionSourceId }
    });
  };

  countResults = () => {
    return this.buffer.filter(e => e.type === "result" || e.type === "hookError").length;
  };

  // Resolves when at least `minResults` hook results are buffered, or when
  // `timeoutMs` expires. Never rejects: returns { timedOut }.
  waitForEvents = ({ minResults = 1, timeoutMs = 10000 } = {}) => {
    return new Promise((resolve) => {
      const waiter = {
        check: () => {
          if (this.countResults() >= minResults) {
            done(false);
          }
        }
      };
      const timer = setTimeout(() => done(true), timeoutMs);
      const done = (timedOut) => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve({ timedOut });
      };
      this.waiters.add(waiter);
      waiter.check();
    });
  };

  // Returns and clears buffered events, together with the function sources
  // they reference (sources are kept, so getFunctionSource() keeps working).
  drain = () => {
    const functionSources = {};
    for (const e of this.buffer) {
      const id = e.result?.functionSourceId;
      if (id && !(id in functionSources)) {
        functionSources[id] = this.sources.get(id);
      }
    }
    const out = { events: this.buffer, dropped: this.dropped, functionSources };
    this.buffer = [];
    this.dropped = 0;
    return out;
  };

  size = () => {
    return this.buffer.length;
  };
}

export default HookEventBuffer;
