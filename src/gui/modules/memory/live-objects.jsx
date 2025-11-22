import { useState, useEffect, useRef } from "react";
import { Button, Form, Select, Input, Popover } from "antd";
import { useApiEvent, useEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import SearchObjectFormItems from "@/components/searchobject-formitems";
import DynamicTabs from "@/components/dynamic-tabs";
import SearchClassesHelpTab from "@/modules/memory/help-tabs/search-classes";
import { useHelpTab } from "@/hooks/useHelpTab";
import { InfoCircleOutlined, PlayCircleOutlined, PauseCircleOutlined, StepForwardOutlined } from "@ant-design/icons";
import { jsonStringify, showNotification } from "@/utils";
import { useGlobal } from "@/global-context";
import PageSelector from "@/components/page-selector";
import Table from "@/components/table";
import ColorDot from "@/components/color-dot";
import { setConsole } from "@/utils";
import useFloatingPopover from "@/hooks/useFloatingPopover";
import AutoFocus from "@/components/AutoFocus";

const LiveObjectsTab = ({ onAddHelpTab, formValues }) => {
  const { pages } = useGlobal();
  const [isLoading, setIsLoding] = useState(false);
  const [isScriptLoading, setIsScriptLoding] = useState(false);
  const [resultValue, setResultValue] = useState("");
  const [scriptValue, setScriptValue] = useState("");
  const [form] = Form.useForm();
  const [showRootField, setShowRootField] = useState(false);
  const searchResults = useRef(null);
  const tableRef = useRef();
  const [currentPage, setCurrentPage] = useState(formValues?.pageId || null);
  const [isExecuteEnabled, setIsExecuteEnabled] = useState(false);
  const { openFloatingPopover, closeFloatingPopover, FloatingPopover } = useFloatingPopover();
  const [isDebuggerPaused, setIsDebuggerPaused] = useState(false);
  const colDefs = [
    { field: "id", headerName: "#", width: 50 },
    { field: "obj", flex: 1, headerName: "Object", filter: "agTextColumnFilter" },
    { field: "className", width: 100, headerName: "Class", filter: "agTextColumnFilter" },
    { field: "varName", width: 100, headerName: "Var Name", filter: "agTextColumnFilter" },
    { field: "highlight", width: 70, hide: true },
    { field: "color", width: 70, hide: true },
    { field: "similarity", width: 100, filter: "agNumberColumnFilter", },
  ];


  const { dispatchApiEvent } = useApiEvent({
    "heap.searchLiveObjectsResult": (data) => {
      searchResults.current = new Map();
      let id = 1;
      const tblData = [];
      for (const res of data.results) {
        searchResults.current.set(id, res);
        tblData.push({ id, varName: "", ...res, obj: JSON.stringify(res.obj) });
        id++;
      }
      setIsLoding(false);
      tableRef.current.clear();
      tableRef.current.addRows(tblData);

    },
    "automation.runScriptResult": (data) => {
      setConsole(true, currentPage);
      setIsScriptLoding(false);
    },
    "heap.exposeObjectResult": (data) => {
      if (data !== "ok") {
        showNotification({
          type: "error",
          message: "CDP Error",
          description: `Failed to get live object reference`
        });
      }
    },
    "heap.debuggerPauseResult": (data) => {
      if (data === "ok") {
        setIsDebuggerPaused(true);
      }
    },
    "heap.debuggerResumeResult": (data) => {
      if (data === "ok") {
        setIsDebuggerPaused(false);
      }
    },
    "heap.debuggerStepIntoResult": (data) => { },
  });

  const onFinish = (values) => {
    tableRef.current.clear();
    setResultValue("");
    setScriptValue("");
    setIsLoding(true);
    setIsExecuteEnabled(false);
    setCurrentPage(values.pageId);
    dispatchApiEvent("heap.searchLiveObjects", values);
  };

  const onValuesChange = (_, values) => {
    setShowRootField(values.searchMode === "byroot");
  }

  const handleRowSelection = (row) => {
    const { obj, objectId } = searchResults.current.get(row.id);
    const res = [
      "// The live object is stored under window._wbtemp",
      "// console.log(window._wbtemp);",
      "",
      "// Live object update:",
      `// window._wbtemp.${Object.keys(obj)[0]} = "X";`,
      "",
      `const matchedObject = ${jsonStringify(obj, true)};`,
    ].join("\n");
    setResultValue(res);
    setScriptValue(res);
    dispatchApiEvent("heap.exposeObject", {
      pageId: currentPage,
      objectId,
      varName: "_wbtemp"
    });
    setIsExecuteEnabled(true);
  }

  const highlightRow = (row, v) => {
    const req = searchResults.current.get(row.id);
    const rowNode = tableRef.current.getRowNode(row.id);
    const color = v.key !== "none" ? v.key : null;
    rowNode.setDataValue('color', color);
    req.color = color;
  }

  const executeScript = () => {
    setIsScriptLoding(true);
    dispatchApiEvent("automation.runScript", {
      pageIds: [currentPage],
      content: scriptValue
    });
  }

  const debuggerToggle = () => {
    const pageId = currentPage || (pages && pages.length > 0 ? pages[0] : "1");
    dispatchApiEvent(isDebuggerPaused ? "heap.debuggerResume" : "heap.debuggerPause", { pageId });
  }

  const debuggerStepInto = () => {
    const pageId = currentPage || (pages && pages.length > 0 ? pages[0] : "1");
    dispatchApiEvent("heap.debuggerStepInto", { pageId });
  }


  const menuItems = [
    {
      key: "store-variable", label: `Store as Global Variable`, onClick: (data, event) => {
        openFloatingPopover(event.domEvent.clientX, event.domEvent.clientY, { id: data.id });
      }
    },
    {
      key: "highlight", label: `Highlight`, onClick: highlightRow,
      children: ["red", "blue", "yellow", "green", "none"].map(c => (
        {
          key: c, label: <ColorDot color={c} />,
        })
      ),
    },
  ];

  return (
    <>
      <div className="h-full">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={30} minSize={20}>
            <div className="h-full overflow-auto">
              <Form
                form={form}
                onFinish={onFinish}
                onValuesChange={onValuesChange}
                layout="vertical"
                initialValues={{
                  pageId: pages && pages.length > 0 ? pages[0] : "1",
                  searchMode: "global",  // "global or "byroot"
                  osEnabled: false,
                  osIncludeValues: false,
                  osObject: "{}",
                  osThreshold: 0.8,
                  osAlpha: 0.3,
                  ...(formValues || {})
                }}>
                <Form.Item
                  label="Page"
                  name="pageId"
                  rules={[{ required: false, message: "Select pages" }]}
                >
                  <PageSelector multiple={false} />
                </Form.Item>

                <Form.Item
                  label="Search Mode"
                  name="searchMode"
                >
                  <Select
                    className="min-w-30"
                    options={[
                      { value: "global", label: "Global (all live objects)" },
                      { value: "byroot", label: "By root (descendants of root)" }
                    ]}
                  />
                </Form.Item>
                <div className={`${!showRootField ? "h-0" : ""} overflow-hidden`}>
                  <Form.Item
                    label="Root object"
                    name="root"
                  >
                    <Input placeholder="window.object1" />
                  </Form.Item>
                </div>
                <div className="mb-3">Search criteria</div>
                <SearchObjectFormItems />
                <div className="mt-6">
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={isLoading}>
                      Search
                    </Button>
                  </Form.Item>
                </div>
              </Form>
            </div>
            <div className="text-text-secondary-800 italic mt-10">
              List all live objects in memory that share a specific prototype — a simple wrapper around page.queryObjects().
              <Button type="text" icon={<InfoCircleOutlined />}
                onClick={onAddHelpTab}
              />
            </div>
          </Panel>
          <PanelResizeHandle className="w-2" />
          <Panel>
            <PanelGroup direction="vertical">
              <Panel defaultSize={30} minSize={20}>
                <Table
                  colDefs={colDefs}
                  ref={tableRef}
                  menuItems={menuItems}
                  onRowSelected={handleRowSelection}
                />
              </Panel>
              <PanelResizeHandle className="h-2" />
              <Panel>
                <div className="h-[calc(100%-50px)]">
                  <CodeEditor
                    value={resultValue}
                    showActions={true}
                    language="javascript"
                    onChange={(v) => setScriptValue(v)}
                  />
                </div>
                <div className="h-40 mt-2 text-right">
                  <div className="flex flex-row gap-2">
                    <span
                      className="hover:text-primary text-xl"
                      onClick={() => debuggerToggle()}
                      title={isDebuggerPaused ? "Resume" : "Pause script execution"}
                    >
                      {isDebuggerPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                    </span>
                    <span
                      className={`text-xl ${!isDebuggerPaused ? "opacity-30" : "hover:text-primary"}`}
                      onClick={() => debuggerStepInto()}
                      title="Step next function call"
                    >
                      <StepForwardOutlined />
                    </span>
                  </div>)
                  <Button
                    loading={isScriptLoading}
                    type="primary"
                    onClick={() => executeScript()}
                    disabled={!isExecuteEnabled}
                  >
                    Execute
                  </Button>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div >

      <FloatingPopover>
        {ctx => (
          <div className="flex flex-row items-end">
            window.<AutoFocus><Input
              defaultValue=""
              placeholder="Variable name"
              onPressEnter={(e) => {
                const { objectId } = searchResults.current.get(ctx.id);
                const rowNode = tableRef.current.getRowNode(ctx.id);
                rowNode.setDataValue('varName', e.target.value);
                dispatchApiEvent("heap.exposeObject", {
                  pageId: currentPage,
                  objectId,
                  varName: e.target.value
                });
                closeFloatingPopover();
              }}
              onKeyDown={(e) => e.key === "Escape" && closeFloatingPopover()}
            /></AutoFocus>
          </div >
        )}
      </FloatingPopover>
    </>
  );
}


const LiveObjects = () => {
  const tabsRef = useRef(null);
  const { addHelpTab } = useHelpTab("memory", "search-classes", <SearchClassesHelpTab />)

  const addTab = (formValues) => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <LiveObjectsTab
          onAddHelpTab={() => addHelpTab(tabsRef, true)}
          formValues={formValues}
        />
      );
    }
  };

  useEffect(() => {
    addTab();
    addHelpTab(tabsRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEvent("memory.searchLiveObject", (data) => {
    addTab(data);
  });



  return (
    <DynamicTabs
      ref={tabsRef}
      hideAdd={false}
      label="Search"
      noDataHelper={
        < Button className="mt-10" type="primary" onClick={addTab} >
          New Search
        </Button >
      }
      onCloseTab={(key) => {
      }}
      onAddTabRequest={() => {
        addTab();
      }}
    />
  );
}

export default LiveObjects;