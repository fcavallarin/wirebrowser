import { useState } from "react";
import { Form, Select, Input, InputNumber } from "antd";
import CodeEditor from "@/components/code-editor";
import { useGlobal } from "@/global-context";
import PageSelector from "@/components/page-selector";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
const fullItem =
  "!mb-0 h-full " +
  "[&_.ant-form-item-row]:h-full " +
  "[&_.ant-form-item-control]:h-full " +
  "[&_.ant-form-item-control-input]:h-full " +
  "[&_.ant-form-item-control-input-content]:h-full";

const HookForm = ({ form, formValues, includePageId = true }) => {
  const { pages } = useGlobal();
  const pageId = pages && pages.length > 0 ? pages[0] : "1";
  const handlersTpl = `const handlers = {
  onEnter(ctx) {
    
  },
  onLeave(ctx) {
    
  },
  onReturnFollowed(ctx, previousStep) {

  },
  onStep(ctx, previousStep) {
    
  }
}
  `;
  return (
    <Form
      form={form}
      className="h-full"
      // onValuesChange={onValuesChange}
      layout="vertical"
      clearOnDestroy={true}
      initialValues={{
        handlers: handlersTpl,
        handleResult: `async (result, logger) => {\n  if (result.phase === "enter") {\n    \n  } \n}`,
        ...(includePageId ? { pageId } : {}),
        ...(formValues || {})
      }}>
      <div className="flex flex-col h-full">
        <div className="flex h-20">
          <div className="mt-6 mb-8 flex w-full flex-row">
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
        </div>
        <div className="flex flex-1 mt-6">
          <PanelGroup direction="horizontal">
            <Panel defaultSize={60} minSize={18}>
              <Form.Item name="handlers" className={fullItem}>
                <CodeEditor
                  language="javascript"
                  // height={100}
                  lineNumbers={true}
                  showActions={true}
                  header={
                    <span>Handlers</span>
                  }
                // resize="vertical"
                />
              </Form.Item>
            </Panel>
            <PanelResizeHandle className="w-2" />
            <Panel>
              <Form.Item name="handleResult" className={fullItem}>
                <CodeEditor
                  language="javascript"
                  lineNumbers={false}
                  showActions={true}
                  header="handleResult"
                />
              </Form.Item>
            </Panel>
          </PanelGroup>
        </div>

        {includePageId && (
          <div className="flex h-20 w-50 mt-6">
            <Form.Item
              label="Page"
              name="pageId"
              rules={[{ required: true, message: "Select page" }]}
            >
              <PageSelector multiple={false} />
            </Form.Item>
          </div>
        )}
      </div>
    </Form>
  )
}

export default HookForm;