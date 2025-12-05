---
layout: default
title: Wirebrowser Documentation
---

# Wirebrowser Documentation

Welcome to the documentation area for the Wirebrowser project.  
This section contains technical deep-dives and implementation notes for the core debugging and memory-analysis techniques.

---

## 🔍 Breakpoint-Driven Heap Search (BDHS)

**BDHS** is a temporal heap-analysis technique that performs step-out–based debugger pauses, captures a full heap snapshot at each stop, and searches each snapshot to identify where a value first appears or mutates inside modern, framework-heavy SPAs.

👉 **Read the full technical writeup:**  
[Tracing JavaScript Value Origins with Breakpoint-Driven Heap Search (BDHS)](./BDHS-Origin-Trace)

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
