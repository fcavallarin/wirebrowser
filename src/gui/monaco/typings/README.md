# Wirebrowser Documentation

Wirebrowser is a runtime instrumentation platform built on top of the Chrome DevTools Protocol (CDP).

It provides a unified API to:

- instrument JavaScript execution (hooks)
- inspect and search runtime memory
- automate browser behavior

---

## 🔥 What you can do

- Force any feature flag → `ctx.return(true)`
- Modify internal variables → `ctx.setVariable(...)`
- Track async flows → `ctx.followReturn()`
- Condtional stepping → `if(condition) ctx.stepOut()`
- Search secrets in memory → `searchHeapSnapshot()`

---

## 📦 Modules Overview

Wirebrowser is composed of multiple subsystems:

### Runtime Instrumentation
Hook and modify JavaScript execution at runtime.

- [WB.Node.Instrumentation](interfaces/WB.Node.InstrumentationAPI.html)

---

### Memory Inspection
Search and analyze JavaScript objects in memory.

- [WB.Node.Memory](interfaces/WB.Node.MemoryAPI.html)

---


## ⚡ Quick Examples

### Hook a function

```js
WB.Node.Instrumentation.addHook({file: 'auth.js', line: 10, col: 20}, {
  onEnter(ctx){
    ctx.log(ctx.stackTrace)
  },
  onLeave(ctx) {
    ctx.return(true)
  }
});
await WB.Node.Instrumentation.startHooks(pageId);
```



### Find objects in heap snapshot

```js
const results = await WB.Node.Memory.searchHeapSnapshot(pageId, {
  valueSearch: [".*accessToken.*", { useRegexp: true }]
})
```

---

## 🧠 Instrumentation Examples

### Follow return value to its consumer (best-effort async tracking)

```js
WB.Node.Instrumentation.addHook({file: 'auth.js', line: 10, col: 20}, {
  onLeave(ctx){
    ctx.followReturn()
  },
  onReturnFollowed(ctx, previousStep){
    // override internal state
    ctx.setVariable("price", 0)
  }
});
await WB.Node.Instrumentation.startHooks(pageId);
```


---

### Override return value (sync only)

```js
WB.Node.Instrumentation.addHook({file: 'auth.js', line: 10, col: 20}, {
  onLeave(ctx){
    ctx.return("admin")
  },
});
await WB.Node.Instrumentation.startHooks(pageId);
```

---

### Conditional stepping

```js
WB.Node.Instrumentation.addHook({file: 'auth.js', line: 10, col: 20}, {
  onEnter(ctx){
    if ( ctx.arguments.user !== "admin"){
      ctx.stepIntoAsync()
    }
  },
  onStep(ctx, previousStep){
    if ( ctx.arguments.user !== "admin"){
      ctx.stepIntoAsync()
    } else {
      ctx.log(previousStep.stackTrace)
    }
  }
});
await WB.Node.Instrumentation.startHooks(pageId);
```

---


### Combine with Memory search

```js
WB.Node.Instrumentation.addHook({file: 'auth.js', line: 10, col: 20}, {
    onLeave(ctx){
      ctx.send({isAdmin: ctx.returnValue === 'admin' || ctx.variables.isAdmin})
    }
  },
  async (result, logger) => {
    if(result.messages?.[0]?.isAdmin){
      const results = await WB.Node.Memory.searchHeapSnapshot(pageId, {
        valueSearch: [".*accessToken.*", {useRegexp: true}]
      })
      logger.log(result)
  }
);
await WB.Node.Instrumentation.startHooks(pageId);
```

---

### Override variable

```js
WB.Node.Instrumentation.addHook({file: 'auth.js', line: 10, col: 20}, {
  onEnter(ctx){
    if(ctx.variables.isAdmin){
      ctx.setVariable("isAdmin", true)
    }
  }
});
await WB.Node.Instrumentation.startHooks(pageId);
```

---

## 🔍 Memory Examples

---

### Search objects in memory

```js
const results = await WB.Node.Memory.searchLiveObjects(pageId, {
  valueSearch: 'authkey'
})
```

---

## ⚠️ Limitations

### Async instrumentation

- `ctx.return()` is reliable only for synchronous functions
- async functions with `await` may ignore overridden values

(CDP / V8 limitation)

---

### Event correlation

- hook events are independent
- async flows may not correlate reliably

---


## 🎯 Mental Model

Wirebrowser is not just a debugger.

It is a runtime instrumentation layer that allows you to:

- observe execution
- search memory
- modify behavior

