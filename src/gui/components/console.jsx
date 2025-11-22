import { useState, useEffect, useRef, useImperativeHandle } from "react";
import { useApiEvent, useEvent } from "@/hooks/useEvents.js";
import { Tabs, Button } from "antd";
import { CloseOutlined, SearchOutlined, DownCircleOutlined, StopOutlined } from "@ant-design/icons";
import { useGlobal } from "@/global-context";
import { jsonStringify, setConsole } from "@/utils";
import Editor, { useMonaco } from "@monaco-editor/react";
import useMonacoHighlights from "@/hooks/useMonacoHighlights";

const PageConsole = ({ pageId, ref }) => {
  const editorRef = useRef(null);
  const isUserAtBottomRef = useRef(true);
  const monaco = useMonaco();
  const markers = {
    error: "❗",
    execerror: "⛔",
    warn: "▲"
  }

  useImperativeHandle(ref, () => ({
    addData: (data) => {
      const { type, text } = data;
      let line = text;
      if (Array.isArray(text)) {
        line = text.map(t => {
          return typeof t === "string" ? t : jsonStringify(t);
        });
      } else if (typeof text !== "string") {
        line = jsonStringify(text);
      }
      const marker = markers[type] ? `${markers[type]} ` : "";
      appendLine(`${marker}${line}`);
    },
  }));

  const setHighlightRules = useMonacoHighlights(editorRef.current);

  const onMount = (editor) => {
    editorRef.current = editor;
    editor.onKeyDown((e) => e.preventDefault());
    // editor.onCut((e) => e.preventDefault());
    setHighlightRules([
      { regex: new RegExp(`^${markers.error}.*`, "gm"), className: "console-log-error" },
      { regex: new RegExp(`^${markers.execerror}.*`, "gm"), className: "console-log-error" },
      { regex: new RegExp(`^${markers.warn}.*`, "gm"), className: "console-log-warning" },
    ]);
    editor.onDidScrollChange((e) => {
      const model = editor.getModel();
      if (!model) return;

      const lastLine = model.getLineCount();
      const vr = editor.getVisibleRanges()[0];

      if (!vr) {
        isUserAtBottomRef.current = true;
        return;
      }

      isUserAtBottomRef.current = vr.endLineNumber >= lastLine;
    });
  }

  const find = () => {
    editorRef.current?.getAction("actions.find")?.run();
  }

  const clear = () => {
    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;

    const fullRange = model.getFullModelRange();

    editor.executeEdits("clear", [
      { range: fullRange, text: "" }
    ]);

    editor.setPosition({ lineNumber: 1, column: 1 });
    editor.revealPosition({ lineNumber: 1, column: 1 });
  }

  const scrollBottom = () => {
    editorRef.current.revealLine(
      editorRef.current.getModel().getLineCount()
    );
  }

  const appendLine = (str) => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    const lastLine = model.getLineCount();
    const lastCol = model.getLineMaxColumn(lastLine);
    const isAtBottom = isUserAtBottomRef.current;

    editor.executeEdits(null, [
      {
        range: new monaco.Range(lastLine, lastCol, lastLine, lastCol),
        text: `${lastCol > 1 ? "\n" : ""}${str}`
      }
    ]);
    if (isAtBottom) {
      scrollBottom();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none h-8">
        <div className="flex flex-row">
          <div className="flex-1">
            <div></div>
          </div>

          <div className="flex-none w-40 text-right">
            <Button title="search" type="text" onClick={() => find()}>
              <SearchOutlined />
            </Button>
            <Button title="scroll bottom" type="text" onClick={() => scrollBottom()}>
              <DownCircleOutlined />
            </Button>
            <Button title="clear" type="text" onClick={() => clear()}>
              <StopOutlined />
            </Button>
          </div>

        </div>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          width="100%"
          language="plaintext"
          defaultValue=""
          onMount={onMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            wordWrap: "on",
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
}

const Console = () => {
  const { pages } = useGlobal();
  const pagesConsole = useRef(new Map());
  const [tabItems, setTabItems] = useState([]);
  const [selectedPage, setSelectedPage] = useState(undefined);

  useEffect(() => {
    const tabs = [];

    for (const pid of pagesConsole.current.keys()) {
      if (!pages.includes(pid)) {
        pagesConsole.current.delete(pid);
      }
    }

    for (const p of pages) {
      if (pagesConsole.current.has(p)) {
        continue;
      }
      tabs.push({
        key: p,
        label: `Page ${p}`,
        forceRender: true,
        children: <PageConsole ref={r => {
          pagesConsole.current.set(p, r);
        }}
          pageId={p}
        />
      });
    }
    setTabItems(cur => [
      ...tabs,
      ...cur.filter(t => pages.includes(t.key) && !tabs.map(n => n.key).includes(t.key))
    ].sort((a, b) => Number(a.key) - Number(b.key)));

  }, [pages]);

  useApiEvent({
    "consoleAddData": ({ pageId, data, autoSelect = false }) => {
      pagesConsole.current.get(`${pageId}`).addData(data);
      if (autoSelect) {
        setSelectedPage(`${pageId}`);
      }
    }
  });
  useEvent("consoleSelectPage", pageId => setSelectedPage(`${pageId}`));

  return (
    tabItems.length > 0
      ? <Tabs
        tabBarStyle={{ height: '25px', margin: '4px' }}
        animated={false}
        className="flex flex-col flex-1 overflow-hidden"
        activeKey={selectedPage}
        onChange={key => setSelectedPage(key)}
        items={tabItems}
        tabBarExtraContent={{
          right: (
            <span
              className="hover:text-primary"
              onClick={() => setConsole(false)}
              title="Close"
            >
              <CloseOutlined />
            </span>
          )
        }}
      />
      : <div></div>
  );
}

export default Console;