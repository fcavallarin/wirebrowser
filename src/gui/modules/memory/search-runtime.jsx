import { useState, useEffect, useRef } from "react";
import { Button, Input, Form } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import PageSelector from "@/components/page-selector";
import DynamicTabs from "@/components/dynamic-tabs";
import SearchRuntimeHelpTab from "@/modules/memory/help-tabs/search-runtime";
import { TextSearchInputFormItem } from "@/components/text-search-input.jsx";
import { useHelpTab } from "@/hooks/useHelpTab";
import { InfoCircleOutlined } from "@ant-design/icons";
import { jsonStringify } from "@/utils";


const SearchRuntimeTab = ({ onAddHelpTab }) => {
  const [isLoading, setIsLoding] = useState(false);
  const [resultValue, setResultValue] = useState("");
  const [form] = Form.useForm();

  const { dispatchApiEvent } = useApiEvent({
    "heap.searchRuntimeResult": (data) => {
      setResultValue(jsonStringify(data, true));
      setIsLoding(false);
    }
  });

  const onFinish = (values) => {
    setIsLoding(true);
    dispatchApiEvent("heap.searchRuntime", {
      pageId: values.pageId,
      root: values.root,
      propertySearch: values.propertySearch,
      valueSearch: values.valueSearch
    })
  };

  return (
    <div className="h-[calc(100vh-120px)]">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={20} minSize={10}>
          <Form form={form} onFinish={onFinish} layout="vertical">
            <Form.Item label="Page" name="pageId">
              <PageSelector multiple={false} />
            </Form.Item>
            <Form.Item
              name="root"
              label="Root element"
            >
              <Input
                className="!w-full !min-w-30"
                placeholder="ex: window.obj"
              />
            </Form.Item>

            <TextSearchInputFormItem label="Property" name="propertySearch" />
            <TextSearchInputFormItem label="Value" name="valueSearch" />
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={isLoading}>
                Search
              </Button>
            </Form.Item>
          </Form>
          <div className="text-text-secondary-800 italic mt-10">
            Search live objects in the browser’s runtime from a known root (e.g., window) and get their exact access paths.
            <Button type="text" icon={<InfoCircleOutlined />}
              onClick={onAddHelpTab}
            />
          </div>
        </Panel>
        <PanelResizeHandle className="w-2" />
        <Panel>
          <CodeEditor
            value={resultValue}
            showActions={true}
          />
        </Panel>
      </PanelGroup>
    </div>
  );
}


const SearchRuntime = () => {
  const tabsRef = useRef(null);
  const { addHelpTab } = useHelpTab("memory", "search-runtime", <SearchRuntimeHelpTab />)

  const addTab = () => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <SearchRuntimeTab onAddHelpTab={() => addHelpTab(tabsRef, true)} />
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
      label="Search"
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

export default SearchRuntime;