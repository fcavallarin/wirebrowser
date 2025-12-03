import { useState } from "react";
import { Input, Form } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { isValidRegExp } from "@/../common/utils";

const TextSearchInput = ({ value, onChange, ...props }) => {
  const [matchCase, setMatchCase] = useState(false);
  const [useRegexp, setUseRegexp] = useState(false);
  const [regexpValid, setRegexpValid] = useState(true);
  const [text, setText] = useState("");
  const baseStyle = "inline-block hover:text-primary rounded-sm w-5 text-center border cursor-pointer h-5 p-0 m-0! ml-1! text-xs";

  const toggleCase = (e) => {
    setMatchCase(cur => {
      onChange([text, { matchCase: !cur, useRegexp }, {regexpValid}]);
      return !cur;
    });
  }
  const toggleRegex = (e) => {
    setUseRegexp(cur => {
      const regexpOK = !cur ? isValidRegExp(text) : true
      onChange([text, { matchCase, useRegexp: !cur }, {regexpValid: regexpOK}]);
      setRegexpValid(regexpOK);
      return !cur;
    });
  }

  const handleOnChange = (e) => {
    setText(e.target.value);
    const regexpOK = useRegexp ? isValidRegExp(e.target.value) : true;
    setRegexpValid(regexpOK);
    onChange([e.target.value, { matchCase, useRegexp }, {regexpValid: regexpOK}]);
  }


  return (
    <Input {...props} value={value || ""} onChange={handleOnChange}
      suffix={<>
        <span
          className={`${baseStyle} ${matchCase ? "border-primary" : "border-transparent"}`}
          onClick={toggleCase} title="Match case">
          Aa
        </span>
        <span
          className={`${baseStyle} ${useRegexp ? "border-primary" : "border-transparent"}`}
          onClick={toggleRegex} title="Use regular expression">
          .*
        </span>
        {!regexpValid && (
          <span className="text-red-500 ml-1!" title="Invalid Regexp">
          <WarningOutlined />
          </span>
        )}
      </>}
    />
  );
}

export const TextSearchInputFormItem = (props) => {
  return (
    <Form.Item
      {...props}
      getValueProps={(val) => ({ value: val ? val[0] : "" })}
    >
      <TextSearchInput />
    </Form.Item>
  );
}

export default TextSearchInput;