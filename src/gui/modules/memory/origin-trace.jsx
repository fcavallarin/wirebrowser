import { useState, useEffect, useRef, cloneElement } from "react";
import { Button, Tabs, InputNumber } from "antd";
import { useApiEvent, useEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import LogViewer from "@/components/log-viewer";
import PageSelector from "@/components/page-selector";
import DynamicTabs from "@/components/dynamic-tabs";
import OriginTraceHelpTab from "@/modules/memory/help-tabs/origin-trace";
import { useHelpTab } from "@/hooks/useHelpTab";
import { InfoCircleOutlined } from "@ant-design/icons";
import { showNotification } from "@/utils";
import { useGlobal } from "@/global-context";
import SearchObjectFormItems, { validateSearchObjectFormItems } from "@/components/searchobject-formitems";
import Form from "@/components/safe-form";
import CodeEditor from "@/components/code-editor";
import Table from "@/components/table";


const OriginTraceTab = ({ onAddHelpTab, formValues }) => {
  const { pages } = useGlobal();
  const [isLoading, setIsLoding] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [editorValue, setEditorValue] = useState(null);
  const [form] = Form.useForm();
  const logViewerRef = useRef();
  const [activeTabKey, setActiveTabKey] = useState();
  const resultEditorRef = useRef();
  const scanStep = useRef(0);
  const currentPage = useRef(formValues?.pageId || null);
  const tableRef = useRef();
  const searchResults = useRef();

  const colDefs = [
    { field: "id", headerName: "#", width: 50 },
    { field: "file", flex: 1, headerName: "File", filter: "agTextColumnFilter" },
    { field: "functionName", width: 180, headerName: "Function", filter: "agTextColumnFilter" },
    { field: "lineNumber", width: 100, headerName: "Line", filter: "agNumberColumnFilter" },
    { field: "columnNumber", width: 100, headerName: "Column", filter: "agNumberColumnFilter" },
    { field: "highlight", width: 70, hide: true },
    { field: "color", width: 70, hide: true },
  ];


  const { dispatchApiEvent } = useApiEvent({
    "heap.BDHSStatus": ({ currentStep, message }) => {
      scanStep.current = currentStep;
      log(message);
    },
    "heap.BDHSError": ({ currentStep, reason }) => {
      scanStep.current = currentStep;
      logErr(`Error: ${reason}`);
    },
    "heap.BDHSResult": ({ currentStep, matchResult, results }) => {
      scanStep.current = currentStep;
      if (!results) {
        logErr("Not found");
      } else {
        searchResults.current = new Map();
        let id = 1;
        let selectedRowIdx = 0;
        let color;
        const tblData = [];
        for (const res of results) {
          searchResults.current.set(id, res);
          if (res.isFirstMatch) {
            color = "green";
            selectedRowIdx = id - 1;
          } else {
            color = "";
          }
          tblData.push({ id: `${id}`, color, ...res });
          id++;
        }
        tableRef.current.clear();
        tableRef.current.addRows(tblData);
        setActiveTabKey("result")
        log(`Found`);
        setTimeout(() => {
          tableRef.current.selectRowByIndex(selectedRowIdx);
        }, 500);

      }
      setIsLoding(false);
      setIsStopping(false);

    },
    "heap.BDHSArmed": ({ pageId }) => {
      dispatchApiEvent("heap.getDebuggerParsedScripts", { pageId });
    },
    "heap.BDHSFinished": ({ currentStep, scanTime }) => {
      setIsLoding(false);
      setIsStopping(false);
      log(`Finished in ${Math.round(scanTime / 1000)} seconds`)
    },
    "heap.getDebuggerParsedScriptsResult": ({ scripts }) => {
      let cnt = 0;
      let bcnt = 0;
      for (const s of scripts) {
        const { url, blacklisted } = s;
        if (blacklisted) {
          log(`Blacklisted file: ${fileFromUrl(url)}`);
          bcnt++;
        }
        cnt++;
      }
      log(`Trace Armed: Click the target element to begin.`)
      log(`Please close Chrome DevTools before starting. DevTools interferes with breakpoint-driven tracing.`)
      log(`Do not interact with the page during the trace. Any extra input may disrupt the breakpoint sequence.`)
      log(`Parsed scripts: ${cnt}, blacklisted: ${bcnt}`);
    }

  });

  const fileFromUrl = (url) => {
    const purl = new URL(url);
    return `${purl.pathname}${purl.search}`;
  }

  useEffect(() => {
    if (!editorValue) {
      return;
    }
    resultEditorRef.current.showPosition(
      editorValue.lineNumber,
      editorValue.columnNumber,
      editorValue.functionName.length + 5
    );
  }, [editorValue]);

  const log = (str) => {
    const text = scanStep.current > 0 ? `Step ${scanStep.current}: ${str}` : str;
    logViewerRef.current.addData({ type: "log", text });
  }
  const logErr = (str) => {
    logViewerRef.current.addData({ type: "error", text: `Step ${scanStep.current}: ${str}` });
  }
  const onFinish = (values) => {
    const validationErrors = validateSearchObjectFormItems(values);
    if (!values.pageId) {
      validationErrors.push("Page ID is not set");
    }
    if (validationErrors.length > 0) {
      showNotification({
        type: "error",
        message: "Form Error",
        description: validationErrors[0]
      });
      return;
    }
    setIsLoding(true);
    currentPage.current = values.pageId;
    scanStep.current = 0;
    setEditorValue(null);
    dispatchApiEvent("heap.startBDHS", values);
  };

  const stopScan = () => {
    log("Stop requested");
    setIsStopping(true);
    dispatchApiEvent("heap.stopBDHS");

  };

  const handleRowSelection = (row) => {
    const {
      functionName,
      lineNumber,
      columnNumber,
      scriptSource
    } = searchResults.current.get(Number(row.id));
    setEditorValue({
      scriptSource,
      lineNumber,
      columnNumber,
      functionName
    })
  }

  const tabItems = [
    {
      key: 'log',
      label: 'Trace log',
      forceRender: true,
      children: <LogViewer
        ref={logViewerRef}
        markers={{
          error: "[!] ",
          warn: "[-] ",
          log: "[*] "
        }}
        highlightRules={[
          { regex: /^\[\!\].*/gm, className: "console-log-error" },
          { regex: /^\[\-\].*/gm, className: "console-log-warning" },
          { regex: /^\[\*\]/gm, className: "console-log-success" }
          // { regex: new RegExp(`^${RegExp.escape(logViewerMarkers.error)}.*`, "gm"), className: "console-log-error" },
          // { regex: new RegExp(`^${RegExp.escape(logViewerMarkers.warn)}.*`, "gm"), className: "console-log-warning" },
          // { regex: new RegExp(`^${RegExp.escape(logViewerMarkers.log)}`, "m"), className: "console-log-success" }
        ]}
      />
    },
    {
      key: 'result',
      label: 'Trace result',
      forceRender: true,
      children:
        <PanelGroup direction="vertical">
          <Panel defaultSize={20} minSize={20}>
            <Table
              colDefs={colDefs}
              ref={tableRef}
              onRowSelected={handleRowSelection}
            />
          </Panel>
          <PanelResizeHandle className="h-2" />
          <Panel>
            <CodeEditor
              ref={resultEditorRef}
              lineWrap={false}
              value={editorValue?.scriptSource}
              showActions={true}
              language="javascript"
              showMinimap={true}
              stickyScroll={false}
            />
          </Panel>
        </PanelGroup>
    }
  ]

  return (
    <div className="h-full">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={30} minSize={20}>
          <div className="h-full overflow-auto relative">
            <Form
              form={form}
              onFinish={onFinish}
              layout="vertical"
              disabled={isLoading}
              initialValues={{
                pageId: pages && pages.length > 0 ? pages[0] : "1",
                searchMode: "global",  // "global or "byroot"
                osEnabled: false,
                osIncludeValues: false,
                osObject: "{}",
                osThreshold: 0.8,
                osAlpha: 0.3,
                toleranceWinBefore: 3,
                toleranceWinAfter: 10,
                ...(formValues || {})
              }}>
              <Form.Item
                label="Page"
                name="pageId"
                rules={[{ required: false, message: "Select page" }]}
              >
                <PageSelector multiple={false} />
              </Form.Item>
              <div className="mb-3">Search criteria</div>
              <SearchObjectFormItems />
              <div className="mt-6 mb-1 flex flex-row pl-3 pr-3">
                <div className="mb-0">
                  <Form.Item
                    className="!mb-0"
                    label="Steps Before"
                    name="toleranceWinBefore"
                  >
                    <InputNumber min="0" max="100" />
                  </Form.Item>
                </div>
                <div className="ml-auto mb-0">
                  <Form.Item
                    className="!mb-0"
                    label="Steps After"
                    name="toleranceWinAfter"
                  >
                    <InputNumber min="0" max="100" />
                  </Form.Item>
                </div>
              </div>
              <div className="mt-0 italic">
                The  range represents the number of debugger
                steps captured around the first heap match.
              </div>
              <div className="mt-6 flex flex-row gap-3">
                <Button disabled={!isLoading || isStopping} onClick={stopScan}>
                  Stop Trace
                </Button>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={isLoading}>
                    Scan Trace
                  </Button>
                </Form.Item>
              </div>
            </Form>
            <div className="absolute top-0 right-0">
              {onAddHelpTab && <Button type="text" icon={<InfoCircleOutlined />}
                onClick={onAddHelpTab}
              />}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="w-2" />
        <Panel>
          <Tabs
            animated={false}
            tabBarStyle={{ height: '25px', margin: '4px' }}
            items={tabItems}
            className="flex flex-col flex-1 overflow-hidden"
            activeKey={activeTabKey}
            onChange={(tabKey) => setActiveTabKey(tabKey)}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}


const OriginTrace = () => {
  const tabsRef = useRef(null);
  const { addHelpTab } = useHelpTab("memory", "origin-trace", <OriginTraceHelpTab />)

  const addTab = (formValues) => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <OriginTraceTab
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

  return (
    <DynamicTabs
      ref={tabsRef}
      hideAdd={false}
      label="Trace"
      noDataHelper={
        <Button className="mt-10" type="primary" onClick={addTab}>
          New Search
        </Button>
      }
      onCloseTab={(key) => {
      }}
      onAddTabRequest={() => {
        addTab();
      }}
    />
  );
}

export default OriginTrace;