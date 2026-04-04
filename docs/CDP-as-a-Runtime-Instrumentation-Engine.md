# CDP as a Runtime Instrumentation Engine
### Hooks, Stepping, and Following Async Execution


This is not a wrapper around DevTools.

It is a different execution model built on top of the same primitives.

> **No monkeypatching. No proxies. No rewriting application code.**
> Only debugger-level control over execution.

---

Modern web applications have become difficult to reason about at runtime.

When reverse engineering such applications — whether for security research, pentesting, or debugging — the main questions usually are:

- Where does this value come from?  
- How can I find and patch a live object in memory?
- Where does this value go next?  
- How can I hook a function without modifying the runtime?

The first problem can be addressed with techniques like Breakpoint-Driven Heap Search (BDHS), which focuses on identifying where a value is created.
The second problem can be solved with the `Runtime.queryObject` + `Runtime.callFunctionOn` primitives of CDP.

Both techniques are analysed in detail in a previous writeup:

→ [https://fcavallarin.github.io/wirebrowser/BDHS-Origin-Trace](https://fcavallarin.github.io/wirebrowser/BDHS-Origin-Trace)

That article focuses on:

- identifying where a value is created (Origin Trace / BDHS)  
- locating live objects in memory (Runtime.queryObject) and patch them (Runtime.callFunctionOn)

In this article, we focus on the next steps:

> **Where does this value go next?**

> **How to hook a function without monkeypatching**

---

# The Problem with Traditional Debugging

Most debuggers follow a human-driven model:

```
breakpoint
↓
program pauses
↓
developer inspects state
↓
step / continue
```

This works, but it is slow, manual, and does not scale.

Modern JavaScript applications often involve:

- asynchronous flows (`await`, Promises)  
- deeply nested callbacks  
- dynamic object construction  
- obfuscated or minified code  
- frameworks generating large amounts of boilerplate  

A typical workflow becomes:

- set a breakpoint  
- step manually  
- try to understand propagation  
- repeat  


> **There is a gap between the mental model of execution and what debuggers actually expose.**

Debuggers show state. They do not show causality.

Imagine if you can follow the same model but with automation:

```
Identify a function
↓
Hook the entry point and the return points
↓
Inspect and modify variables
↓
Apply conditional stepping (`if var1==true then stepOut()`)
↓
Follow the execution after a return point (even in async)
↓
Search the live memory for a specific object
↓
Repeat
```

This would turn the debugging into a programmable engine to instrument/observe/modify the execution flow.

---

# Hooks Alone Are Not Enough

Hooking improves observability and patchability, but limited to the current function.

Consider this:

```js
hook(target, {
  onEnter(args) {},
  onLeave(retval) {}
})
```

This gives visibility into inputs and outputs, but still leaves a critical gap:

> **Who consumes the result next?**

Answering this usually requires:

- inspecting the call stack  
- identifying potential callers  
- adding more hooks  
- repeating  

This remains a manual process.

What we actually want is something closer to **flow navigation**.

---

# Why Hooking Fails in Modern JavaScript

Hooking works well in linear, synchronous code.

Modern JavaScript is neither.

Consider:

- async/await splitting execution into multiple microtasks  
- Promise chains that decouple producer and consumer  
- frameworks introducing indirection layers  
- closures hiding execution context  

As a result:

> **The consumer of a value is often not in the same call stack.**

This breaks the traditional hook model.

Even with perfect hooks, you still need to manually reconstruct:

- where execution resumes  
- which branch is taken  
- which function consumes the result  

This is where traditional hooking reaches its limit.

---

# The Async Return Value Problem

Before describing the implementation, it is worth addressing a fundamental constraint that shaped the design.  

CDP exposes `Debugger.setReturnValue`, an experimental primitive that overrides the return value of a function. It can only be called when execution is paused at a return point — not at arbitrary breakpoints.  

In synchronous code, this works as expected. The caller consumes the return value directly from the active call frame, so overriding it there is sufficient.  

In async functions that cross an `await` boundary, the situation is different. The frame paused at the return site belongs to a resumed continuation, while the consumer observes the final resolution of the function's Promise. Modifying the visible return value in the current frame does not necessarily modify the value ultimately observed by the consumer.  

Critically, `Debugger.setReturnValue` does not fail in this case. The modification is applied — it simply does not propagate to where it needs to go. There is no error, no warning. The value appears changed at the return site and has no effect downstream.

> For async functions, you cannot reliably patch a value at the producer. You have to reach the consumer.

This constraint directly motivated the design of `followReturn`. Rather than intercepting the return value, the approach is to follow the async continuation into the consumer's execution frame, where the value is already a live variable in scope. Patching happens there instead.


```js
// Patching at the producer — silently ineffective for async:
onLeave(ctx) {
  ctx.return(modifiedValue)  // applied but does not reach the consumer
}

// followReturn reaches the consumer instead:
onLeave(ctx) {
  ctx.followReturn()
}
onReturnFollowed(ctx) {
  ctx.setVariable("token", modifiedValue)  // value is live here
}
```

This reframes the limitation as a design constraint: rather than fighting the runtime, the model works with it.

---

# A Different Model: Event-Driven Debugging

Instead of treating debugging as a manual process, we can model it as a stream of runtime events:

```
runtime event
↓
user handler
↓
debugger action
```

Events include:

- function entry  
- function return  
- step information  
- async continuation  

Each event triggers a handler that can:

- inspect runtime state  
- emit messages  
- modify execution  
- request further debugger actions  

This turns the debugger into a **programmable execution engine**.

---

# Hooks on Top of the Chrome DevTools Protocol

Modern browsers expose a powerful debugging interface via the Chrome DevTools Protocol (CDP), including:

- breakpoints  
- runtime evaluation  
- async stepping  
- stack inspection  
- heap snapshots  

Using these primitives, it is possible to build a hook system directly on top of the debugger.

Importantly:

> **This approach does not rely on monkeypatching or modifying JavaScript objects.  
> It operates entirely through debugger primitives.**

Internally, this is implemented using:

- `Debugger.setBreakpoint` on function entry
- `Debugger.setBreakpoint` on return locations
- `Debugger.pause` + `Debugger.evaluateOnCallFrame`
- `Debugger.resume` / stepping primitives

No JavaScript objects are modified at runtime.

Example:

```js
wb.hook("app.js:120:5", {
  onEnter(ctx) {
    ctx.log(ctx.arguments);
  },

  onLeave(ctx) {
    ctx.log(ctx.returnValue);
  }
});
```

Each hook is implemented using breakpoints at:

- function entry  
- return points  

When triggered, the handler runs inside the paused execution frame.

---

# Context Design

Each handler receives a context (`ctx`) describing the runtime state:

```js
ctx = {
  phase,
  stackTrace,
  variables,
  functionSource,
  returnValue
}
```

Handlers can:

- emit messages → `ctx.send(...)`  
- modify variables → `ctx.setVariable(...)`  
- override return values → `ctx.return(...)`  
- evaluate expressions → `ctx.eval(...)`  
- request continuation → `ctx.step*() or ctx.followReturn()`

It is worth noting that `ctx.eval()` executes code directly in the paused call frame of the target function, not inside an injected wrapper function.  
This allows evaluating expressions against the real runtime scope.

---

# Stepping as a Programmable Primitive

Instead of manually pressing “Step Into” in DevTools, stepping becomes part of the API:

```js
ctx.stepInto()
ctx.stepOver()
ctx.stepOut()
ctx.stepIntoAsync()
```

A new handler is introduced:

```js
onStep(ctx, previousStep)
```

This is invoked after a step completes.

Crucially:

> **Stepping is no longer a UI action — it becomes a programmable loop.**

Example:

```js
onStep(ctx, prev) {
  if (ctx.variables.x > 10) return;
  ctx.stepInto();
}
```

This effectively turns the debugger into a scriptable execution engine.

Notably, Chrome DevTools does not expose `stepIntoAsync` in its UI.

This capability exists in CDP but is not directly available to users.

This model exposes it as a first-class primitive.

---

# Following Execution Flows

A specialized primitive builds on top of stepping:

```js
ctx.followReturn()
```

This requests:

- continue execution after return  
- attempt to step into the next consumer  
- trigger a new handler  

Conceptually:

```
producer
↓
return
↓
follow
↓
consumer
```

> **followReturn is not a debugger primitive.**
> It is a higher-level construct built on top of stepping + continuation matching.

It attempts to answer:

> “Given this value, where is it used next?”

in a way that traditional debuggers cannot express directly.

---


# Example: Tracing and patching an async Authentication Flow

```js
async function authenticate(user, pass) {
  const token = await api.login(user, pass)
  const session = {
    token,
    isAdmin: utils.isAdmin(token)
  }
  saveSession(session)
}
```

Hook:

```js
wb.hook("api.js:40:5", {  // api.login location
  onLeave(ctx) {
    ctx.followReturn()
  },
  onReturnFollowed(ctx, previousStep){  // Here we are inside `authenticate` (line 1)
    ctx.log(ctx.variables.token)
  }
})
```

Execution:

```
api.login()
↓
returns token
↓
followReturn
↓
stepInto async continuation
↓
token is a live variable
```

This transforms debugging into **flow traversal**.

## Patch the session:

We can hook the `authenticate` method directly:

```js
wb.hook("main.js:102:32", { // `authenticate` location
  onLeave(ctx) {
    ctx.eval(`token.isAdmin=true`)
  }
})
```


---

# How Continuation Tracking Works

Tracking the “next consumer” of a value is not directly supported by the runtime.

Continuation matching is therefore heuristic-based.  

## Async continuation tracking heuristics

`followReturn` relies on associating a step event back to its originating hook across an async boundary. The runtime does not provide this association directly — there is no CDP primitive that says "this pause is the continuation of that previous pause". There is no stable identifier for an async invocation exposed by the debugger (e.g. no call correlation ID).  

The matching is therefore score-based, combining two signals.  

**Structural similarity**. At every pause, the current stack trace is recorded and converted into a sequence of _trails_ — one per frame, each expressed as `file:line:col`. To find the most likely continuation of a previous hook, the current trail sequence is compared against all previously recorded trail sequences. The score is the length of the longest common consecutive sequence between the two sequences. A longer shared sequence means the two pauses share more execution history, making it more likely they belong to the same logical flow.  

Example:

Previous pause:  
`[ app.js:10:5 → auth.js:42:3 → api.js:88:10 ]`

Current pause:  
`[ app.js:10:5 → auth.js:42:3 → session.js:12:2 ]`

Common consecutive sequence:  
`[ app.js:10:5 → auth.js:42:3 ]`

**Temporal proximity**. Each pause is also assigned a step counter. Candidates with a smaller step distance receive a higher score. A continuation that arrived recently is more likely to be the correct one than one from much earlier in execution.  

The two scores are combined, and the highest-scoring candidate is selected as the continuation.  

This works well in practice for typical async flows. In heavily concurrent code with many interleaved async operations, the matching can become ambiguous — multiple candidates may share similar stack structure and arrive close together in time. In those cases the heuristic is best-effort.  

This ambiguity is intrinsic to the runtime, not to the approach. Without explicit async call correlation exposed by the debugger, no tool operating at this level can resolve it deterministically.  
This is a fundamental limitation of debugger-level observability, not a limitation of this model.

---

# Runtime Reality and Limitations

This approach is built on top of debugger primitives and inherits their constraints.

The async return value problem and continuation tracking heuristics are discussed in detail in the sections above. One further observation worth noting:

> The debugger follows actual runtime execution — microtasks, scheduler, continuations — not the logical flow the developer expects.

This occasionally means that stepping and hook events fire in an order that feels surprising. The model is accurate. The intuition needs adjusting.

---

# Performance vs Observability

This model intentionally trades runtime performance for observability.

The goal is not to minimize overhead, but to maximize visibility into execution.

For reverse engineering workflows, this trade-off is often acceptable.

---


# Combining Runtime Domains

The approach becomes especially powerful when combined with:

- network interception  
- runtime hooks  
- memory inspection  

Example workflow:

```
network response
↓
identify entry point
↓
hook function
↓
follow execution
↓
inspect objects
↓
patch logic
```

This enables end-to-end reverse engineering workflows inside the browser.

---

# What This Enables

This model enables workflows that are impractical with traditional debugging:

- automatic flow traversal across async boundaries  
- conditional execution steering  
- dynamic patching of runtime logic  
- correlation between network → runtime → memory  

> **You stop navigating code. You start navigating execution.**

---

# Conclusion

Traditional debugging is manual.

Hooking improves visibility.

Event-driven debugging combines both:

```
runtime event
↓
handler
↓
debugger control
```

This turns the debugger into a **programmable execution engine**.

Instead of manually stepping through thousands of lines of code, it becomes possible to:

> **follow execution flows directly.**

---

If this direction sounds interesting, this model is implemented in [**Wirebrowser**](https://github.com/fcavallarin/wirebrowser).  
Hooks API are detailed here: [https://fcavallarin.github.io/wirebrowser/api/](https://fcavallarin.github.io/wirebrowser/api/)
