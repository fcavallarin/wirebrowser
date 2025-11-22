import { useState, useEffect, useRef } from "react";
import { Button, Select, Input, Flex, Space, Form, Tabs } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import CodeEditor from "@/components/code-editor";
import PageSelector from "@/components/page-selector";
import { useGlobal } from "@/global-context";
import ScriptsHelpTab from "@/modules/automation/help-tabs/scripts";
import { useHelpTab } from "@/hooks/useHelpTab";
import FileEditor from "@/components/file-editor";
import { setConsole } from "@/utils";


const ScriptsTab = ({ value, onChange, fileId }) => {
  const [isLoading, setIsLoding] = useState(false);
  const [execForm] = Form.useForm();
  const [autoexecForm] = Form.useForm();
  const { settings, updateSettings } = useGlobal();
  const pageIds = useRef([]);

  const { dispatchApiEvent } = useApiEvent({
    "automation.runScriptResult": (data) => {
      setConsole(true, pageIds.current[0]);
      setIsLoding(false);
    }
  });

  useEffect(() => {
    const script = settings?.automation?.scripts.files.find(f => f.id === fileId);
    const autoexec = script?.meta?.autoexec || "";
    autoexecForm.setFieldsValue({ autoexec });
  }, [/*settings,*/ autoexecForm]);

  const onAutoexecSettingsChange = (values) => {
    const scripts = settings?.automation?.scripts.files;
    const script = scripts.find(f => f.id === fileId);
    script.meta.autoexec = values.autoexec;
    updateSettings("automation.scripts.files", scripts);
  }

  const onExec = (values) => {
    setIsLoding(true);
    pageIds.current = values.pageIds || [];
    dispatchApiEvent("automation.runScript", {
      pageIds: values.pageIds,
      fileId
    })
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 ">
        <CodeEditor
          value={value}
          onChange={onChange}
          showActions={true}
          language="javascript"
        />
      </div>
      <div className="flex-none h-10">
        <Flex justify="space-between" align="bottom">
          <Form form={autoexecForm} onValuesChange={onAutoexecSettingsChange} layout="inline">
            <Form.Item label="Autoexec" name="autoexec">
              <Select
                className="w-40!"
                options={[
                  { value: '', label: 'No' },
                  { value: 'created', label: 'On Page Creation' },
                  { value: 'before-load', label: 'Before Page Load' },
                  { value: 'after-load', label: 'After Page Load' },
                ]}
              />
            </Form.Item>
          </Form>
          <Form form={execForm} onFinish={onExec} layout="inline">
            <Form.Item label="" name="pageIds"
              rules={[{ required: false, message: "Select pages" }]}
            >
              <PageSelector />
            </Form.Item>
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
const Scripts = () => {
  const { settings, updateSettings } = useGlobal();
  const { addHelpTab } = useHelpTab("automation", "scripts", <ScriptsHelpTab />);
  return (
    <FileEditor
      filesFromSettings={(s) => s?.automation?.scripts?.files}
      onUpdate={(files) => {
        updateSettings("automation.scripts.files", [...files]);
      }}
      tabComponent={<ScriptsTab />}
      addHelpTab={addHelpTab}
    />
  );
}


export default Scripts;