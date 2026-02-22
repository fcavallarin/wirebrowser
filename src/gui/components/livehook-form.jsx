import { useState } from "react";
import { Form, Select, Input, InputNumber } from "antd";
import CodeEditor from "@/components/code-editor";
import { useGlobal } from "@/global-context";
import PageSelector from "@/components/page-selector";


const LiveHookForm = ({ form, formValues }) => {
  const { pages } = useGlobal();
  const [hookType, setHookType] = useState("inject");

  const onValuesChange = (_, values) => {
    setHookType(values.hookType);
  }

  return (
    <Form
      form={form}
      onValuesChange={onValuesChange}
      layout="vertical"
      clearOnDestroy={true}
      initialValues={{
        hookType: "inject",
        pageId: pages && pages.length > 0 ? pages[0] : "1",
        ...(formValues || {})
      }}>
      <div className="w-90">
        <Form.Item
          label="Hook Type"
          name="hookType"
        >
          <Select
            className="min-w-30"
            options={[
              { value: "inject", label: "Inject Code" },
              { value: "return", label: "Override Return Value (sync functions only)" }
            ]}
          />
        </Form.Item>
      </div>

      <div className="mt-6 mb-8 flex flex-row">
        <div className="mb-0 flex-1">
          <Form.Item
            className="!mb-0"
            label="File URL"
            name="file"
            rules={[{ required: true, message: "File is required" }]}
          >
            <Input />
          </Form.Item>
        </div>
        <div className="mb-0">
          <Form.Item
            className="!mb-0"
            label="Line"
            name="line"
            rules={[{ required: true, message: "Line is required" }]}
          >
            <InputNumber min="0" />
          </Form.Item>
        </div>
        <div className="mb-0">
          <Form.Item
            className="!mb-0"
            label="Column"
            name="col"
            rules={[{ required: true, message: "Column is required" }]}
          >
            <InputNumber min="0" />
          </Form.Item>
        </div>
      </div>

      <Form.Item name="condition">
        <CodeEditor
          language="javascript"
          height={100}
          lineNumbers={false}
          showActions={true}
          header={
            <span>Condition <span className="text-xs">(Optional. If falsy, the hook is skipped)</span></span>
          }
          resize="vertical"
        />
      </Form.Item>

      <div className={`${hookType !== "inject" ? "h-0" : ""} overflow-hidden`}>
        <Form.Item name="code">
          <CodeEditor
            language="javascript"
            height={200}
            lineNumbers={false}
            showActions={true}
            header="Code"
            resize="vertical"
          />
        </Form.Item>
      </div>

      <div className={`${hookType !== "return" ? "h-0" : ""} overflow-hidden`}>
        <Form.Item name="returnExpr">
          <CodeEditor
            language="javascript"
            height={100}
            lineNumbers={false}
            showActions={true}
            header="Return Expression"
            resize="vertical"
          />
        </Form.Item>
      </div>

      <div className="w-50">
        <Form.Item
          label="Page"
          name="pageId"
          rules={[{ required: true, message: "Select page" }]}
        >
          <PageSelector multiple={false} />
        </Form.Item>
      </div>
    </Form>
  )
}

export default LiveHookForm;