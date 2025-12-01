class Debugger {
  constructor(page, client, pageId) {
    this.page = page;
    this.client = client;
    this.pageId = pageId;
    this.isEnabled = false;
    this.events = {};
    this.parsedScripts = new Map();
  }

  on = (evName, handler) => {
    if (this.isEnabled) {
      throw new Error("Cannot add event handlers while debugger is active");
    }
    this.events[evName] = handler;
  }

  enable = async () => {
    if (this.isEnabled) {
      return;
    }
    this.isEnabled = true;

    const {
      paused: onPaused,
      resumed: onResumed
    } = this.events;

    if (onPaused) {
      await this.client.on("Debugger.paused", async (event) => {
        await onPaused(event);
      });
    }

    if (onResumed) {
      await this.client.on("Debugger.resumed", onResumed);
    }

    await this.attachFrameworkBlackboxer(this.onScriptParsed, { debugLog: true });
    await this.client.send("Debugger.enable");
  }

  onScriptParsed = (event) => {
    this.parsedScripts.set(event.scriptId, event);
    if (this.events.scriptParsed) {
      this.events.scriptParsed(event);
    }
  }

  getParsedScripts = () => {
    return [...this.parsedScripts.values()];
  }

  getScriptUrl = (scriptId) => {
    return this.parsedScripts.get(scriptId).url;
  };

  resume = async () => {
    await this.client.send("Debugger.resume");
  };

  disable = async () => {
    // await this.resume();
    this.client.removeAllListeners("Debugger.paused");
    this.client.removeAllListeners("Debugger.scriptParsed");
    this.client.removeAllListeners("Debugger.resumed");
    await this.client.send("Debugger.disable");
    this.isEnabled = false;
  };


  pause = async () => {
    await this.enable();
    await this.client.send("Debugger.pause");
  };


  stepInto = async () => {
    await this.client.send("Debugger.stepInto");
  };


  stepOver = async () => {
    await this.client.send("Debugger.stepOver");
  };

  stepOut = async () => {
    await this.client.send("Debugger.stepOut");
  };

  setBreakpoint = async (scriptId, lineNumber, columnNumber, condition) => {
    const { breakpointId } = await this.client.send("Debugger.setBreakpoint", {
      location: {
        scriptId,
        lineNumber,
        columnNumber
      },
      condition
    });
    return breakpointId;
  };

  setBreakpointByUrl = async (url, lineNumber, columnNumber) => {
    const { breakpointId }  = await this.client.send("Debugger.setBreakpointByUrl", {
      url, lineNumber, columnNumber
    });
    return breakpointId;
  }

  setBreakpointOnFunctionCall = async (objectId) => {
    const { breakpointId } = await this.client.send("Debugger.setBreakpointOnFunctionCall", {
      objectId
    });
    return breakpointId;
  };

  removeBreakpoint = async (breakpointId) => {
    await this.client.send("Debugger.removeBreakpoint", {
      breakpointId
    });
  }


  getPossibleBreakpoints = async (scriptId) => {
    const l = await this.client.send("Debugger.getPossibleBreakpoints", {
      start: {
        scriptId,
        lineNumber: 0,
        columnNumber: 0
      },
      end: {
        scriptId,
        lineNumber: 99999,
        columnNumber: 99999
      },
      restrictToFunction: false
    });
    // console.log(l)
    return l?.locations;
  }

  setBreakpointOnFirstInstruction = async (scriptId) => {
    const instructions = await this.getPossibleBreakpoints(scriptId);
    if (instructions.length === 0) {
      throw new Error("No instructions found");
    }
    this.setBreakpoint(scriptId, instructions[0].lineNumber, instructions[0].columnNumber);
  }

  setDOMClickBreakpoint = async (enabled) => {
    await this.enable();
    await this.client.send(`DOMDebugger.${enabled ? "set" : "remove"}EventListenerBreakpoint`, {
      eventName: "click",
      targetName: "*"
    });

  };

  getScriptSource = async (scriptId) => {
    const { scriptSource } = await this.client.send("Debugger.getScriptSource", {
      scriptId
    });
    return scriptSource;
  };

  evaluateOnCallFrame = async (frameId, expression) => {
    const res = await this.client.send("Debugger.evaluateOnCallFrame", {
      callFrameId: frameId,
      expression,
      returnByValue: false
    });
    return res?.result;
  }



  attachFrameworkBlackboxer = async (onScriptParsed = null, options = {}) => {
    const client = this.client;
    const DEFAULT_VENDOR_PATTERNS = [
      "react",
      "react-dom",
      "redux",
      "vue",
      "angular",
      "jquery",
      "moment",
      "lodash",
      "immer",
      "rxjs",
      "core-js",
      "regenerator-runtime",
      "polyfill",
      "babel",
      "webpack",
      "vite",
      "rollup",
      "parcel",
      "zone.js"
    ];

    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\\]{}]/g, "\\$&");
    }

    const isVendorUrl = (url, vendorPatterns) => {
      if (!url) return false;
      const lower = url.toLowerCase();
      return vendorPatterns.some((p) => lower.includes(p.toLowerCase()));
    }

    const {
      vendorPatterns = DEFAULT_VENDOR_PATTERNS,
      debugLog = false,
      manualAdd = [],
      manualRemove = []
    } = options;

    const fileLevelPatterns = new Set();

    async function applyBlackboxPatterns() {
      await client.send("Debugger.setBlackboxPatterns", {
        patterns: Array.from(fileLevelPatterns)
      });
    }

    client.on("Debugger.scriptParsed", async (script) => {
      // console.log(script)
      // console.log('------')
      const url = script.url;
      if (!url || url.startsWith("eval") || url.startsWith("extensions::") || url.startsWith("pptr:")) {
        return;
      }

      if (manualRemove.some((pattern) => url.includes(pattern))) {
        if (debugLog) console.log("[MBX] Skipping due to manual remove:", url);
        return;
      }

      let shouldBlackbox = false;
      let blacklisted = false;

      if (manualAdd.some((pattern) => url.includes(pattern))) {
        shouldBlackbox = true;
        if (debugLog) console.log("[MBX] Manual-add vendor:", url);
      }

      if (!shouldBlackbox && isVendorUrl(url, vendorPatterns)) {
        shouldBlackbox = true;
        if (debugLog) console.log("[MBX] Auto vendor:", url);
      }

      if (shouldBlackbox) {

        const pattern = "^" + escapeRegex(url) + "$";
        if (!fileLevelPatterns.has(pattern)) {
          fileLevelPatterns.add(pattern);
          await applyBlackboxPatterns();
          blacklisted = true;
          if (debugLog) console.log("[MBX] Blackboxed:", url);
        }
      }
      if (onScriptParsed) {
        onScriptParsed({ ...script, blacklisted });
      }
    });
  };
}


export default Debugger;