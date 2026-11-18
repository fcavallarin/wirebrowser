# Wirebrowser

![Open Source](https://img.shields.io/badge/open%20source-yes-blue)
![Built on CDP](https://img.shields.io/badge/built%20on-CDP-orange)
![License MIT](https://img.shields.io/github/license/fcavallarin/wirebrowser)
![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen)

**Wirebrowser** is a **runtime instrumentation platform for JavaScript the browser**, built on top of the Chrome DevTools Protocol (CDP).

It brings some **Frida-like capabilities** to Chrome — hooking functions, inspecting runtime state, search memory, and modifying behavior without monkeypatching.

Wirebrowser lets you **observe, intercept, and modify execution at runtime**, even inside closures and non-global scopes that are normally unreachable.

It is designed for:
- reverse engineers
- security researchers / bug hunters
- advanced frontend developers

Core capabilities include:
- **Hooks** — inject logic and override behavior at runtime
- **Origin Trace (BDHS)** — automatically trace where a value is created or mutated
- **Live Object Search** — find and patch runtime objects
- **Network interception & replay** — modify inputs and observe effects
- **MCP server** — let AI agents (e.g. Claude Code) use all of the above ([details](#-ai-agents-mcp))

Unlike traditional tools, Wirebrowser focuses on **causality and execution flow**, not just inspection.

## 🔗 Quick Links

- 📘 Documentation → https://fcavallarin.github.io/wirebrowser/api/
- 💻 API Documentation → https://fcavallarin.github.io/wirebrowser/
- ⚙️ CDP as a Runtime Instrumentation Engine Writeup → https://fcavallarin.github.io/wirebrowser/CDP-as-a-Runtime-Instrumentation-Engine
- 🧠 BDHS / Origin Trace Writeup → https://fcavallarin.github.io/wirebrowser/BDHS-Origin-Trace
- ▶️ BDHS YouTube Demo → https://www.youtube.com/watch?v=WA5nHk-6UJc


## 🧭 Overview

Wirebrowser is built around one core idea:

> **Move from inspection → to runtime control**

---

### ⚡ Runtime Instrumentation

Hook functions at runtime using CDP breakpoints — without modifying source code.

- Inject logic during execution
- Override return values
- Observe arguments and behavior
- Instrument code inside closures (not reachable from `window`)

> No monkeypatching. No fragile overrides.

---

### 🧠 Memory & Causality Analysis

Understand not just *what exists*, but **where it comes from**.

- **Origin Trace (BDHS)** — identify the exact function responsible for creating or mutating a value ([writeup](https://fcavallarin.github.io/wirebrowser/BDHS-Origin-Trace))
- **Live Object Search** — find and patch runtime objects
- **Heap Snapshot Search** — search full V8 memory (including unreachable values)

This bridges the **causality gap** in traditional debugging.

---

### 🌐 Network → Runtime Bridge

Intercept and modify inputs, then observe their effects in runtime:

- Rewrite HTTP responses
- Replay requests
- Correlate network data with runtime objects


---

## 🧠 Key Idea

Traditional tools answer:

> “What is happening?”

Wirebrowser answers:

> **“Where did this come from, and how can I change it?”**


## 🌟 Feature Highlights

Below is a quick visual tour of Wirebrowser’s most distinctive capabilities.


A short walkthrough of Wirebrowser’s advanced memory-analysis capabilities:
- **Live Object Search** — real-time search and runtime patching of live JS objects.
- **Origin Trace (BDHS)** — identify the user-land function responsible for creating or mutating the object during debugging.
- **Live Hooks** — hook the target function at runtime and override its return value or inject code.

---

### **Hooks -  Runtime Instrumentation**
Hook functions at runtime using CDP breakpoints — without modifying source code.

- Inject custom logic during execution
- Override return values
- Inspect arguments and behavior
- Works even inside closures (not reachable from `window`)

![Hooks](./docs/screenshots/wirebrowser-hooks.png)

---

### **Memory — Origin Trace (BDHS)**
Automatically identify the function responsible for creating or mutating a value.

- Snapshot taken at each debugger pause
- Each snapshot is searched
- Framework/vendor code filtered via heuristics
- Includes tolerance window for contextual analysis

![Origin Trace](./docs/screenshots/wirebrowser-memory-origin-trace.png)

---

### **Memory — Live Object Search**
Search and **patch** live JS objects using regex or structural matching.

![Live Objects](./docs/screenshots/wirebrowser-memory-live.png)


---

### **Network Interceptor**
Intercept, rewrite, block, and replay HTTP requests and responses.

![Network Interceptor](./docs/screenshots/wirebrowser-interceptor.png)


## Getting Started
### 🚀 Desktop Builds (Recommended)
Pre-built desktop applications are available for:

- macOS (.dmg)
- Windows (.exe)
- Linux (.AppImage)

You can download the latest builds from the GitHub Releases page:  

👉 [https://github.com/fcavallarin/wirebrowser/releases](https://github.com/fcavallarin/wirebrowser/releases)  


### 🛠 Build from Source
If you prefer to run Wirebrowser from source:

```bash
git clone https://github.com/fcavallarin/wirebrowser.git
cd wirebrowser
npm install
npm run build
```

### Run
```bash
npm run wirebrowser
```

### 🐧 Linux Notes 

#### Sandbox issue with Electron
On some Linux distributions, Electron may fail to start due to process sandboxing restrictions, showing errors such as:

```
The SUID sandbox helper binary was found, but is not configured correctly.
```

This is a known issue in Electron ([https://github.com/electron/electron/issues/42510]).  
The most common solution is to disable AppArmor restrictions:

```
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
```

#### Chrome extension location
When running Wirebrowser on Linux via the AppImage, Chromium security policies require unpacked extensions to be stored in a visible (non-hidden) directory.

For this reason, the Wirebrowser Chrome extension is installed in: 

`~/wirebrowser/chrome-extension`  

This behavior is intentional and required for Chromium to load the extension correctly.

⚠️ Do not move, rename, or hide this directory, otherwise the extension will fail to load.

## 🤖 AI Agents (MCP)

Wirebrowser includes an [MCP](https://modelcontextprotocol.io) server, so AI coding agents such as Claude Code can use its runtime instrumentation directly: search the loaded sources, hook functions, read and change values at runtime, inspect live objects, trace where a value is created and see which code sends each HTTP request.

### Enable the server
1. Open **Settings → Application → MCP server**
2. Enable the server: a token is generated, and a ready-to-copy command is shown
3. Click **Save** to start the server

To connect Claude Code, run the command shown in the settings:

```bash
claude mcp add --transport http wirebrowser http://127.0.0.1:7655/mcp --header "Authorization: Bearer <token>"
```

### Tools

| Tool | What it does |
|---|---|
| `list_pages`, `navigate` | List the open pages, load a URL |
| `search_sources` | Search the JavaScript loaded by the page (files, inline scripts, eval'd code) |
| `get_source_window` | Read the source around a location |
| `run_with_hooks` | Hook functions, run a trigger (click / JS expression), collect arguments, locals and return values; handlers can override return values and variables, follow a return into the caller and step through the code |
| `save_hooks_script` | Save verified hooks as a Node Script (Automation → Node Scripts) to re-run, edit and keep them |
| `evaluate` | Evaluate a JavaScript expression in the page |
| `search_live_objects` | Search live objects by property, value or class name |
| `origin_trace` | Find the function that creates a value (BDHS) |
| `list_requests`, `get_request` | List the HTTP requests of the pages and read headers, bodies and the initiator (the JavaScript that sent each request, as `url:line:col`) |

Locations (`line`, `col`) are 1-based and document-relative everywhere, so the output of `search_sources` can be passed as-is to `run_with_hooks`.

### Security
The tools can run JavaScript in your pages and read their memory. The server:
- is **disabled by default**
- listens on `127.0.0.1` only
- requires the bearer token
- rejects requests with a foreign `Host` or `Origin` header (DNS rebinding, requests from web pages)

Keep it disabled when you don't need it, and regenerate the token if it leaks.

## ▶️ Scope of actions — Global vs Tab-specific

Most Wirebrowser actions can be performed **either globally (across all open tabs/pages)** or **targeted to a single tab**. This lets you choose whether a rule or inspection should affect the whole browser session or only a specific page.  
Every tab/page opened by Wirebrowser has a unique integer `tabId`. Use this `tabId` to scope actions.


**UI Notes**
- Many panels offer a **scope selector** (Global / Specific Tab ID) for quick changes.



## 🤝 Contributing

Contributions and pull requests are welcome!  
Open an issue or pull request — even small suggestions help improve Wirebrowser.

The hook API (handlers, `ctx` members per phase, `previousStep`) is defined once, in
[`src/gui/monaco/typings/pptr-scripts.d.ts`](src/gui/monaco/typings/pptr-scripts.d.ts).
The MCP tools, the Node Script generator and `addHook` validation read it from
`src/app/modules/debugger/hook-spec.generated.js`: after changing the typings, run
`npm run gen:hook-spec` (`npm test` fails while the spec is stale). The `@mcp` JSDoc tag
sets the short text used in the MCP tool descriptions.


## 📜 License

Wirebrowser™ is distributed under the **MIT License**.  
See the [LICENSE](LICENSE) file for more details.
