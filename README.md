# Wirebrowser

**Wirebrowser** is a unified debugging and automation suite built on the **Chrome DevTools Protocol (CDP)**.  
Its mission is to merge the power of **Burp Suite**, **Postman**, and **Chrome DevTools** — in one extensible tool.  

It provides a unified interface to inspect, intercept, automate, and test browser and API behaviors,making it an all-in-one companion for developers, testers, and researchers.

---


# Some screenshots
![Wirebrowser Screenshot Interceptor](./docs/screenshots/wirebrowser-interceptor.png)

![Wirebrowser Screenshot Memory](./docs/screenshots/wirebrowser-memory.png)

![Wirebrowser Screenshot API Collection](./docs/screenshots/wirebrowser-api-collection.png)


---

## 🧭 Overview

Wirebrowser is divided into **5 main sections**, each containing specialized tools:

1. **Network** – intercept, block, rewrite, and replay network requests.  
2. **Memory** – inspect memory, capture heap snapshots, and explore runtime objects.  
3. **Automation** – run browser and Node.js scripts manually or automatically.  
4. **API Collection** – create and run API requests with variable support, like Postman.  
5. **Tools** – utility tools such as encoders/decoders and JWT creator/verifier.

---

screenshow here

## Getting Started
### Install

```bash
git clone https://github.com/fcavallarin/wirebrowser.git
cd wirebrowser
npm install
npm build
```

### Run
```bash
npm run wirebrowser
```

## ✨ Features

### 1. Network

#### 🔹 Network Interceptor  
Capture and inspect all network requests in real time.  
- Intercept, **block**, or **rewrite** requests and responses on the fly.  
- Similar to **Burp Suite**, but with full **response modification support**.  
- Ideal for debugging web apps, testing security, or simulating server responses.  

#### 🔹 Network Repeater  
Replay previously captured requests.  
- Functions identically to **Burp’s Repeater**.  
- Supports **variables** (e.g., `{{baseUrl}}`, `{{token}}`).  
- Allows fine-grained editing and re-sending of captured requests.  
- Perfect for API testing and behavioral analysis.

---

### 2. Memory
Search objects in the browser's memory. Results are displayed as JSON within the **Monaco Editor** — with syntax highlighting, folding, and VSCode-like features.

#### 🔹 Memory Heap Snapshot  
- Capture heap snapshots directly via CDP.  
- Search for objects by **key**, **value** with **regular expressions** support.  

#### 🔹 Memory Runtime Objects  
- Search for objects starting from a specified root (e.g. `window` or `window.myObject`).  
- Useful for runtime inspection and reverse-engineering object graphs.

#### 🔹 Memory Class Instances  
- Uses CDP’s **queryObjects** feature to list all objects that share a given prototype.  
- Helps detect memory leaks and analyze object lifecycles.

---

### 3. Automation

Automation enables both **in-browser** and **Node.js** scripting for powerful debugging and dynamic testing.  
Scripts are organized in files and folders.  

#### 🔹 Automation Scripts  
- Run scripts manually or automatically (e.g., *on page creation*, *on page load*, etc.).  
- Access the full browser context (DOM, window, etc.).

#### 🔹 Automation Node Scripts  
- Run scripts in the **Node.js** environment.  
- Gives access to raw **Puppeteer** objects and CDP features.  
- Ideal for advanced automation, data collection, or environment setup.

```js
const userId = Utils.getVar("userId");
const page = Utils.getPage(1);
page.on("request", req => req.continue());
await page.goto(`https://example.com/${userId}`);
```

---

### 4. API Collection

- A complete API testing tool similar to **Postman**.  
- Organize API requests into collections, folders, and files.  
- Supports **variables** (e.g., `{{baseUrl}}`, `{{token}}`).  
- Edit headers, parameters, and payloads with ease.  
- Combine with **Network Repeater** for full control of client-server interactions.

---

### 5. Tools

#### 🔹 Decoder  
- Encode or decode strings in multiple formats:  
  - Base64  
  - URL encode/decode  
  - HTML entities  
  - Base36  

#### 🔹 JWT Tool  
- Create, verify, and decode **JSON Web Tokens (JWTs)**.  
- Displays header, payload, and signature sections clearly.

---

## ▶️ Scope of actions — Global vs Tab-specific

Most Wirebrowser actions can be performed **either globally (across all open tabs/pages)** or **targeted to a single tab**. This lets you choose whether a rule or inspection should affect the whole browser session or only a specific page.  
Every tab/page opened by Wirebrowser has a unique integer `tabId`. Use this `tabId` to scope actions.


**UI Notes**
- Many panels offer a **scope selector** (Global / Specific Tab ID) for quick changes.

---

## ❓ Why Wirebrowser?

While tools like Chrome DevTools, Burp Suite, and Postman are powerful, they are isolated and often lack automation and flexibility.  
**Wirebrowser unifies these workflows** with advanced capabilities:

- ✅ **Rewrite requests and responses** dynamically (DevTools cannot modify responses).  
- ✅ **Search in memory** for objects or values using regex.  
- ✅ **Integrate scripting and automation** natively.  
- ✅ **API testing built-in**, no need for external tools.  
- ✅ **All-in-one environment** for debugging, automation, and inspection.  
- ✅ **Script-friendly architecture**, exposing structured JSON data and CDP hooks.  


With Wirebrowser, developers, testers, and researchers can **observe, manipulate, and automate the web** — all from one powerful interface.

---

## 🛠 Tech Stack

- **Frontend (UI):** [React](https://react.dev/)  
- **Backend:** [Node.js](https://nodejs.org/)  
- **Language:** Plain **JavaScript** (no TypeScript)  

Wirebrowser is built with React and Node.js, using **plain JavaScript** to keep the codebase lightweight and hackable.  
TypeScript or JSDoc-based typing may be introduced in the future for enhanced maintainability.

---

## 🗺 Roadmap

Planned and potential upcoming features for Wirebrowser:

### 🧠 Memory Tools
- Object reference visualization  
- Heap diffing between snapshots  

### 🌐 Network Tools
- Advanced rewrite rules and scripting hooks  
- Export/import of intercepted sessions  


### ⚙️ Collaboration
- Git integration for exporting and versioning projects
- Secrets management
- Integration with external APIs (Slack, Discord, etc.)  

### 🔎 Security & Crawling
- **SPA crawling** — automatic crawling of single-page applications, handling client-side routing and dynamic content.  
- **DOM XSS scanning** — automated scanning for DOM-based cross-site scripting vectors during crawls or on-demand.

### 🧰 Developer Experience
- Optional TypeScript migration  
- Plugin system for custom panels or scripts  
- Improved dark/light themes  

---

## 🤝 Contributing

Contributions and pull requests are welcome!  
Open an issue or pull request — even small suggestions help improve Wirebrowser.

---

## 📜 License

Distributed under the **MIT License**.  
See the [LICENSE](LICENSE) file for more details.
