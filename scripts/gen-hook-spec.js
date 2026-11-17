// Generates src/app/modules/debugger/hook-spec.generated.js from the hook
// typings in src/gui/monaco/typings/pptr-scripts.d.ts, the single source of
// truth for the hook API (handlers, ctx members per phase, previousStep).
//
// The spec drives the MCP tools (schema and descriptions), the Node Script
// generator and addHook validation. Run after changing the typings:
//
//   npm run gen:hook-spec
//
// Summaries come from the `@mcp` JSDoc tag, or the first sentence of the
// comment when the tag is missing. Members without a summary are left out of
// the descriptions (but still listed in the spec).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DTS_PATH = path.join(ROOT, "src/gui/monaco/typings/pptr-scripts.d.ts");
export const SPEC_PATH = path.join(ROOT, "src/app/modules/debugger/hook-spec.generated.js");

const collapse = (text) => text.replace(/\s+/g, " ").trim();

const firstSentence = (text) => {
  const paragraph = text.trim().split(/\n\s*\n/)[0];
  const m = collapse(paragraph).match(/^(.*?[.!?])(\s|$)/);
  return m ? m[1] : collapse(paragraph);
};

const getDoc = (node) => {
  const doc = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc).at(-1);
  if (!doc) {
    return { text: "", mcp: undefined };
  }
  const text = ts.getTextOfJSDocComment(doc.comment) ?? "";
  const mcpTag = doc.tags?.find(t => t.tagName.text === "mcp");
  const mcp = mcpTag ? collapse(ts.getTextOfJSDocComment(mcpTag.comment) ?? "") : undefined;
  return { text, mcp };
};

const summaryOf = (node) => {
  const { text, mcp } = getDoc(node);
  return (mcp || firstSentence(text)).replace(/\.$/, "");
};

const memberName = (m) => m.name.getText();

const findInterfaces = (sourceFile) => {
  const interfaces = new Map();
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node)) {
      interfaces.set(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return interfaces;
};

const getInterface = (interfaces, name) => {
  const node = interfaces.get(name);
  if (!node) {
    throw new Error(`interface ${name} not found in ${DTS_PATH}`);
  }
  return node;
};

const typeName = (typeNode) => {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) {
    throw new Error(`Expected a type reference, got '${typeNode?.getText()}'`);
  }
  return typeNode.typeName.getText();
};

const baseName = (iface) => {
  const ext = iface.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
  return ext ? ext.types[0].expression.getText() : null;
};

// The literal value of the `phase` member of a context interface
const phaseOf = (iface) => {
  const m = iface.members.find(x => ts.isPropertySignature(x) && memberName(x) === "phase");
  if (!m || !ts.isLiteralTypeNode(m.type) || !ts.isStringLiteral(m.type.literal)) {
    throw new Error(`${iface.name.text}: missing a string literal 'phase' member`);
  }
  return m.type.literal.text;
};

const describeMember = (m) => {
  const name = memberName(m);
  if (ts.isMethodSignature(m)) {
    return {
      name,
      kind: "method",
      signature: `${name}(${m.parameters.map(p => p.name.getText()).join(", ")})`,
      summary: summaryOf(m),
    };
  }
  return { name, kind: "property", signature: name, summary: summaryOf(m) };
};

// Members of a context interface, without `phase` (implied by the handler)
const contextMembers = (iface) => iface.members
  .filter(m => (ts.isMethodSignature(m) || ts.isPropertySignature(m)) && memberName(m) !== "phase")
  .map(describeMember);

const describeHandler = (m) => {
  if (!ts.isMethodSignature(m)) {
    throw new Error(`Handler ${memberName(m)} must be a method signature`);
  }
  return {
    name: memberName(m),
    params: m.parameters.map(p => p.name.getText()),
    ctxType: typeName(m.parameters[0]?.type),
    summary: summaryOf(m),
  };
};

export const buildHookSpec = (dtsSource) => {
  const sourceFile = ts.createSourceFile(DTS_PATH, dtsSource, ts.ScriptTarget.Latest, true);
  const interfaces = findInterfaces(sourceFile);
  const handlersIface = getInterface(interfaces, "HookHandlers");

  const handlers = [];
  let atHandler;
  for (const m of handlersIface.members) {
    if (ts.isMethodSignature(m)) {
      handlers.push(describeHandler(m));
    } else if (memberName(m) === "at") {
      // at?: Array<{ location: string; onHit?(ctx): void }>
      const literal = m.type.typeArguments?.[0];
      const hit = literal?.members?.find(ts.isMethodSignature);
      if (!hit) {
        throw new Error("HookHandlers.at: handler method not found");
      }
      atHandler = describeHandler(hit);
    }
  }
  if (!atHandler) {
    throw new Error("HookHandlers.at not found");
  }

  // Every context must extend the same base: its members are available in all phases
  let base;
  const context = {};
  const withPhase = ({ name, params, ctxType, summary }) => {
    const iface = getInterface(interfaces, ctxType);
    const b = baseName(iface);
    if (base && b !== base) {
      throw new Error(`${ctxType} extends ${b}, expected ${base}`);
    }
    base = b;
    const phase = phaseOf(iface);
    context[phase] = contextMembers(iface);
    return { name, phase, params, summary };
  };
  const specHandlers = handlers.map(withPhase);
  const specAtHandler = withPhase(atHandler);
  context.all = contextMembers(getInterface(interfaces, base));

  const previousStep = getInterface(interfaces, "HookPreviousStep").members
    .filter(ts.isPropertySignature)
    .map(m => ({ name: memberName(m), optional: Boolean(m.questionToken) }));

  return {
    executionModel: getDoc(handlersIface).mcp ?? "",
    handlers: specHandlers,
    atHandler: specAtHandler,
    context,
    previousStep,
  };
};

export const renderHookSpecModule = (spec) => [
  "// GENERATED by scripts/gen-hook-spec.js from src/gui/monaco/typings/pptr-scripts.d.ts.",
  "// Do not edit: change the typings and run `npm run gen:hook-spec`.",
  "",
  `export default ${JSON.stringify(spec, null, 2)};`,
  "",
].join("\n");

export const generateHookSpecModule = () => renderHookSpecModule(buildHookSpec(fs.readFileSync(DTS_PATH, "utf8")));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(SPEC_PATH, generateHookSpecModule());
  console.log(`Wrote ${path.relative(ROOT, SPEC_PATH)}`);
}
