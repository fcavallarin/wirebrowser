import { useState, useRef } from "react";
import { Button, Flex, Form, Dropdown } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import { useGlobal } from "@/global-context";
import PptrScriptsHelpTab from "@/modules/automation/help-tabs/pptr-scripts";
import { useHelpTab } from "@/hooks/useHelpTab";
import FileEditor from "@/components/file-editor";
import { jsonStringify } from "@/utils";
import LogViewer from "@/components/log-viewer";
import LiveHookModal from "@/components/livehook-modal";
import { DownOutlined, ProductOutlined } from "@ant-design/icons";
import { useEvent } from "@/hooks/useEvents";


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
  const [liveHookModalOpen, setLiveHookModalOpen] = useState(false);
  const executionLogRef = useRef();
  const [execForm] = Form.useForm();
  const [curValue, setCurValue] = useState(value);
  const { dispatchApiEvent } = useApiEvent({
    "automation.runPptrScriptLog": (data) => {
      executionLogRef.current.addData({
        ...data,
        text: JSON.parse(data.text)
      }
      );
    },
    "automation.runPptrScriptDone": ({ error }) => {
      if (error) {
        executionLogRef.current.addData({ type: "error", text: error });
      }
      setIsLoding(false);
    }
  });

  const onExec = (values) => {
    setIsLoding(true);
    dispatchApiEvent("automation.runPptrScript", {
      fileId
    })
  };

  const onCreateLiveHook = (code) => {
    setCurValue(v => `${v}${v ? "\n" : ""}${code}`);
    setLiveHookModalOpen(false);
  };

  const menuActions = [
    {
      key: 'generate-live-hook', label: "Generate Live Hook", onClick: (e) => {
        setLiveHookModalOpen(true);
      }
    },
  ];

  return (
    <>
      <div className="flex flex-col h-full">
        <PanelGroup direction="vertical">
          <Panel>
            <CodeEditor
              value={curValue}
              onChange={onChange}
              showActions={true}
              language="javascript"
              showAutocomplete={true}
              header={
                <Dropdown menu={{
                  items: menuActions,
                }}>
                  <Button type="text" icon={<ProductOutlined />}>
                    Generate Code <DownOutlined />
                  </Button>
                </Dropdown>
              }
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
      <LiveHookModal
        open={liveHookModalOpen}
        onClose={() => setLiveHookModalOpen(false)}
        onFinish={onCreateLiveHook}
      />
    </>
  );
}
const PptrScripts = () => {
  const { settings, updateSettings } = useGlobal();
  const fileEditorRef = useRef();
  const { addHelpTab } = useHelpTab("automation", "pptrscripts", <PptrScriptsHelpTab />);

  useEvent("pptr-scripts.addLiveHook", ({ code }) => {
    fileEditorRef.current.addFile(code);
  });

  return (
    <FileEditor
      filesFromSettings={(s) => s?.automation?.pptrscripts?.files}
      onUpdate={(files) => {
        updateSettings("automation.pptrscripts.files", [...files]);
      }}
      tabComponent={<PptrScriptsTab />}
      addHelpTab={addHelpTab}
      ref={fileEditorRef}
    />
  );
}

export default PptrScripts;