import { useState, useEffect, useRef } from "react";
import { Button, Input, Form, Slider, Collapse, Switch } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import PageSelector from "@/components/page-selector";
import DynamicTabs from "@/components/dynamic-tabs";
import SearchClassesHelpTab from "@/modules/memory/help-tabs/search-classes";
import { useHelpTab } from "@/hooks/useHelpTab";
import { InfoCircleOutlined } from "@ant-design/icons";
import { jsonStringify } from "@/utils";
import HSwitch from "@/components/hswitch";
import { TextSearchInputFormItem } from "@/components/text-search-input.jsx";
import { useGlobal } from "@/global-context";


const SearchObjectForm = ({ form, onSearch, isLoading }) => {
  const { pages } = useGlobal();
  const items = [
    {
      key: '1',
      label: 'Object Similarity',
      forceRender: true,
      children: <>
        <HSwitch isFormItem={true} name="osEnabled" label="Enable Similarity Search" />
        <Form.Item name="osObject">
          <CodeEditor height={160} lineNumbers={false} showActions={true} header="Object" />
        </Form.Item>
        <Form.Item label="Similarity Threshold" name="osThreshold">
          <Slider
            step={0.01}
            min={0}
            max={1}
            // tooltip={{ open: true }}
            marks={{
              0.25: 'Low',
              0.60: 'Balanced',
              0.90: 'Strict'
            }}
          />
        </Form.Item>
        <Form.Item label="Alpha (structure vs names)" name="osAlpha" >
          <Slider
            step={0.01}
            min={0}
            max={1}
            // tooltip={{ open: true }}
            marks={{
              0.1: 'Names',
              0.5: 'Balanced',
              0.9: 'Shape'
            }}
          />
        </Form.Item>
        <HSwitch isFormItem={true} name="osIncludeValues" label="Include values" />
      </>,
    },
    {
      key: '2',
      label: 'Text Search',
      forceRender: true,
      children: <>
        <TextSearchInputFormItem label="Property" name="propertySearch" />
        <TextSearchInputFormItem label="Value" name="valueSearch" />
        <TextSearchInputFormItem label="Class Name" name="protoSearch" />
      </>
    }
  ]
  return (
    <div className="h-full overflow-auto">
      <Form
        form={form}
        onFinish={onSearch}
        layout="vertical"
        initialValues={{
          pageId: pages && pages.length > 0 ? pages[0] : "1",
          osEnabled: false,
          osIncludeValues: false,
          osObject: "{}",
          osThreshold: 0.8,
          osAlpha: 0.3
        }}
      >
        <Form.Item
          label="Page"
          name="pageId"
          rules={[{ required: false, message: "Select pages" }]}
        >
          <PageSelector multiple={false} />
        </Form.Item>
        <Collapse items={items} defaultActiveKey={['1', '2']} />

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={isLoading}>
            Search
          </Button>
        </Form.Item>
      </Form>
    </div >
  )
}

export default SearchObjectForm;