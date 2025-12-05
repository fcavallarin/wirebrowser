import { useState, useEffect, useRef, cloneElement } from "react";
import { Button, Input } from "antd";
import { useApiEvent, useEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import PageSelector from "@/components/page-selector";
import DynamicTabs from "@/components/dynamic-tabs";
import SearchSnapshotHelpTab from "@/modules/memory/help-tabs/search-snapshot";
import { TextSearchInputFormItem } from "@/components/text-search-input.jsx";
import { useHelpTab } from "@/hooks/useHelpTab";
import { InfoCircleOutlined } from "@ant-design/icons";
import { jsonStringify, showNotification } from "@/utils";
import { useGlobal } from "@/global-context";
import SearchObjectFormItems, { validateSearchObjectFormItems } from "@/components/searchobject-formitems";
import Form from "@/components/safe-form";
import SnapshotExplorer from "@/components/snapshot-explorer";

const SearchSnapshotTab = ({ onAddHelpTab, formValues }) => {
  const { pages } = useGlobal();
  const [isLoading, setIsLoding] = useState(false);
  const [resultValue, setResultValue] = useState(null);
  const [form] = Form.useForm();

  const { dispatchApiEvent } = useApiEvent({
    "heap.searchSnapshotResult": (data) => {
      //setResultValue(jsonStringify(data, true));
      setResultValue(data);
      setIsLoding(false);
    }
  });

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
    dispatchApiEvent("heap.searchSnapshot", values);
  };

  return (
    <div className="h-full">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={30} minSize={20}>
          <div className="h-full overflow-auto relative">
            <Form
              form={form}
              onFinish={onFinish}
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
                rules={[{ required: false, message: "Select page" }]}
              >
                <PageSelector multiple={false} />
              </Form.Item>
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
            <div className="absolute top-0 right-0">
              {onAddHelpTab && <Button type="text" icon={<InfoCircleOutlined />}
                onClick={onAddHelpTab}
              />}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="w-2" />
        <Panel>
          {/* <CodeEditor
            value={resultValue}
            showActions={true}
          /> */}
          <SnapshotExplorer snapshot={resultValue} />
        </Panel>
      </PanelGroup>
    </div>
  );
}


const SearchSnapshot = () => {
  const tabsRef = useRef(null);
  const { addHelpTab } = useHelpTab("memory", "search-snapshot", <SearchSnapshotHelpTab />)

  const addTab = (formValues) => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <SearchSnapshotTab
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

  useEvent("memory.searchHeapSnapshot", (data) => {
    addTab(data);
  });

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