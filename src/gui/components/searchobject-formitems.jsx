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

export const validateSearchObjectFormItems = (values) => {
  const errors = [];
  if (values.osEnabled) {
    try {
      const o = JSON.parse(values.osObject);
      if (!o || typeof o !== "object") {
        errors.push("Object Similarity: not a valid object");
      } else {
        if (Object.keys(o).length === 0) {
          errors.push("Object Similarity: cannot use an empty object");
        }
      }
    } catch {
      errors.push("Object Similarity: json parsing error");
    }
  } else {
    if (!values.propertySearch?.[0] && !values.valueSearch?.[0] && !values.classSearch?.[0]) {
      errors.push("At least one of: Propery, Value, Class Name must be set");
    } else {
      if (values.propertySearch?.[0] && !values.propertySearch[2].regexpValid) {
        errors.push("Property: not a valid regexp");
      }
      if (values.valueSearch?.[0] && !values.valueSearch[2].regexpValid) {
        errors.push("Value: not a valid regexp");
      }
      if (values.classSearch?.[0] && !values.classSearch[2].regexpValid) {
        errors.push("Class Name: not a valid regexp");
      }
    }
  }

  return errors;
};


export default SearchObjectFormItems;