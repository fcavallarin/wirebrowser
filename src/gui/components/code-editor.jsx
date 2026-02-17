import React, { useState, useRef, useEffect, useImperativeHandle } from "react";
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
  highlightRules = null,
  showAutocomplete = false,
}) => {

  const editorRef = useRef(null);
  const [wrap, setWrap] = useState(lineWrap);
  const [changedValue, setChangedValue] = useState(value);
  const [minimap, setMinimap] = useState(showMinimap);
  const monaco = useMonaco();
  const setHighlightRules = useMonacoHighlights(editorRef.current);

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

  const handleOnMount = (editor, monaco) => {
    editorRef.current = editor;
    setHighlightRules(highlightRules || []);
    if (onMount) {
      onMount(editor, monaco);
    }
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

  useImperativeHandle(ref, () => ({
    format: () => {
      formatDoc()
    },
    scrollTop: () => {
      editorRef.current?.setScrollTop(0);
    },
    getValue: () => {
      return editorRef.current?.getValue() ?? "";
    },
    showPosition: (line, column, highligh) => {
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
  }));

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

                <Button title="Format" className={`${language === "plaintext" ? "invisible" : ""}`} type="text" onClick={() => formatDoc()}>
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