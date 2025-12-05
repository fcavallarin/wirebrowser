import { useState, useEffect, useRef } from "react";
import { useApiEvent, useEvent } from "@/hooks/useEvents.js";
import { Tabs } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { useGlobal } from "@/global-context";
import LogViewer from "@/components/log-viewer";
import { setConsole } from "@/utils";


const PageConsole = ({ pageId, ref }) => {
  const logViewerMarkers = {
    error: "❗",
    execerror: "⛔",
    warn: "▲"
  }

  return (
    <LogViewer
      ref={ref}
      markers={logViewerMarkers}
      highlightRules={[
        { regex: new RegExp(`^${logViewerMarkers.error}.*`, "gm"), className: "console-log-error" },
        { regex: new RegExp(`^${logViewerMarkers.execerror}.*`, "gm"), className: "console-log-error" },
        { regex: new RegExp(`^${logViewerMarkers.warn}.*`, "gm"), className: "console-log-warning" },
      ]}
    />
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