# Bypassing postMessage origin checks with Wirebrowser (without modifying the source)

A common client-side security scenario is finding a `postMessage` handler but not being able to reach the interesting code path because of origin checks.

This guide shows how to bypass those checks at runtime using Wirebrowser.

## Goal

Make the handler continue past its checks so we can observe or test the logic behind them.

---

## Step 1: Find the target location

Before adding a hook, you need the location of the code you want to instrument.

The easiest way is to use the **Sources** panel in Wirebrowser:

1. Open the page in Wirebrowser  
2. Go to **Sources**  
3. Find the script containing the `postMessage` handler  
4. Locate the function or line you want to instrument and place the cursor there  
5. From the **Instrumentation** menu select **Create Hook at Cursor Position**


This will generate a hook template that you can edit to inject your logic.

## Step 2: Where hooks live and how to run them

Hooks are defined inside **Node Scripts**, available in the **Automation** tab.

You can create them in two ways:

- manually, by creating a new script in **Automation → Node Scripts**
- from the **Sources → Instrumentation** menu (which generates a script automatically)

Once created, a hook is just part of a Node Script.

Hooks are activated by:

```js
await WB.Node.Instrumentation.startHooks(pageId);
```


### Running hooks

To activate your hooks:

1. Go to **Automation → Node Scripts**
2. Open your script
3. Click **Execute**

This will register all hooks defined in the script.

> A single script can contain multiple hooks.

You can re-run the script anytime to re-register hooks or update their behavior.

## Step 3: Stopping hooks

Hooks remain active until you explicitly stop them.

There are two ways to stop all active hooks:


### Option 1: Stop hooks from the UI

In the top-right corner, there is a small bug icon 🐞.

* it turns green when the debugger is active
* each tab has its own debugger instance

Clicking the icon allows you to stop the debugger.  
When the debugger is stopped, all hooks are disarmed.

### Option 2: Stop hooks programmatically

You can stop all hooks by running a script:

```js
await WB.Node.Instrumentation.stopHooks()
```

This will remove all active hooks across all sessions.


---


## Technique 1: Rebind the `event` parameter

```js
window.addEventListener("message", function (event) {
  if (event.origin !== "https://target.example") return;
  handleMessage(event.data);
});
```

### Hook

```js
WB.Node.Instrumentation.addHook({ file: "https://example.com/js/index.js", line: 16, col: 2 }, {
  onEnter(ctx) {
    event = {
      ...event,
      origin: "https://attacker.example"
    }
  }
});
```

This works because you replace the local `event` binding in the current frame.

### Result

The handler now sees your modified origin and continues execution past the check.

---

## Technique 2: Patch `allowedOrigin`

```js
window.addEventListener("message", function (event) {
  const allowedOrigin = "https://target.example";
  if (event.origin !== allowedOrigin) return;
  handleMessage(event.data);
});
```

### Hook

```js
WB.Node.Instrumentation.addHook({ file: "https://example.com/js/index.js", line: 16, col: 2 }, {
  onEnter(ctx) {
    allowedOrigin = "https://attacker.example"
  }
});
```

This works without touching the `event` object at all.

---

## Technique 3: Patch allowlist

```js
const allowedOrigins = ["https://origin1.example", "https://origin2.example"];

if (!allowedOrigins.includes(event.origin)) return;
```

### Hook

```js
WB.Node.Instrumentation.addHook({ file: "https://example.com/js/index.js", line: 16, col: 2 }, {
  onEnter(ctx) {
    allowedOrigins.push("https://attacker.example");
  }
});
```

---

## Technique 4: Hook helper function

```js
if (!isAllowedOrigin(event.origin)) return;
```

### Hook

Here we can place the hook inside `isAllowedOrigin` and override its return value.

```js
WB.Node.Instrumentation.addHook({ file: "https://example.com/js/index.js", line: 2, col: 2 }, {
  onLeave(ctx) {
    ctx.return(true);
  }
});
```

This overrides the decision directly.  
This is often the cleanest approach when the check is encapsulated in a helper.

---

## Technique 5: Patch at a precise location

In some cases, patching values at function entry is not enough.

For example:

```js
function onMessage(event) {
  const parsed = JSON.parse(event.data);
  const origin = event.origin;

  if (origin !== allowedOrigin) return;

  handleMessage(parsed);
}
```

Here, `origin` is computed inside the function. While rebinding event at entry may still work, sometimes you want to patch the value exactly where it is used.


### Hook at a specific location

```js
WB.Node.Instrumentation.addHook({ file: "https://example.com/js/index.js", line: 2, col: 2 }, {
  at: [
    {
      location: "4:2",  // line:col
      onHit(ctx){
        origin = allowedOrigin
      }
    }
  ]
});
```
This allows you to modify local variables or state at a precise execution point, rather than only at function boundaries.

### When to use this

Use `at` when:

* the value you want to patch is created inside the function
* you want to observe or modify intermediate state
* function-level hooks (onEnter) are too early or too broad


---

## Notes

- Run hooks at function entry to ensure values are patched before checks execute
- Ensure your fake `event` includes the fields the handler actually uses (`data`, `source`, etc.)
- Prefer patching application logic over browser-native objects when possible

---

## Summary

- Rebind `event` to control handler input
- Patch variables and allowlists used in checks
- Override helper return values when logic is encapsulated

The key idea: you don’t need to modify the browser event — you only need to control what the handler reads.