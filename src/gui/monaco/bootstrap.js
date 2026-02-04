import { loader } from "@monaco-editor/react";
import scriptsTyping from "@/monaco/typings/scripts.d.ts?raw";
import pptrScriptsTyping from "@/monaco/typings/pptr-scripts.d.ts?raw";
import commonTyping from "@/monaco/typings/common.d.ts?raw";

export const bootstrapMonaco = () => {

  loader.init().then((monaco) => {

    // Custom JS languageId to get syntax highlighting without attaching
    // the TypeScript language service (no diagnostics, no squiggles).
    monaco.languages.register({ id: 'javascript-no-check' });
    monaco.languages.setMonarchTokensProvider(
      'javascript-no-check',
      monaco.languages.getLanguages()
        .find(l => l.id === 'javascript')
        .loader()
        .then(l => l.language)
    );
    
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      scriptsTyping,
      "file:///wirebrowser/scripts/main.d.ts"
    );
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      pptrScriptsTyping,
      "file:///wirebrowser/pptr-scripts/main.d.ts"
    );
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      commonTyping,
      "file:///wirebrowser/common/main.d.ts"
    );
  }).catch((err) => {
    console.error("Monaco init failed:", err);
  });
}