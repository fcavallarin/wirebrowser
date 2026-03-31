import { useState, useEffect, useRef } from "react";
import { Button } from "antd";
import { useApiEvent, useEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import DynamicTabs from "@/components/dynamic-tabs";
import { useGlobal } from "@/global-context";
import CodeEditor from "@/components/code-editor";
import FileList from "@/components/file-list";
import MainTabs from "@/components/main-tabs";
import { ReloadOutlined } from "@ant-design/icons";

const SourceTab = ({ pageId, scriptId }) => {
  const [isLoading, setIsLoding] = useState(false);
  const [scriptSource, setScriptSource] = useState("");

  const { dispatchApiEvent } = useApiEvent({
    "debugger.getScriptSourceResult": (data) => {
      const { source } = data;
      setIsLoding(false);
      setScriptSource(source);
    }
  });

  useEffect(() => {
    setIsLoding(true);
    dispatchApiEvent("debugger.getScriptSource", { pageId, scriptId });
  }, []);

  if (isLoading) {
    return (
      <div>Loading source</div>
    );
  }
  return (
    <CodeEditor
      value={scriptSource}
      showActions={true}
      language="javascript"
      showAutocomplete={false}
      readOnly={true}
    />
  );
}


const PageSourcesTab = ({ pageId }) => {
  const [isLoading, setIsLoding] = useState(false);
  const tabsRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsedScripts, setParsedScripts] = useState(null);

  const { dispatchApiEvent } = useApiEvent({
    "debugger.getParsedScriptsResult": ({ scripts }) => {
      setIsLoding(false);
      let id = 2;
      let curParent;
      const files = [
        { id: 1, name: "/", type: "dir", parentId: null, meta: {} }
      ];
      for (const file of scripts) {
        const purl = new URL(file.url);
        const path = `${purl.host}/${purl.pathname}`.split("/").filter(Boolean);
        curParent = 1;
        for (let i = 0; i < path.length; i++) {
          const curFiles = files.filter(f => f.parentId === curParent);
          const curDir = curFiles.find(f => f.name === path[i]);
          if (curDir) {
            curParent = curDir.id;
            continue;
          }
          const isFile = i == path.length - 1;
          const newFile = {
            id: id++,
            type: isFile ? "file" : "dir",
            parentId: curParent,
            name: `${path[i]}${isFile ? purl.search : ""}`,
            meta: { scriptId: file.scriptId }
          }
          curParent = newFile.id;
          files.push(newFile);
        }
      }
      // console.log(files)
      setParsedScripts(files);
    },
    "pageNavigated": (data) => {
      if (data.pageId == pageId) {
        setParsedScripts(null);
      }
    }
  });

  const getSources = () => {
    setIsLoding(true);
    setParsedScripts([]);
    dispatchApiEvent("debugger.getParsedScripts", { pageId });
  };

  useEffect(() => {
    if (selectedFile) {
      addTab(selectedFile);
    }
  }, [selectedFile]);

  const addTab = (fileId) => {
    const file = parsedScripts.find(f => f.id === fileId);
    if (tabsRef.current && file) {
      const tab = tabsRef.current.getTab(file.id)
      if (tab) {
        tabsRef.current.selectTab(tab.key);
        return;
      }
      tabsRef.current.addTab(
        <SourceTab scriptId={file.meta.scriptId} pageId={pageId} />,
        file.name,
        file.id
      );
    }
  };

  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={25} minSize={18}>
        {isLoading ? (
          <span>Loading Sources</span>
        ) : (
          <div className="relative h-full flex flex-col overflow-auto">
            <div className="flex-1">
              <FileList
                files={parsedScripts}
                onSelectFile={(fileId) => setSelectedFile(fileId)}
                selected={selectedFile}
                readOnly={true}
              />
            </div>
            <div className="absolute top-0 right-0">
              {parsedScripts !== null && (
                <Button icon={<ReloadOutlined />} type="text" onClick={() => { getSources() }}>Refresh</Button>
              )}
            </div>
          </div>
        )}
      </Panel>
      <PanelResizeHandle className="w-2" />
      <Panel>
        <DynamicTabs
          ref={tabsRef}
          hideAdd={true}
          label="Source"
          confirmClose={false}
          noDataTitle={parsedScripts === null && <Button type="primary" onClick={() => { getSources() }}>Load Sources</Button>}
          onCloseTab={(key) => {
            if (selectedFile === key) {
              setSelectedFile(null);
            }
          }}
          onSelectTab={(key) => {
            if (Number.isNaN(Number(key))) {
              return;
            }
            setSelectedFile(key);
          }}
        />
      </Panel>
    </PanelGroup>

  );
}

const Sources = () => {
  const { pages } = useGlobal();
  const pagesTabs = useRef(new Map());
  const [tabItems, setTabItems] = useState([]);
  const [selectedPage, setSelectedPage] = useState(undefined);

  useEffect(() => {
    const tabs = [];

    for (const pid of pagesTabs.current.keys()) {
      if (!pages.includes(pid)) {
        pagesTabs.current.delete(pid);
      }
    }

    for (const p of pages) {
      if (pagesTabs.current.has(p)) {
        continue;
      }
      tabs.push({
        key: p,
        label: `Page ${p}`,
        forceRender: true,
        children: <PageSourcesTab ref={r => {
          pagesTabs.current.set(p, r);
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

  return (
    tabItems.length > 0
      ? <MainTabs
        animated={false}
        className="flex flex-col flex-1 overflow-hidden"
        activeKey={selectedPage}
        onChange={key => setSelectedPage(key)}
        items={tabItems}
      />
      : <div></div>
  );
}

export default Sources;