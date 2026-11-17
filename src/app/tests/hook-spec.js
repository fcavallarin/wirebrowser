// Checks that the hook spec (hook-spec.generated.js) matches the typings it is
// generated from, and that the runtime implements the API the spec describes.
//
// Run from the repo root:  node src/app/tests/hook-spec.js

import fs from "node:fs";
import vm from "node:vm";
import { generateHookSpecModule, SPEC_PATH } from "../../../scripts/gen-hook-spec.js";
import HOOK_SPEC from "#src/app/modules/debugger/hook-spec.generated.js";
import HooksManager from "#src/app/modules/debugger/hooks-manager.js";
import { generateHookScript } from "#src/app/modules/debugger/hook-script.js";
import { red, green, assert } from "./test-utils.js";

let failed = 0;
const test = (label, fn) => {
  try {
    fn();
    console.log(green(`[${label}] PASSED`));
  } catch (e) {
    failed++;
    console.log(red(`[${label}] FAILED: ${e.message}`));
  }
};

const sorted = (list) => [...list].sort().join(",");

const allHandlers = [...HOOK_SPEC.handlers, HOOK_SPEC.atHandler];

test("testSpecUpToDate", () => {
  const expected = generateHookSpecModule();
  if (fs.readFileSync(SPEC_PATH, "utf8") !== expected) {
    throw new Error("hook-spec.generated.js is stale: run `npm run gen:hook-spec`");
  }
});

// The ctx the runtime builds for each phase exposes exactly the methods of the spec
test("testRuntimeCtxMatchesSpec", () => {
  const fakeManager = { step: 1, getFlatStackTrace: () => [] };
  for (const h of allHandlers) {
    const ctx = HooksManager.prototype.getNewCtx.call(fakeManager, {}, h.phase);
    const members = [...HOOK_SPEC.context.all, ...HOOK_SPEC.context[h.phase]];

    for (const m of members.filter(x => x.kind === "property")) {
      assert(`${h.phase}: ctx.${m.name} ${m.name in ctx ? "present" : "missing"}`, "==", `${h.phase}: ctx.${m.name} present`);
    }

    const callback = `${h.name}(ctx) { globalThis.methods = Object.keys(ctx).filter(k => typeof ctx[k] === "function"); }`;
    const previousStep = h.params.includes("previousStep") ? {} : undefined;
    const sandbox = {};
    vm.runInNewContext(HooksManager.prototype.getEvalCode.call(fakeManager, ctx, callback, previousStep), sandbox);
    const expected = members.filter(x => x.kind === "method").map(x => x.name);
    assert(`${h.phase}: ${sorted(sandbox.methods)}`, "==", `${h.phase}: ${sorted(expected)}`);
  }
});

test("testHookScriptUsesSpec", () => {
  const hook = { file: "https://example.test/app.js", line: 1 };
  for (const h of HOOK_SPEC.handlers) {
    hook[h.name] = "ctx.send(1);";
  }
  hook.at = [{ location: "1:1", [HOOK_SPEC.atHandler.name]: "ctx.send(1);" }];
  const script = generateHookScript({ hooks: [hook], pageId: "1" });
  for (const h of allHandlers) {
    assert(script.includes(`${h.name}(${h.params.join(", ")}) {`), "==", true);
  }
});

test("testUnknownHandlerRejected", () => {
  const manager = new HooksManager({ on: () => { } }, {});
  let error;
  try {
    manager.addHook({ location: { file: "https://example.test/app.js", line: 1 }, handlers: { onReturn: "ctx.send(1)" } });
  } catch (e) {
    error = e;
  }
  assert(error?.message ?? "", "startsWith", "Unknown hook handler 'onReturn'");
});

console.log(failed === 0 ? green("ALL PASSED") : red(`${failed} FAILED`));
process.exit(failed === 0 ? 0 : 1);
