# Tutorials

This section contains practical, step-by-step guides for using Wirebrowser in real-world scenarios.

Wirebrowser is a runtime instrumentation platform built on the Chrome DevTools Protocol (CDP).

---

## Basics

- **Create Hooks and patch application behavior**  
 [Bypass postMessage checks](https://fcavallarin.github.io/wirebrowser/tutorials/Bypass-postMessage-checks)



## Notes

- Wirebrowser operates at the debugger level (CDP), not at the source level.
- No monkeypatching or source rewriting is required.
- Some behaviors (especially async) follow debugger semantics, not JavaScript semantics.
