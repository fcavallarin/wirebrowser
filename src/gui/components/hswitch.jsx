import { Form, Switch, Flex } from "antd";


const HSwitch = ({ label, isFormItem, name, size = "small", labelPosition }) => {
  const Label = () => <div className="ml-2">{label}</div>;
  return (
    <div className="mb-4">
      <Flex align="center" gap={0}>
        {labelPosition === "left" && <Label />}
        {isFormItem ? (
          <Form.Item name={name} valuePropName="checked" noStyle>
            <Switch size={size} />
          </Form.Item>
        ) : (
          <Switch size={size} />
        )}
        {(!labelPosition || labelPosition === "right") && <Label />}
      </Flex>
    </div>
  );
}

export default HSwitch;
