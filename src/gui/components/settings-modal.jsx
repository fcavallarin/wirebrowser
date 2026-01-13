import { useEffect, useState, useRef, useImperativeHandle } from 'react';
import { Button, Modal, Form, Space, Switch, Tabs, Input } from 'antd';
import { DeleteOutlined } from "@ant-design/icons";
import { useGlobal } from "@/global-context";
import Table from "@/components/table";
import { dispatchGlobalApiEvent, showNotification } from "@/utils";
import { FilePathInputFormItem } from "@/components/file-path-input";

const VariablesEditor = ({ ref }) => {
  const { settings } = useGlobal();
  const [isAddEnabled, setIsAddEnabled] = useState(true);
  const tableRef = useRef();
  const [colDefs, setColDefs] = useState([
    { field: "id", headerName: "Name", width: 170, editable: true },
    { field: "value", headerName: "Value", flex: 1, editable: true },
    {
      field: "actions", headerName: "", width: 40, cellRenderer: (params) => (
        <span className="hover:text-primary" onClick={() => del(params.data.id)}>
          <DeleteOutlined />
        </span>

      )
    }
  ]);

  useEffect(() => {
    if (!settings) {
      return;
    }
    const rows = [];
    if (settings?.global?.variables) {
      for (const name in settings.global.variables) {
        rows.push({ id: name, value: settings.global.variables[name] })
      }
      tableRef.current.addRows(rows);
    }

  }, [settings]);

  useImperativeHandle(ref, () => ({
    get: () => {
      const rows = {};
      for (const row of tableRef.current.getAllRows()) {
        if (row.id in rows) {
          showNotification({
            type: "error",
            message: "Duplicate Variable Name",
            description: `Variable name must be unique, duplicated: ${row.id}`
          })
          return null;
        }
        rows[row.id] = row.value;
      };

      return rows;
    },
  }));

  const add = () => {
    const rowData = tableRef.current.getAllRows();
    if (rowData.find(r => r.id === "")) {
      return;
    }
    tableRef.current.addRows([{ id: "", value: "" }]);
  }

  const del = (id) => {
    tableRef.current.deleteRow(id);
  }

  return (<>
    <div className="h-80">
      <Table
        colDefs={colDefs}
        ref={tableRef}
        onCellEditingStarted={() => setIsAddEnabled(false)}
        onCellEditingStopped={() => setIsAddEnabled(true)}
      />
    </div>
    <div>
      <Button disabled={!isAddEnabled} onClick={add}>Add Variable</Button>
    </div>
    <div className="mt-8">
      Variables are tokens wrapped in {"{{ }}"}. <br />
      They can be used in network requests and are also accessible in scripts through the Utils.getVar(name) function.
      <br />
      To display a variable literally (e.g., {"{{varname}}"}), use the syntax {"{{=varname}}"}.

    </div>
  </>);
}


const GeneralSettings = ({ ref }) => {
  const [form] = Form.useForm();
  const { settings, updateSettings } = useGlobal();

  useEffect(() => {
    if (!settings) {
      return;
    }
    form.setFieldsValue({
      ...(settings?.global?.browser || {})
    });

  }, [settings]);

  useImperativeHandle(ref, () => ({
    get: () => {
      return form.getFieldsValue();
    },
  }));


  const restartBrowser = () => {
    updateSettings("global.browser", form.getFieldsValue());
    dispatchGlobalApiEvent("restartBrowser");
  }

  return (<div>
    <Form form={form} >
      <Form.Item
        name="openDevTools"
        valuePropName="checked"
        label="Open DevTools on browser's windows"
      >
        <Switch size="small" />
      </Form.Item>
      <Form.Item
        name="proxyServer"
        className="flex-none"
        label="Http Proxy Server"
      >
        <Input placeholder="localhost:8080" />
      </Form.Item>
      <FilePathInputFormItem
        name="dataDir"
        className="flex-none"
        label="Persistent data folder"
      />
      <Space>
        <Form.Item
          name="disableCache"
          valuePropName="checked"
          label="Disable browser's cache"
        >
          <Switch size="small" />
        </Form.Item>
        <div className='text-text-secondary-900 italic mb-4 mt--10'>
          It is recommended to disable caching, as some intercepted requests may fail when the cache is enabled.
        </div>
      </Space>
    </Form>
    <div>
      <div className='text-warning mb-4 mt-10'>These settings need a browser restart</div>
      <Button onClick={restartBrowser} >Save and Restart Browser</Button>
    </div>
  </div>

  );
}

const SettingsModal = ({ open, onClose }) => {

  const { updateSettings } = useGlobal();
  const varEditorRef = useRef();
  const generalSettigsRef = useRef();
  const [appVersion, setAppVersion] = useState("");

  const tabItems = [
    {
      key: "variables",
      label: "Variables",
      forceRender: true,
      children: <VariablesEditor ref={varEditorRef} />
    },
    {
      key: "general",
      label: "Browser",
      forceRender: true,
      children: <GeneralSettings ref={generalSettigsRef} />
    },
  ];

  useEffect(() => {
    window.electronAPI.getVersion().then(v => setAppVersion(v));
  }, []);

  const saveSettings = () => {
    const variables = varEditorRef.current.get();
    if (variables === null) {
      return;
    }
    const newSettings = {
      browser: generalSettigsRef.current.get(),
      variables
    };
    updateSettings("global", newSettings);
    onClose();
  }

  return (
    <Modal
      open={open}
      title="Settings"
      onOk={onClose}
      onCancel={onClose}
      destroyOnHidden={true}
      style={{ top: 20, height: "90vh" }}
      keyboard={false}
      maskClosable={false}
      styles={{
        body: {
          height: "calc(90vh - 110px)",
          overflowY: "auto",
        },
      }}
      width="90vw"
      footer={[
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button type="primary" key="save" onClick={saveSettings}>Save</Button>,
      ]}
    >
      <Tabs
        items={tabItems}
        animated={false}
      />
      <div className="absolute bottom-0 italic text-[12px] text-bg-container-900">
        Version: {appVersion}
      </div>
    </Modal>
  );
};

export default SettingsModal;