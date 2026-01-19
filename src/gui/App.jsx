import { useState, useEffect } from "react";
import { Layout, Space, notification, Modal } from 'antd';
import '@ant-design/v5-patch-for-react-19';
import { GlobalContext } from "@/global-context";
import { dispatchGlobalApiEvent, dispatchEvent } from "@/utils";
import Network from "@/modules/network";
import Memory from "@/modules/memory";
import Automation from "@/modules/automation";
import StartPage from "@/components/start-page";
import SettingsModal from "@/components/settings-modal";
import ScratchpadModal from "@/components/scratchpad-modal";
import Console from "@/components/console";
import { SettingOutlined, SignatureOutlined, CodeOutlined } from "@ant-design/icons";
import ApiCollection from "./modules/api-collection";
import Tools from "./modules/tools";
import MainTabs from "@/components/main-tabs";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import UpdatesChecker from "@/components/updates-checker";

function App() {
  const [isBrowserRunning, setIsBrowserRunning] = useState(false);
  const [pages, setPages] = useState([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationApi, notificationContextHolder] = notification.useNotification({ stack: true });
  const [settings, setSettings] = useState(null);
  const [modal, modalContextHolder] = Modal.useModal();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [chromeInstallData, setChromeInstallData] = useState(null);
  const [appSettings, setAppSettings] = useState(null);

  const addPage = (pageId) => {
    setPages(prev => [...prev, pageId]);
  }

  const updateSettings = (newSettings, value) => {
    if (typeof newSettings === 'string' && value !== undefined) {
      setSettings(cur => {
        const next = { ...cur };
        newSettings.split('.').reduce((acc, key, i, arr) => {
          if (i === arr.length - 1) {
            acc[key] = value;
          } else {
            acc[key] = acc[key] || {};
          }
          return acc[key];
        }, next);
        dispatchGlobalApiEvent("settings.set", next);
        return next;
      });
    } else {
      setSettings({ ...newSettings });
      dispatchGlobalApiEvent("settings.set", newSettings);
    }
  };

  const updateAppSettings = (newSettings) => {
    setAppSettings({ ...newSettings });
    dispatchGlobalApiEvent("appSettings.set", newSettings);
  };

  const removePage = (pageId) => {
    setPages(prev => prev.filter((p) => p !== pageId));
  };

  const tabItems = [
    {
      key: "network",
      label: "Network",
      children: <Network />
    },
    {
      key: "memory",
      label: "Memory",
      children: <Memory />
    },
    {
      key: "automation",
      label: "Automation",
      children: <Automation />
    },
    {
      key: "apicollection",
      label: "API Collection",
      children: <ApiCollection />
    },
    {
      key: "tools",
      label: "Tools",
      children: <Tools />
    },

  ]

  useEffect(() => {
    if (showNotification) {
      notificationApi[showNotification.type || "info"]({
        message: showNotification.message,
        description: showNotification.description
      });
    }
  }, [showNotification]);

  useEffect(() => {
    const notificationsListener = (e) => {
      setShowNotification(e.detail.data)
    };

    const setConsoleListener = (e) => {
      setIsConsoleOpen(e.detail.data.visible);
      if (e.detail.data.selectedPage) {
        dispatchEvent("consoleSelectPage", e.detail.data.selectedPage);
      }
    };

    window.addEventListener(`notification`, notificationsListener);
    window.addEventListener(`setConsole`, setConsoleListener);
    window.electronAPI.onMessage((msg) => {
      switch (msg.event) {
        case "newPage":
          addPage(`${msg.data}`);
          break;
        case "pageClosed":
          removePage(`${msg.data}`);
          break;
        case "browserRunning":
          setIsBrowserRunning(true);
          break;
        case "loadSettings":
          setSettings(msg.data);
          break;
        case "loadAppSettings":
          setAppSettings(msg.data);
          break;
        case "installingChrome":
          setChromeInstallData(msg.data);
          break;
        case "installingChromeDone":
          setChromeInstallData(null);
          break;
        case "Error":
          setShowNotification({
            type: "error",
            message: "Backend Error",
            description: msg.data
          });
          break;
        default:
          window.dispatchEvent(new CustomEvent(`api.${msg.event}`, { detail: msg }));
      }
    });
    window.electronAPI.ready();
    return () => {
      window.removeEventListener(`notification`, notificationsListener);
      window.removeEventListener(`setConsole`, setConsoleListener);
    };

  }, [setShowNotification]);

  const { Content } = Layout;
  return (
    <GlobalContext.Provider value={{ pages, settings, updateSettings, modal, appSettings, updateAppSettings }}>
      {notificationContextHolder}
      {modalContextHolder}
      <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ScratchpadModal open={isScratchpadOpen} onClose={() => setIsScratchpadOpen(false)} />

      {!isBrowserRunning ? (
        <StartPage chromeInstallData={chromeInstallData} />
      ) : (
        <Layout className="h-screen bg-gray-200 flex flex-col">
          <Content className="pt-1 pb-1 pl-2 pr-2 flex-1" >
            <PanelGroup direction="vertical">
              <Panel >
                <MainTabs defaultActiveKey="network"
                  items={tabItems}
                  tabBarExtraContent={{
                    right: (<Space>
                      <UpdatesChecker />
                      <span
                        className="hover:text-primary"
                        onClick={() => setIsConsoleOpen(cur => !cur)}
                        title="Toggle Console"
                      >
                        <CodeOutlined />
                      </span>
                      <span
                        className="hover:text-primary"
                        onClick={() => setIsScratchpadOpen(true)}
                        title="Scratchpad"
                      >
                        <SignatureOutlined />
                      </span>
                      <span
                        className="hover:text-primary"
                        onClick={() => setIsSettingsOpen(true)}
                        title="Settings"
                      >
                        <SettingOutlined />
                      </span>
                    </Space>)
                  }}

                />
              </Panel>
              <PanelResizeHandle className={`h-${isConsoleOpen ? "2" : "0"} border-b-2 border-border-600`} />
              <Panel maxSize={isConsoleOpen ? 80 : 0} minSize={isConsoleOpen ? 25 : 0}>
                <Console />
              </Panel>
            </PanelGroup>
          </Content>
        </Layout>
      )}
    </GlobalContext.Provider>
  );
}

export default App;
