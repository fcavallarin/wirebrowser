import { useState } from "react";
import { Button, Flex, Form } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import { useGlobal } from "@/global-context";
import PptrScriptsHelpTab from "@/modules/automation/help-tabs/pptr-scripts";
import { useHelpTab } from "@/hooks/useHelpTab";
import FileEditor from "@/components/file-editor";
import { jsonStringify } from "@/utils";

const ExecutionResult = ({ result }) => {
  let lang = "plaintext";
  let v = result;
  if (typeof v === "object") {
    v = jsonStringify(v, true);
    lang = "json";
  }
  return (
    result
      ? <CodeEditor
        value={v}
        showActions={true}
        language={lang}
      />
      : <div></div>
  );
};

const PptrScriptsTab = ({ value, onChange, fileId }) => {
  const [isLoading, setIsLoding] = useState(false);
  const [resultValue, setResultValue] = useState(null);
  const [execForm] = Form.useForm();
  const { dispatchApiEvent } = useApiEvent({
    "automation.runPptrScriptResult": (data) => {
      setResultValue(JSON.parse(data));
      setIsLoding(false);
    }
  });

  const onExec = (values) => {
    setIsLoding(true);
    dispatchApiEvent("automation.runPptrScript", {
      fileId
    })
  };

  return (
    <div className="flex flex-col h-full">
      <PanelGroup direction="vertical">
        <Panel>
          <CodeEditor
            value={value}
            onChange={onChange}
            showActions={true}
            language="javascript"
          />
        </Panel>
        <PanelResizeHandle className="h-2" />
        <Panel defaultSize={20} minSize={18}>
          <ExecutionResult result={resultValue} />
        </Panel>
      </PanelGroup>

      <div className="flex-none h-10">
        <Flex justify="end" align="bottom">
          <Form form={execForm} onFinish={onExec} layout="inline">
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={isLoading}>
                Execute
              </Button>
            </Form.Item>
          </Form>
        </Flex>
      </div>
    </div>

  );
}
const PptrScripts = () => {
  const { settings, updateSettings } = useGlobal();
  const { addHelpTab } = useHelpTab("automation", "pptrscripts", <PptrScriptsHelpTab />);
  return (
    <FileEditor
      filesFromSettings={(s) => s?.automation?.pptrscripts?.files}
      onUpdate={(files) => {
        updateSettings("automation.pptrscripts.files", [...files]);
      }}
      tabComponent={<PptrScriptsTab />}
      addHelpTab={addHelpTab}
    />
  );
}

export default PptrScripts;