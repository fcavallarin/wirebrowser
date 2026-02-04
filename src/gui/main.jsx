import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import antdTokens from "@/themes/dark/antd-tokens";
import { ConfigProvider, theme as antdTheme } from 'antd';
import { bootstrapMonaco } from '@/monaco/bootstrap'

bootstrapMonaco();

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