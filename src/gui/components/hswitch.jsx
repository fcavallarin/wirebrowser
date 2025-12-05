import React from "react";
import { Form, Switch, Flex } from "antd";


const HSwitch = ({ label, isFormItem, name, size = "small", labelPosition }) => {
  const Label = ({ children, ...props }) => {
    const child = React.Children.only(children);
    const cloned = React.cloneElement(child, {
      size,
      ...child.props,
      ...props
    });
    return (
      <label>
        {labelPosition === "left" && (<span className="mr-2">{label}</span>)}
        {cloned}
        {(!labelPosition || labelPosition === "right") && (<span className="ml-2">{label}</span>)}
      </label>
    );
  };
  return (
    <div className="mb-4">
      <Flex align="center" gap={0}>
        {isFormItem ? (
          <Form.Item name={name} valuePropName="checked" noStyle>
            <Label><Switch /></Label>
          </Form.Item>
        ) : (
          <Label><Switch /></Label>
        )}
      </Flex>
    </div>
  );
}

export default HSwitch;
