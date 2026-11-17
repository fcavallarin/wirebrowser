import * as acorn from "acorn";
import { normalizeHandlerSource } from "#src/app/modules/debugger/hooks-manager.js";
import HOOK_SPEC from "#src/app/modules/debugger/hook-spec.generated.js";

// Generates a Node Script (Automation → Node Scripts) that registers the given
// hooks and starts them, using the same API as hand-written scripts:
//
//   WB.Node.Instrumentation.addHook({ file, line, col }, { onEnter(ctx) { ... } });
//   await WB.Node.Instrumentation.startHooks(pageId);
//
// hooks: [{ file, line, col?, <handler>?, at?: [{ location, <at handler> }] }]
// where handlers are function bodies (strings), as accepted by addHook, and
// their names and parameters come from the hook spec (hook-spec.generated.js).

const indent = (text, spaces) => {
  const pad = " ".repeat(spaces);
  return text.split("\n").map(l => (l ? pad + l : l)).join("\n");
};

// Readable method source for a handler body, validated like addHook does
const handlerMethod = ({ name, params }, body) => {
  normalizeHandlerSource(name, body);
  return `${name}(${params.join(", ")}) {\n${indent(body.trim(), 2)}\n}`;
};

const formatLocation = ({ file, line, col }) => {
  return `{ file: ${JSON.stringify(file)}, line: ${line}${col !== undefined ? `, col: ${col}` : ""} }`;
};

export const generateHookScript = ({ hooks, pageId, description }) => {
  const out = [];
  if (description) {
    out.push(...description.trim().split("\n").map(l => `// ${l}`), "");
  }
  const numericId = Number(pageId);
  out.push(`const pageId = ${Number.isInteger(numericId) ? numericId : JSON.stringify(String(pageId))};`, "");

  for (const h of hooks) {
    const members = [];
    for (const handler of HOOK_SPEC.handlers) {
      if (h[handler.name]) {
        members.push(handlerMethod(handler, h[handler.name]));
      }
    }
    if (h.at?.length) {
      const ats = h.at.map(a => [
        "{",
        `  location: ${JSON.stringify(a.location)},`,
        indent(handlerMethod(HOOK_SPEC.atHandler, a[HOOK_SPEC.atHandler.name]), 2),
        "}",
      ].join("\n"));
      members.push(`at: [\n${indent(ats.join(",\n"), 2)}\n]`);
    }
    if (members.length === 0) {
      throw new Error(`Hook at ${h.file}:${h.line} has no handlers`);
    }
    out.push(
      `WB.Node.Instrumentation.addHook(${formatLocation(h)}, {\n${indent(members.join(",\n\n"), 2)}\n});`,
      ""
    );
  }
  out.push("await WB.Node.Instrumentation.startHooks(pageId);", "");
  const script = out.join("\n");

  // Node Scripts run as the body of an async function
  try {
    acorn.parse(`(async () => {\n${script}\n})`, { ecmaVersion: "latest" });
  } catch (e) {
    throw new Error(`Generated script is not valid JavaScript: ${e.message}`);
  }
  return script;
};
