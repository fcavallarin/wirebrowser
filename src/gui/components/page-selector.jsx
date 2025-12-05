import { useEffect, useState } from "react";
import { useGlobal } from "@/global-context";
import { Select } from 'antd';

const PageSelector = ({ onChange, value, multiple = true, ...props }) => {
  const { pages } = useGlobal();
  const [options, setOptions] = useState([]);

  useEffect(() => {
    setOptions((pages ||[]).map((p) => ({
      label: p.toString(),
      value: p.toString(),
    })));

  }, [pages]);


  return (
    <Select
      mode={multiple ? "multiple" : null}
      allowClear={multiple}
      value={value || []}
      className="min-w-30"
      placeholder={multiple ? "All Pages" : ""}
      onChange={onChange}
      options={options}
      {...props}
    />
  )
}

export default PageSelector;