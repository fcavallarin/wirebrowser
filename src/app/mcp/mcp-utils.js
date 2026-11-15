// Helpers shared by the MCP tools. Tool output goes to an LLM: keep it
// bounded and readable.

export const truncate = (text, max) => {
  if (typeof text !== "string" || text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}… [truncated, ${text.length - max} more chars]`;
};

// Values coming from the page (ctx.send, evaluate) can be anything: keep
// small JSON values as they are, turn big ones into a truncated string.
export const boundValue = (value, max = 2000) => {
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    return "[unserializable value]";
  }
  if (json === undefined || json.length <= max) {
    return value;
  }
  return truncate(json, max);
};

export const jsonResult = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }]
});

export const textResult = (text) => ({
  content: [{ type: "text", text }]
});

export const errorResult = (message) => ({
  isError: true,
  content: [{ type: "text", text: message }]
});

// MCP text query -> the [pattern, options] tuple used by the heap searches
export const toTextMatch = (query) => {
  if (!query) {
    return undefined;
  }
  return [query.pattern, {
    useRegexp: !!query.regex,
    matchCase: !!query.matchCase,
    exactMatch: !!query.exact,
  }];
};

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// All tools share the browser and its debugger: run them one at a time.
export class Mutex {
  constructor() {
    this.last = Promise.resolve();
  }

  run = (fn) => {
    const result = this.last.then(() => fn());
    this.last = result.catch(() => { /* keep the chain alive */ });
    return result;
  };
}

// Script sources returned by CDP start at the beginning of the script, while
// locations shown to the agent (and used by hooks) are document-relative:
// inline <script>s start at their tag. Lines and columns are 1-based.
export const sourceToDocument = (offset, srcLineIdx, srcColIdx) => ({
  line: srcLineIdx + offset.startLine + 1,
  col: (srcLineIdx === 0 ? srcColIdx + offset.startColumn : srcColIdx) + 1,
});

export const documentToSourceLineIdx = (offset, line) => line - 1 - offset.startLine;

export const documentToSourceColIdx = (offset, line, col) =>
  (line - 1 === offset.startLine ? col - 1 - offset.startColumn : col - 1);

export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
