import React, { useState, useRef, useEffect, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import { Tooltip, Button, Input, Form } from "antd";
import { SearchOutlined, FormatPainterOutlined, PicCenterOutlined } from "@ant-design/icons";
import Editor, { useMonaco } from "@monaco-editor/react";
import useMonacoHighlights from "@/hooks/useMonacoHighlights";

const CodeEditor = ({
  ref,
  value = "",
  onChange,
  showActions = false,
  header,
  language = "json",
  height,
  lineNumbers = true,
  resize = null,  // "vertical", "horizontal", "both"
  lineWrap = true,
  showMinimap = false,
  stickyScroll = true,
  onMount,
  onReady,
  highlightRules = null,
  showAutocomplete = false,
  readOnly = false,
  contextMenuItems,
}) => {

  const editorRef = useRef(null);
  const [wrap, setWrap] = useState(lineWrap);
  const [changedValue, setChangedValue] = useState(value);
  const [minimap, setMinimap] = useState(showMinimap);
  const monaco = useMonaco();
  const setHighlightRules = useMonacoHighlights(editorRef.current);
  const queueRef = useRef({ onMount: [], onReady: [] });
  const contentWidgetsRef = useRef(new Map());

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange?.(changedValue || "");
    }, 300);

    return () => clearTimeout(timeout);
  }, [changedValue]);

  useEffect(() => {
    setChangedValue(value);
  }, [value]);

  useEffect(() => {
    setHighlightRules(highlightRules);
  }, [highlightRules]);

  const API = {
    format: () => {
      formatDoc()
    },
    scrollTop: () => {
      editorRef.current?.setScrollTop(0);
    },
    getValue: () => {
      return editorRef.current?.getValue() ?? "";
    },
    getPosition: () => {
      const p = editorRef.current?.getPosition();
      if (!p) {
        return null;
      }
      return {
        lineNumber: p.lineNumber,
        columnNumber: p.column
      };
    },
    showPosition: (line, column, highligh) => {
      const sp = () => {
        try {
          editorRef.current.revealPositionInCenter({ lineNumber: line, column });
          editorRef.current.setPosition({ lineNumber: line, column });
          editorRef.current.focus();
        } catch {
          throw new Error(`CodeEditor failed to go to position ${line}:${column}`);
        }
        if (highligh) {
          try {
            editorRef.current.deltaDecorations([], [
              {
                range: new monaco.Range(line, column, line, column + highligh),
                options: {
                  isWholeLine: false,
                  className: "code-editor-highlight"
                }
              }
            ]);
          } catch {
            throw new Error(`CodeEditor failed to highligh`);
          }
        }
      }
      if (!editorRef.current) {
        queueRef.current.onReady.push(sp);
      } else {
        sp();
      }
    },
    addContentWidget: (line, col, id, content) => {
      const op = () => {
        const node = document.createElement("div");
        // Note: this is a new root, components cannot see contenct etc..
        const root = createRoot(node);
        root.render(content);

        const existing = contentWidgetsRef.current.get(id);
        if (existing) {
          existing.dispose();
        }
        const widget = {
          getId: () => id,
          getDomNode: () => node,
          getPosition: () => ({
            position: { lineNumber: line, column: col },
            preference: [
              monaco.editor.ContentWidgetPositionPreference.ABOVE,
              monaco.editor.ContentWidgetPositionPreference.BELOW
            ]
          }),
          dispose: () => {
            if (!editorRef.current) {
              return;
            }
            editorRef.current.removeContentWidget(widget);
            contentWidgetsRef.current.delete(id);
            queueMicrotask(() => {
              try { root.unmount(); } catch { }
            });
          },
        };
        contentWidgetsRef.current.set(id, widget);
        editorRef.current.addContentWidget(widget);
        editorRef.current.layoutContentWidget(widget);
      }
      if (!editorRef.current) {
        queueRef.current.onReady.push(op);
      } else {
        op();
      }
    },

    removeContentWidget: (id) => {
      const existing = contentWidgetsRef.current.get(id);
      if (existing) {
        existing.dispose();
      }
    },
    clearContentWidgets: () => {
      for (const w of contentWidgetsRef.current.values()) {
        w.dispose();
      }
    }
  };

  const handleOnMount = (editor, monaco) => {
    editorRef.current = editor;

    setHighlightRules(highlightRules || []);
    editor.onDidDispose(() => {
      for (const w of contentWidgetsRef.current.values()) {
        w.dispose();
      }
    });
    if (queueRef.current.onMount.length > 0) {
      for (const op of queueRef.current.onMount) {
        op();
      }
      queueRef.current.onMount = [];
    }
    if (contextMenuItems) {
      for (const m of contextMenuItems) {
        editor.addAction({
          id: `wirebrowser.${m.label.replace(/\s+/, "")}`,
          label: m.label,
          contextMenuGroupId: "wirebrowser",
          run: (editor) => m.run(API, editor),
        });
      }
    }
    if (onMount) {
      onMount(editor, monaco, API);
    }

    let readyFired = false;
    let timeoutId = null;
    let scheduled = false;

    const containerEl = editor.getDomNode();

    const fireReadyOnce = () => {
      if (readyFired) {
        return;
      }
      readyFired = true;

      if (queueRef.current.onReady.length > 0) {
        for (const op of queueRef.current.onReady) {
          op();
        }
        queueRef.current.onReady = [];
      }

      if (onReady) {
        onReady(editor, monaco, API);
      }

      disposable.dispose();
    };

    const scheduleReady = () => {
      if (readyFired) {
        return;
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        const r = containerEl?.getBoundingClientRect?.();
        if (!r || r.width <= 0 || r.height <= 0) {
          return;
        }
        editor.layout();
        fireReadyOnce();
      }, 500);
    };

    const disposable = editor.onDidLayoutChange(() => {
      if (readyFired) {
        return;
      }
      if (scheduled) {
        scheduleReady();
        return;
      }
      scheduled = true;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scheduled = false;
          scheduleReady();
        });
      });
    });

    scheduleReady();
  }

  const formatDoc = () => {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }

  const find = () => {
    editorRef.current?.getAction("actions.find")?.run();
  }

  const toggleWrap = () => {
    setWrap(current => {
      const next = !current;
      if (editorRef.current) {
        editorRef.current.updateOptions({
          wordWrap: next ? "on" : "off"
        });
      }
      return next;
    });
  }

  useImperativeHandle(ref, () => (API));

  const handleOnChange = ((val) => {
    setChangedValue(val || "");
  });

  const ret = (
    <div className="flex h-full flex-col">
      {(header || showActions) && (
        <div className="flex-none h-8">
          <div className="flex flex-row">
            <div className="flex-1">
              {(header ? header : <div></div>)}
            </div>
            {showActions && (
              <div className="flex-none w-40">

                <Button title="Format" className={`${language === "plaintext" || readOnly ? "invisible" : ""}`} type="text" onClick={() => formatDoc()}>
                  <FormatPainterOutlined />
                </Button>

                <Button title="toggle line wrap" type="text" onClick={() => toggleWrap()}>
                  <PicCenterOutlined className={!wrap ? "opacity-25" : ""} />
                </Button>
                <Button title="search" type="text" onClick={() => find()}>
                  <SearchOutlined />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-20">
        <Editor
          height="100%"
          width="100%"
          language={language}
          value={String(value)}
          theme="vs-dark"
          onChange={handleOnChange}
          onMount={handleOnMount}
          options={{
            fontSize: 12,
            lineNumbers: lineNumbers ? "on" : "off",
            minimap: { enabled: minimap },
            suggestOnTriggerCharacters: showAutocomplete,
            quickSuggestions: showAutocomplete,
            parameterHints: { enabled: showAutocomplete },
            tabCompletion: "on",
            wordBasedSuggestions: false,
            occurrenceHighlight: false, // 5. no line highlight
            selectionHighlight: false,  // disable selection highlight
            renderLineHighlight: "none", // disable active line highlight
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: wrap ? "on" : "off",
            links: false,
            readOnly: readOnly,
            fixedOverflowWidgets: true,
            stickyScroll: {
              enabled: stickyScroll
            }
          }}
        />
      </div>
    </div>
  );

  const resizeStyle = resize !== null ? {
    overflow: "hidden",
    resize: resize
  } : {};
  return (
    height ? (
      <div style={{ height: `${height}px`, ...resizeStyle }}>
        {ret}
      </div>
    ) : (
      ret
    )
  )
}

export default CodeEditor;