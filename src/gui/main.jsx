import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import antdTokens from "@/themes/dark/antd-tokens";
import { ConfigProvider, theme as antdTheme } from 'antd';
import { loader } from "@monaco-editor/react";

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
}).catch((err) => {
  console.error("Monaco init failed:", err);
});


ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <ConfigProvider
    theme={{
      algorithm: antdTheme.darkAlgorithm,
      cssVar: { prefix: '' },
      components: {
        Tree: {
          indentSize: 8,
        },
        Checkbox: {
          colorBorder: "#595959",
        },
      },
      token: antdTokens,
    }}>
    <App />
  </ConfigProvider>
  // </React.StrictMode>
);