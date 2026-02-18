import { useState, useRef } from "react";
import { Button, Flex, Form } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import { useGlobal } from "@/global-context";
import PptrScriptsHelpTab from "@/modules/automation/help-tabs/pptr-scripts";
import { useHelpTab } from "@/hooks/useHelpTab";
import FileEditor from "@/components/file-editor";
import { jsonStringify } from "@/utils";
import LogViewer from "@/components/log-viewer";


const ExecutionLog = ({ ref }) => {
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

const PptrScriptsTab = ({ value, onChange, fileId }) => {
  const [isLoading, setIsLoding] = useState(false);
  const executionLogRef = useRef();
  const [execForm] = Form.useForm();
  const { dispatchApiEvent } = useApiEvent({
    "automation.runPptrScriptLog": (data) => {
      executionLogRef.current.addData({
        ...data,
        text: JSON.parse(data.text)}
      );
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
            showAutocomplete={true}
          />
        </Panel>
        <PanelResizeHandle className="h-2" />
        <Panel defaultSize={20} minSize={18}>
          <ExecutionLog ref={executionLogRef} />
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