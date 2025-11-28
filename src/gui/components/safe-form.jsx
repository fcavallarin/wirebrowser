import { useMemo } from "react";
import { Form as AntForm } from "antd";


/**
 * Wrapper for Ant Design Form.
 * AntD generates input IDs based on Form.name, which causes duplicate IDs
 * when multiple identical forms exist (e.g. dynamic tabs).
 * We assign a unique name (UUID) to ensure all generated input IDs are unique.
 */
const Form = ({ name, ref, ...props }) => {
  const formName = useMemo(() => name || crypto.randomUUID(), [name]);
  return <AntForm ref={ref} name={formName} {...props} />;
};

Form.Item = AntForm.Item;
Form.List = AntForm.List;
Form.Provider = AntForm.Provider;
Form.useForm = AntForm.useForm;

export default Form;
