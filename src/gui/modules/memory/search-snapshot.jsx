import { useState, useEffect, useRef, cloneElement } from "react";
import { Button, Input, Form } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import PageSelector from "@/components/page-selector";
import DynamicTabs from "@/components/dynamic-tabs";
import SearchSnapshotHelpTab from "@/modules/memory/help-tabs/search-snapshot";
import { TextSearchInputFormItem } from "@/components/text-search-input.jsx";
import { useHelpTab } from "@/hooks/useHelpTab";
import { InfoCircleOutlined } from "@ant-design/icons";
import { jsonStringify } from "@/utils";

const SearchSnapshotTab = ({ onAddHelpTab }) => {
  const [isLoading, setIsLoding] = useState(false);
  const [resultValue, setResultValue] = useState("");
  const [form] = Form.useForm();

  const { dispatchApiEvent } = useApiEvent({
    "heap.searchSnapshotResult": (data) => {
      setResultValue(jsonStringify(data, true));
      setIsLoding(false);
    }
  });

  const onFinish = (values) => {
    setIsLoding(true);
    dispatchApiEvent("heap.searchSnapshot", {
      pageId: values.pageId,
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

            <TextSearchInputFormItem label="Property" name="propertySearch" />
            <TextSearchInputFormItem label="Value" name="valueSearch" />
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={isLoading}>
                Search
              </Button>
            </Form.Item>
          </Form>
          <div className="text-text-secondary-800 italic mt-10">
            Explore a captured heap snapshot to find objects by keys or values,
            even if they’re not directly reachable from globals.
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


const SearchSnapshot = () => {
  const tabsRef = useRef(null);
  const { addHelpTab } = useHelpTab("memory", "search-snapshot", <SearchSnapshotHelpTab />)

  const addTab = () => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <SearchSnapshotTab onAddHelpTab={() => addHelpTab(tabsRef, true)} />
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

export default SearchSnapshot;