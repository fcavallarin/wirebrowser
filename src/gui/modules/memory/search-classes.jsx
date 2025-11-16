import { useState, useEffect, useRef } from "react";
import { Button, Form } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import SearchObjectForm from "@/components/searchobject-form";
import DynamicTabs from "@/components/dynamic-tabs";
import SearchClassesHelpTab from "@/modules/memory/help-tabs/search-classes";
import { useHelpTab } from "@/hooks/useHelpTab";
import { InfoCircleOutlined } from "@ant-design/icons";
import { jsonStringify } from "@/utils";


const SearchClassesTab = ({ onAddHelpTab }) => {
  const [isLoading, setIsLoding] = useState(false);
  const [resultValue, setResultValue] = useState("");
  const [form] = Form.useForm();

  const { dispatchApiEvent } = useApiEvent({
    "heap.searchClassesResult": (data) => {
      setResultValue(jsonStringify(data, true));
      setIsLoding(false);
    }
  });

  const onFinish = (values) => {
    setResultValue("");
    setIsLoding(true);
    dispatchApiEvent("heap.searchClasses", values);
  };

  return (
    <div className="h-[calc(100vh-120px)]">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={30} minSize={20}>
          <SearchObjectForm form={form} onSearch={onFinish} isLoading={isLoading} />
          <div className="text-text-secondary-800 italic mt-10">
            List all live objects in memory that share a specific prototype — a simple wrapper around page.queryObjects().
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
  const { addHelpTab } = useHelpTab("memory", "search-classes", <SearchClassesHelpTab />)

  const addTab = () => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <SearchClassesTab onAddHelpTab={() => addHelpTab(tabsRef, true)} />
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