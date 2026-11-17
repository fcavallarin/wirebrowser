export { };

declare global {
  namespace WB {
    namespace Node {
      /**
       * Scope mode for live object search.
       * - "global": search across the entire heap
       * - "byroot": search starting from a specific root object
       */
      type LiveObjectSearchMode = "global" | "byroot";

      /**
       * HTTP client utilities available in Node context.
       */
      interface HttpClient {
        /**
         * Exposes the `got` HTTP client for making network requests.
         */
        got: any;
      }

      interface ObjectSearchQuery {

        /**
         * Enables the object similarity engine.
         */
        osEnabled?: boolean;

        /**
         * Target object used as reference for similarity matching.
         */
        osObject?: any;

        /**
         * Similarity threshold (0-1, higher means stricter matching).
         */
        osThreshold?: number;

        /**
         * Alpha coefficient (0-1) used to balance structural vs value similarity.
         */
        osAlpha?: number;

        /**
         * Whether to include object values in similarity computation.
         */
        osIncludeValues?: boolean;

        /**
         * Search keyword applied to object property names.
         */
        propertySearch?: WB.Common.SearchQuery;

        /**
         * Search keyword applied to object values.
         */
        valueSearch?: WB.Common.SearchQuery;

        /**
         * Search keyword applied to object class / constructor names.
         */
        classSearch?: WB.Common.SearchQuery;
      }

      /**
       * Configuration object for live object search.
       */
      interface LiveObjectSearchQuery extends ObjectSearchQuery {
        /**
         * Defines the search scope.
         */
        searchMode: LiveObjectSearchMode;

        /**
         * Root object identifier (e.g., window.obj1) used when `searchMode` is "byroot".
         */
        root?: string;
      }

      /**
       * Single result entry returned by live object search.
       * The structure depends on the search mode and engine output.
       */
      interface LiveObjectSearchResult {
        [index: number]: any;
      }

      /**
       * Response returned by `searchLiveObjects`.
       */
      interface LiveObjectSearchResponse {
        /**
         * List of matched objects.
         */
        results: LiveObjectSearchResult[];

        /**
         * Total number of matched results.
         */
        totResults: number;

        /**
         * Total number of objects analyzed during the search.
         */
        totObjectAnalyzed: number;

        /**
         * Indicates whether the results limit was reached.
         */
        resultsLimitReached: boolean;

        /**
         * Execution time in milliseconds.
         */
        timing: number; // ms
      }

      /**
       * Single result entry returned by heap snapshot search.
       * It contains the matched object and additional data
       */
      interface HeapSnapshotSearchResult {
        result: any;
      }

      /**
       * Response returned by `searchHeapSnapshot`.
       */
      interface HeapSnapshotSearchResponse {
        /**
         * List of matched objects.
         */
        results: HeapSnapshotSearchResult[];
      }

      interface HeapSnapshotSearchQuery extends ObjectSearchQuery {

      }

      /** @deprecated
       * LiveHook type:
       * - "inject": executes code in the call frame at the hook location
       * - "return": overrides the function return value at a return location
       */
      type LiveHookType = "inject" | "return";

      /** @deprecated
       * Definition of a LiveHook persisted in the project.
       * Conventions:
       * - file is the script URL used by Debugger.setBreakpointByUrl
       * - line/col are 1-based (human friendly)
       * - when/returnExpr are expressions evaluated in the call frame
       */
      interface LiveHookDefinition {
        /**
         * Script URL (e.g. https://site.com/bundle.js).
         */
        file: string;

        /**
         * 1-based line number.
         */
        line: number;

        /**
         * 1-based column number.
         */
        col: number;

        /**
         * Hook behavior, "inject" or "return".
         */
        hookType: LiveHookType;

        /**
         * Optional guard expression evaluated in the call frame.
         * If falsy, the hook is skipped.
         */
        condition?: string;

        /**
         * For hookType === "inject":
         * JS code executed in the call frame.
         */
        code?: string;

        /**
         * For hookType === "return":
         * Expression evaluated in the call frame; its result is used for setReturnValue.
         * Important: it can be applied to sync functions only.
         * Example: '"ok"', '({a:1})', 'someLocalVar'
         */
        returnExpr?: string;
      }

      interface HookLocation {
        /**
         * URL of the script, as shown in the Sources tab. Scripts without a URL
         * (eval, new Function, dynamically injected code) are listed as
         * `scriptId://<id>`: their id changes on every page reload.
         */
        file: string;
        line: number; // 1-based, relative to the document (also for inline <script>s)
        /**
         * 1-based. Optional: when omitted, the hook targets the function that
         * starts on `line`.
         */
        col?: number;
      }

      /* ------------------------------------------------------------------ */
      /* Stack / values */
      /* ------------------------------------------------------------------ */

      type HookPhase = "enter" | "leave" | "returnFollowed" | "stepFollowed" | "hit";

      interface HookStackFrame {
        type: "sync" | "async";
        asyncLevel: number | null;
        functionName: string;
        file: string;
        line: number; // 1-based
        col: number;  // 1-based
        scriptId?: string;
      }

      /**
       * Minimal CDP-like remote value shape returned by evalResult in handleResult.
       * Keep this intentionally loose.
       */
      interface HookEvalResult {
        type?: string;
        subtype?: string;
        value?: any;
        description?: string;
        objectId?: string;
        [key: string]: any;
      }

      interface HookReturnValue {
        objectId?: string;
        type?: string;
        isPromise?: boolean;
        value?: any;
      }

      /* ------------------------------------------------------------------ */
      /* Previous step */
      /* ------------------------------------------------------------------ */

      interface HookPreviousStep {
        phase: HookPhase;
        step: number;
        stackTrace: HookStackFrame[];
        messages: any[];
        functionSource?: string;
        evalResult?: HookEvalResult;
        /**
         * Names of the variables in scope at that step (see `BaseHookContext.variables`).
         */
        variables: string[];
      }

      /* ------------------------------------------------------------------ */
      /* Contexts */
      /* ------------------------------------------------------------------ */

      interface HookStepControls {
        /**
         * Request a step-into after the current handler completes.
         */
        stepInto(): void;

        /**
         * Request a step-into with async-call following enabled.
         */
        stepIntoAsync(): void;

        /**
         * Request a step-over after the current handler completes.
         */
        stepOver(): void;

        /**
         * Request a step-out after the current handler completes.
         */
        stepOut(): void;
      }

      interface BaseHookContext {
        phase: HookPhase;

        /**
         * Call stack at the pause, innermost frame first (async frames included).
         * @mcp Call stack at the pause, innermost frame first
         */
        stackTrace: HookStackFrame[];

        /**
         * Source of the function the paused frame belongs to.
         */
        functionSource?: string;

        /**
         * Variables in 'local', 'closure' or 'catch' scope.
         * These are the variables that can be modified with ctx.setVariable
         * @mcp Names of the variables in local, closure and catch scope
         */
        variables: string[];

        /**
         * Sends a structured message to the Node-side result handler.
         * Collected into result.messages.
         * @mcp Reports a value (collected into the result's messages)
         */
        send(message: any): void;

        /**
         * Collects log messages that are displayed on the Node-side once the handler execution is completed.
         * @mcp Logs a message
         */
        log(message: string): void;

        /**
         * Schedules an expression to be evaluated in the current call frame.
         *
         * The result is exposed later as `result.evalResult` in handleResult.
         *
         * This runs with full access to the frame scope and `this`.
         * Execution is deferred and the result is not available immediately.
         *
         * Use inline JavaScript for immediate evaluation.
         * @mcp Evaluates an expression in the frame after the handler returns (gives access to `this`); the result is reported as evalResult
         */
        eval(expression: string): void;

        /**
         * Schedules a write to a variable binding in the current call frame using debugger semantics.
         *
         * The variable is resolved by walking the scope chain (CDP order) and selecting
         * the first match in a supported scope (local, closure, catch).
         *
         * This is NOT a normal JavaScript assignment:
         * - execution is deferred (applied after the handler returns)
         * - it bypasses JS semantics (e.g. can modify `const`)
         *
         * If the first match is in an unsupported scope (e.g. block), the operation fails.
         *
         * Use inline JavaScript for immediate, standard behavior.
         * @mcp Changes a local/closure/catch variable after the handler returns (works on `const` too)
         */
        setVariable(name: string, value: any): void;

        /**
         * Requests continuation into the next function call.
         * If the runtime can correlate the continuation, `onStep`
         * will be invoked later.
         * @mcp Steps into the next function call, then runs onStep
         */
        stepInto(): void;

        /**
         * Requests stepping into the next asynchronous continuation.
         * If the runtime can correlate the continuation, `onStep`
         * will be invoked later.
         * @mcp Steps into the next async continuation, then runs onStep
         */
        stepIntoAsync(): void;

        /**
         * Requests stepping over the current line.
         *
         * If the runtime can correlate the continuation, `onStep`
         * will be invoked later.
         * @mcp Steps over the current statement, then runs onStep
         */
        stepOver(): void;

        /**
         * Requests stepping out of the current function.
         *
         * If the runtime can correlate the continuation, `onStep`
         * will be invoked later.
         * @mcp Steps out of the current function, then runs onStep
         */
        stepOut(): void;
      }

      interface EnterHookContext extends BaseHookContext {
        phase: "enter";

        /**
         * Best-effort list of local arguments at function entry.
         * @mcp Names of the function's arguments
         */
        arguments: string[];
      }

      interface LeaveHookContext extends BaseHookContext {
        phase: "leave";

        /**
         * Current return value metadata.
         * For non-promise values, `value` may be populated.
         * For promises, `isPromise` may be true and `objectId` may be present.
         * @mcp `{ value, type, isPromise, objectId }`: `value` is the return value (not set for promises)
         */
        returnValue: HookReturnValue;

        /**
         * Overrides the return value using a JSON-serializable value.
         */
        return(value: any): void;

        /**
         * Overrides the return value using a raw expression string.
         */
        returnExpr(expression: string): void;

        /**
         * Requests continuation tracking after this leave point.
         * If the runtime can correlate the continuation, `onReturnFollowed`
         * will be invoked later.
         * @mcp After the return, runs onReturnFollowed in the caller (in the async continuation for a returned promise)
         */
        followReturn(): void;
      }

      interface ReturnFollowedHookContext extends BaseHookContext {
        phase: "returnFollowed";
      }

      interface StepFollowedHookContext extends BaseHookContext {
        phase: "stepFollowed";
      }
      interface HitHookContext extends BaseHookContext {
        phase: "hit";
      }

      /**
       * ## Execution model
       *
       * Handlers run against the current call frame and have direct access to the
       * local JavaScript scope, including locals, arguments, and closures.
       *
       * Inline JavaScript executes immediately and follows standard JS semantics.
       *
       * The `ctx` methods, instead, do not execute immediately: they schedule actions
       * that are applied after the handler returns.
       *
       * Key differences:
       * - Use inline JavaScript to read or modify writable bindings immediately.
       * - Use `ctx.setVariable(...)` to modify bindings that cannot be changed via
       *   normal JS semantics (e.g. `const`).
       * - Use `ctx.eval(...)` to evaluate expressions in the frame and access `this`.
       *
       * Scope resolution for `ctx.setVariable` follows the CDP scope chain and only
       * supports `local`, `closure`, and `catch` scopes.
       *
       * @mcp Handlers run in the paused call frame: locals, arguments and closure variables are in scope by name. Inline JavaScript runs immediately; ctx methods are applied after the handler returns.
       */
      interface HookHandlers {
        /**
         * Called at function entry.
         *
         * Runs in the current call frame (local scope access; use `ctx.eval` for `this`).
         * See "Execution model" for full details.
         *
         * Must be declared as an object method, for example:
         * `onEnter(ctx) { ... }`
         * Do not use arrow functions here.
         */
        onEnter?(ctx: EnterHookContext): void;

        /**
         * Called at function leave / return breakpoint.
         *
         * Runs in the current call frame (local scope access; use `ctx.eval` for `this`).
         * See "Execution model" for full details.
         *
         * Must be declared as an object method, for example:
         * `onLeave(ctx) { ... }`
         * Do not use arrow functions here.
         */
        onLeave?(ctx: LeaveHookContext): void;

        /**
         * Called in the caller right after the hooked function returns, when
         * `onLeave` called `ctx.followReturn()`. For a returned promise, it is
         * called in the async continuation.
         *
         * `previousStep` contains data captured from the leave step that requested
         * the follow.
         *
         * Runs in the current call frame (local scope access; use `ctx.eval` for `this`).
         * See "Execution model" for full details.
         *
         * Must be declared as an object method, for example:
         * `onReturnFollowed(ctx, previousStep) { ... }`
         * Do not use arrow functions here.
         * @mcp Runs in the caller right after the return, when onLeave called ctx.followReturn()
         */
        onReturnFollowed?(
          ctx: ReturnFollowedHookContext,
          previousStep: HookPreviousStep
        ): void;

        /**
         * Called at the next paused location after a handler requested a step
         * with `ctx.stepInto()`, `ctx.stepIntoAsync()`, `ctx.stepOver()` or
         * `ctx.stepOut()`. It can request another step.
         *
         * `previousStep` contains data captured from the step that requested it.
         *
         * Runs in the current call frame (local scope access; use `ctx.eval` for `this`).
         * See "Execution model" for full details.
         *
         * Must be declared as an object method, for example:
         * `onStep(ctx, previousStep) { ... }`
         * Do not use arrow functions here.
         * @mcp Runs at the next paused location after ctx.stepInto/stepIntoAsync/stepOver/stepOut()
         */
        onStep?(
          ctx: StepFollowedHookContext,
          previousStep: HookPreviousStep
        ): void;

        /**
         * Location-level hooks (precise instrumentation points)
         *
         * Allows attaching handlers to specific script locations.
        */
        at?: Array<{
          /**
           * Location in the form "line:column"
           * Example: "164894:2"
           */
          location: string;

          /**
           * Called when the breakpoint at this location is hit.
           *
           * Runs in the current call frame (local scope access; use `ctx.eval` for `this`).
           * See "Execution model" for full details.
           *
           * Must be declared as an object method, for example:
           * `onHit(ctx) { ... }`
           * Do not use arrow functions here.
           */
          onHit?(ctx: HitHookContext): void;
        }>;
      }

      /* ------------------------------------------------------------------ */
      /* Results */
      /* ------------------------------------------------------------------ */

      interface BaseHookResult {
        /**
         * Location of the hook that produced this result, as "file:line:col"
         * (for `at` handlers, the location of the `at` entry). Results of
         * followed steps keep the location of the hook that started them.
         */
        location: string;
        messages: any[];
        evalResult?: HookEvalResult;
        error?: string;
        functionSource?: string;
        stackTrace: HookStackFrame[];
      }

      interface EnterHookResult extends BaseHookResult {
        phase: "enter";
      }

      interface LeaveHookResult extends BaseHookResult {
        phase: "leave";
      }

      interface ReturnFollowedHookResult extends BaseHookResult {
        phase: "returnFollowed";
      }

      interface StepFollowedHookResult extends BaseHookResult {
        phase: "stepFollowed";
      }
      interface HitHookResult extends BaseHookResult {
        phase: "hit";
      }

      type HookResult =
        | EnterHookResult
        | LeaveHookResult
        | ReturnFollowedHookResult
        | StepFollowedHookResult
        | HitHookResult;

      interface HookLogger {
        log(message: string): void;
        warn(message: string): void;
        error(message: string): void;
      }

      /**
       * Called after a hook phase has produced a structured result.
       */
      type HookResultHandler = (result: HookResult, logger: HookLogger) => void | Promise<void>;

      /**
       * Utility functions available in Node (Puppeteer) scripts.
       */
      interface UtilsAPI {
        /**
         * Returns the Puppeteer Page object with the given ID.
         */
        getPage(id: number | string): any;

        /**
         * Returns a shared variable by name (same scope as API Collection).
         */
        getVar(name: string): string;

        /**
         * Safely converts any object to JSON, handling circular references.
         */
        safeJsonStringify(obj: any): string;

        /**
         * Iterates over any structure (Object, Array, Map, etc.).
         */
        iterate(obj: any): Iterable<WB.Common.IterateEntry>;

        /**
         * HTTP client utilities.
         */
        httpClient: HttpClient;
      }

      interface MemoryAPI {
        /**
         * Searches live objects in memory using the provided query.
         */
        searchLiveObjects(
          pageId: number | string,
          query: LiveObjectSearchQuery,
        ): Promise<LiveObjectSearchResponse>;

        /**
         * Takes a heap snapshot and runs a search against it using the provided query.
         */
        searchHeapSnapshot(
          pageId: number | string,
          query: HeapSnapshotSearchQuery,
        ): Promise<HeapSnapshotSearchResponse>;
      }

      interface InstrumentationAPI {

        /** @deprecated Use addHook() with the `at` handlers instead.
         * Adds a LiveHook.
         * Does NOT arm breakpoints until startLiveHooks(pageId) is called.
         */
        addLiveHook(def: LiveHookDefinition): void;

        /** @deprecated Use addHook() with the `at` handlers instead.
         * Arms all LiveHooks for the given page.
         */
        startLiveHooks(pageId: number | string): Promise<void>;

        /** @deprecated Use addHook() with the `at` handlers instead.
         * Disarms all LiveHooks.
         */
        stopLiveHooks(pageId: number | string): Promise<void>;

        /**
         * Registers a source-level hook on a function location.
         *
         * The hook is armed when the underlying hooks manager is started.
         *
         * Note:
         * - Handlers must be declared as object methods (`onEnter(ctx) { ... }`),
         *   not anonymous functions or arrow functions.
         * - `line` and `col` are 1-based. Without `col`, the hook targets the
         *   function that starts on `line`.
         */
        addHook(
          location: HookLocation,
          handlers: HookHandlers,
          handleResult?: HookResultHandler
        ): void;

        /**
         * Arms all Hooks for the given page.
         */
        startHooks(pageId: number | string): Promise<void>;

        /**
         * Disarms all Hooks.
         */
        stopHooks(pageId: number | string): Promise<void>;
      }

      interface DebuggerAPI {
        /**
         * Steps into the next function call.
         *
         * If the current line contains a function invocation, execution will pause
         * at the first statement inside that function.
         */
        stepInto(pageId: number | string): Promise<void>;

        /**
         * Steps into the next asynchronous continuation.
         *
         * This is equivalent to CDP `Debugger.stepInto({ breakOnAsyncCall: true })`.
         * If the current execution schedules an async continuation (e.g. via `await`,
         * Promise resolution, or microtasks), the debugger will pause when that
         * continuation is invoked.
         */
        stepIntoAsync(pageId: number | string): Promise<void>;

        /**
         * Steps over the current line.
         *
         * Executes the current statement completely and pauses at the next statement
         * in the same frame.
         *
         * If the line contains function calls, they are executed without pausing
         * inside them.
         */
        stepOver(pageId: number | string): Promise<void>;

        /**
         * Steps out of the current function.
         *
         * Continues execution until the current function returns, then pauses
         * at the caller frame.
         */
        stepOut(pageId: number | string): Promise<void>;
      }

      /**
       * Node utilities entry point.
       */
      const Utils: UtilsAPI;
      /**
       * Node Memory entry point.
      */
      const Memory: MemoryAPI;

      /**
       * Node Instrumentation entry point.
      */
      const Instrumentation: InstrumentationAPI;

      /**
       * Node Debugger entry point.
      */
      const Debugger: DebuggerAPI;
    }
  }
}
