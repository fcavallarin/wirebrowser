import { Form, Slider, Collapse } from "antd";
import CodeEditor from "@/components/code-editor";
import HSwitch from "@/components/hswitch";
import { TextSearchInputFormItem } from "@/components/text-search-input.jsx";


const SearchObjectFormItems = () => {
  const items = [
    {
      key: '1',
      label: 'Object Similarity',
      forceRender: true,
      children: <>
        <HSwitch isFormItem={true} name="osEnabled" label="Enable Similarity Search" />
        <Form.Item name="osObject">
          <CodeEditor height={160} lineNumbers={false} showActions={true} header="Object" resize="vertical" />
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
        <TextSearchInputFormItem label="Class Name" name="classSearch" />
      </>
    }
  ]
  return (
    <Collapse items={items} defaultActiveKey={['1', '2']} />
  )
}

export default SearchObjectFormItems;