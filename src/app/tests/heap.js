import { patchModule, runHttpServer, compareObjects } from "#src/app/tests/test-utils.js";
import Heap from "#src/app/modules/heap/heap.js";
import fs from "fs";
import { red, yellow, green, cyan } from "./test-utils.js";

const REACT = false;

const fail = () => {
  console.log(red("FAILED"));
  process.exit(1);
}

const success = () => {
  console.log(green("SUCCESS"));
}

const EXPECTED = {
  snapshot: [
    {
      "meta": [],
      "object": {
        "other": "nope",
        "testKeyTop": "top-level testValue"
      },
      "path": "<lexical system / Context>"
    },
    {
      "meta": [],
      "object": {
        "<symbol not-matching>": "symbol value no match",
        "<symbol testKeySymbol>": "symbol value with testValue",
        "no-match-key": "no-match-value",
        "prefix-testKey-suffix": "value with a testValue inside"
      },
      "path": "<lexical system / Context>"
    },
    {
      "meta": [],
      "object": {
        "f": false,
        "n": null,
        "t": true,
        "xxtestKey": "has testValue here"
      },
      "path": "<lexical system / Context>"
    },
    {
      "meta": [],
      "object": {
        "el": "<div data-testkey=\"testValue in attribute\">",
        "testKeyDom": "testValue in dom container"
      },
      "path": "<lexical system / Context>"
    },
    {
      "meta": [],
      "object": {
        "testKeyObj": "obj with testValue"
      },
      "path": "<lexical system / Context>"
    },
    {
      "meta": [],
      "object": {
        "testKeyInWeak": "testValue-weak"
      },
      "path": "<lexical system / Context>"
    },
    {
      "meta": [],
      "object": {
        "testKeyDeep": "deep testValue"
      },
      "path": "<lexical system / Context>[6].deep.very"
    },
    {
      "meta": [],
      "object": {
        "data-testKey-attr": "has testValue attr"
      },
      "path": "<lexical system / Context>.node.attrs"
    },
    {
      "meta": [
        {
          "class": "Class1",
          "field": "root",
          "type": "classType"
        }
      ],
      "object": {
        "other": 42,
        "testKeyInClass1": "some testValue here"
      },
      "path": "<lexical system / Context>.p1"
    },
    {
      "meta": [],
      "object": {
        "name": "B",
        "ref": {
          "name": "A",
          "ref": "[Circular Object]"
        },
        "testKeyCycle": "testValue-cycle"
      },
      "path": "<lexical system / Context>.ref"
    }
  ],
  runtime: [
    { path: 'window.rts.runtimeSearch.rtProp', value: 'rtVal' },
    { path: 'window.rts.runtimeSearch2[0].rtProp', value: 'rtVal' }
  ]
};

(async () => {
  runHttpServer(3000, REACT ? ["html", "wireb-test", "dist"] : null);
  const heapModule = new Heap(null, null, null);
  await patchModule(heapModule, {
    "Error": async (data) => {
      console.log(red("Error:"));
      console.log(data);
    },
    "heap.searchSnapshotResult": async (data) => {
      if (!compareObjects(EXPECTED.snapshot, data)) {
        compareObjects(EXPECTED.snapshot, data, true);
        fail();
      }
      success();
    },
    "heap.searchRuntimeResult": async (data) => {
      if (!compareObjects(EXPECTED.runtime, data)) fail();
      success();
    },
    "heap.searchClassesResult": async (data) => {
      // console.log(data)
      if (data.results.length === 0) fail();
      await heapModule.uiEvents.listeners['heap.exposeObject']({
        pageId: data.results[0].pageId,
        objectId: data.results[0].objectId,
        varName: "wbtemp"
      }, heapModule.uiEvents.dispatch);
    },
    "heap.exposeObjectResult": async (data) => {
      const page = heapModule.pagesManager.get('1').page;
      const r = await page.evaluate(() => window.wbtemp);
      if (!r.testKeyTop) fail();
      success();
    }
  });
  heapModule.run();
  const page = heapModule.pagesManager.get('1').page;
  if (!REACT) {
    await page.goto("http://localhost:3000/heap-search-snapshot.html", { waitUntil: 'load' });
    // await page.goto("https://fcvl.net", { waitUntil: 'networkidle0' });
    // await page.goto("https://portal.inter.link", { waitUntil: 'networkidle0' });
  } else {
    await page.goto("http://localhost:3000/blog-posts", { waitUntil: 'networkidle0' });
  }


  // await heapModule.uiEvents.listeners['heap.searchSnapshot']({
  //   pageId: '1',
  //   propertySearch: [".*testKey.*", { matchCase: true, useRegexp: true }],
  //   valueSearch: [".*testValue.*", { matchCase: true, useRegexp: true }]
  // }, heapModule.uiEvents.dispatch);

  // await heapModule.uiEvents.listeners['heap.searchRuntime']({
  //   pageId: '1',
  //   root: "window.rts",
  //   propertySearch: [".*rtP.*", { matchCase: true, useRegexp: true }],
  //   valueSearch: null// [".*testValue.*", { matchCase: true, useRegexp: true }]
  // }, heapModule.uiEvents.dispatch);

  await heapModule.uiEvents.listeners['heap.searchClasses']({
    pageId: '1',
    osObject: JSON.stringify({
      testKeyTop: "top-level testValue",
      othera: "nope",
    }),
    osThreshold: 0.7,
    osEnabled: true,
    osAlpha: 0.3,
    osIncludeValues: false,

  }, heapModule.uiEvents.dispatch);


  await heapModule.uiEvents.listeners['heap.searchClasses']({
    pageId: '1',
    osObject: JSON.stringify({
      testKeyTop: "top-level testValue",
      othera: "nope",
    }),
    valueSearch: [".*level .*", { matchCase: true, useRegexp: true }],
    osThreshold: 0.7,
    osEnabled: true,
    osAlpha: 0.3,
    osIncludeValues: false,
  }, heapModule.uiEvents.dispatch);

  setTimeout(() => process.exit(1), 1000);
})();