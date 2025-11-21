import { useEffect, useRef, useState } from "react";
import { useMonaco } from "@monaco-editor/react";


const useMonacoHighlights = (editor) => {
  const decorationsRef = useRef([]);
  const monaco = useMonaco();
  const [rules, setRules] = useState(null);
  
  useEffect(() => {
    if (!editor || rules.length === 0) return;

    const model = editor.getModel();
    if (!model) return;

    function updateHighlights() {
      const text = model.getValue();
      const newDecorations = [];

      for (const rule of rules) {
        let match;
        while ((match = rule.regex.exec(text))) {
          const startIdx = match.index;
          const endIdx = startIdx + match[0].length;

          const start = model.getPositionAt(startIdx);
          const end = model.getPositionAt(endIdx);

          newDecorations.push({
            range: new monaco.Range(
              start.lineNumber,
              start.column,
              end.lineNumber,
              end.column
            ),
            options: {
              inlineClassName: rule.className
            }
          });
        }
      }

      decorationsRef.current = editor.deltaDecorations(
        decorationsRef.current,
        newDecorations
      );
    }

    updateHighlights();

    const subscription = model.onDidChangeContent(() => {
      updateHighlights();
    });

    return () => {
      subscription.dispose();
    };
  }, [editor, rules]);
  return setRules;
}

export default useMonacoHighlights;