---
layout: default
title: Wirebrowser Documentation
---

# Wirebrowser Documentation

Welcome to the documentation area for the Wirebrowser project.  
This section contains technical deep-dives and implementation notes for the core debugging and memory-analysis techniques.

This documentation covers two complementary approaches to JavaScript reverse engineering:

- **BDHS** — to identify where a value is created (origin tracing)  
- **CDP Instrumentation** — to follow how that value propagates at runtime 

---

## 🔍 Breakpoint-Driven Heap Search (BDHS)

**BDHS** is a temporal heap-analysis technique that performs step-out–based debugger pauses, captures a full heap snapshot at each stop, and searches each snapshot to identify where a value first appears or mutates inside modern, framework-heavy SPAs.

👉 **Read the full technical writeup:**  
[Tracing JavaScript Value Origins with Breakpoint-Driven Heap Search (BDHS)](./BDHS-Origin-Trace)

---

## ⚙️ CDP as a Runtime Instrumentation Engine

This writeup explores how the Chrome DevTools Protocol can be used as a programmable runtime instrumentation engine — enabling function hooks, conditional stepping, and traversal of async execution flows without modifying the target application.

👉 **Read the full technical writeup:**  
[CDP as a Runtime Instrumentation Engine - Hooks, Stepping, and Following Async Execution](./CDP-as-a-Runtime-Instrumentation-Engine)

---

## ▶️ Automation Scripts API Reference

The full API reference generated from the Wirebrowser type definitions is available here:

👉 **[Wirebrowser API Reference](./api/)**

---

## 🧠 Tutorials

Step-by-step tutorials covering real-world runtime instrumentation workflows.

👉 **[Wirebrowser Tutorials](./tutorials/)**



---

## 📘 Additional Documentation

More technical documents will be added here over time, including:

- Live Object Search internals  
- Structural Similarity Engine  
- Network–Memory correlation workflows  
- Architecture notes and reverse-engineering utilities  

---

## 🛠 Project Repository

For source code and installation instructions:  
➡️ https://github.com/fcavallarin/wirebrowser
