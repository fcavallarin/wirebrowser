import { ObjectSimilarity } from "../object-similarity.js";
import { red, yellow, green, cyan } from "./test-utils.js";

function colorize(score) {
  if (score >= 0.80) return green(score.toFixed(3));
  if (score >= 0.50) return yellow(score.toFixed(3));
  return red(score.toFixed(3));
}


const tests = [

  {
    name: "Simple shape",
    base: { a: 1, b: 2 },
    variants: [
      { label: "same-shape", obj: { a: 1, b: 3 }, expected: [0.90, 1.0] },
      { label: "one-key-diff", obj: { a: 1, c: 2 }, expected: [0.44, 0.70] },
      { label: "one-key-extra", obj: { a: 1, b: 2, c: 0 }, expected: [0.60, 0.9] }
    ]
  },

  {
    name: "Lexically similar keys",
    base: { other: "a", testKeyTop: "b" },
    variants: [
      { label: "other≈othera", obj: { othera: "a", testKeyTop: "b" }, expected: [0.75, 0.90] },
      { label: "other≈others", obj: { others: "a", testKeyTop: "b" }, expected: [0.70, 0.85] },
      { label: "abbr", obj: { oth: "a", testKeyTop: "b" }, expected: [0.60, 0.75] },
    ]
  },

  {
    name: "Array primitives",
    base: { nums: [1, 2, 3], tag: "v1" },
    variants: [
      { label: "extra-val", obj: { nums: [1, 2, 3, 4], tag: "v1" }, expected: [0.90, 1.0] },
      { label: "shorter", obj: { nums: [1], tag: "v1" }, expected: [0.78, 0.9] },
      { label: "similar-key", obj: { numbers: [1, 2, 3], tag: "v1" }, expected: [0.53, 0.70] },
    ]
  },

  {
    name: "Nested objects",
    base: { user: { id: 1, name: "aaa" }, role: "admin" },
    variants: [
      { label: "same-shape", obj: { user: { id: 2, name: "bbb" }, role: "admin" }, expected: [0.90, 1.0] },
      { label: "id≈uid", obj: { user: { uid: 1, name: "aaa" }, role: "admin" }, expected: [0.65, 0.80] },
      { label: "user≠profile", obj: { profile: { id: 1 }, role: "admin" }, expected: [0.35, 0.55] },
    ]
  },

  {
    name: "Coordinates",
    base: { latitude: 12.3, longitude: 45.6 },
    variants: [
      { label: "lat≈lat/lon≈lon", obj: { lat: 12.3, lon: 45.6 }, expected: [0.29, 0.50] },
      { label: "latDeg", obj: { latDeg: 12.3, lonDeg: 45.6 }, expected: [0.2, 0.5] },
      { label: "x,y", obj: { x: 12.3, y: 45.6 }, expected: [0, 0.50] },
    ]
  },

  {
    name: "Many fields",
    base: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 },
    variants: [
      { label: "1 diff", obj: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 7 }, expected: [0.90, 1.0] },
      { label: "2 missing", obj: { a: 1, b: 2, c: 3, d: 4 }, expected: [0.60, 0.75] },
      { label: "mixed", obj: { a: 1, c: 3, e: 5, g: 99, h: 88 }, expected: [0.40, 0.60] },
    ]
  },

  {
    name: "Function keys",
    base: { onClick: () => { }, label: "OK", id: 5 },
    variants: [
      { label: "same-shape", obj: { onClick: () => { }, label: "OK", id: 6 }, expected: [0.90, 1.0] },
      { label: "onPress≈onClick", obj: { onPress: () => { }, label: "OK", id: 5 }, expected: [0.60, 0.85] },
      { label: "different", obj: { press: () => { }, text: "OK", idx: 5 }, expected: [0.15, 0.35] },
    ]
  },

  {
    name: "Nested",
    base: { a: "1", b: { c: 1, d: " test" } },
    variants: [
      { label: "same-shape", obj: { a: null, b: null }, expected: [0.90, 1.0] },
      { label: "same-shape1", obj: { a: "sa", b: {} }, expected: [0.90, 1.0] },
      { label: "same-shape2", obj: { a: "1", b: { c: "2", d: 4 } }, expected: [0.90, 1.0] },

    ]
  },
];


const fp = new ObjectSimilarity({
  depth: 2,
  includeValues: false,
  includePrimitiveValues: false,
});


function passes(score, expected) {
  return score >= expected[0] && score <= expected[1];
}

console.log(cyan("\n=== ObjectSimilarity Similarity Test Suite ===\n"));

for (const t of tests) {
  // if(t.name !== "Nested")continue;
  console.log(cyan(`\n## ${t.name}\n`));
  for (const v of t.variants) {
    const score = fp.hybridSimilarity(t.base, v.obj, 0.3);
    const ok = passes(score, v.expected);
    const colored = colorize(score);
    const status = ok ? green("OK") : red("FAIL");
    console.log(`${v.label.padEnd(20)} → sim = ${colored}  expected=${v.expected.join("–").padEnd(10)} ${status}`);
  }
}

console.log(cyan("\nDone.\n"));
