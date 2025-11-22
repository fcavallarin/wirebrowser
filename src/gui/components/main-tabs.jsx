import React, { useState, useImperativeHandle } from "react";
import { Tabs, Button, Input, Form, Empty } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import CodeEditor from "@/components/code-editor";
import { useGlobal } from "@/global-context";
import { useEvent } from "@/hooks/useEvents";

const MainTabs = ({
  items,
  onChange,
  ...props
}) => {
  const highlightClass = "text-success-900";
  const [tabsLabelClass, setTabsLabelClass] = useState({});

  useEvent("highlightTab", ({ tabKey, highlight = true }) => {
    setTabsLabelClass(cur => ({
      ...cur, [tabKey]: highlight ? highlightClass : ""
    }));
  });

  const tabItems = items.map(t => (
    {
      ...t,
      label: (<span className={tabsLabelClass[t.key] || ""}>{t.label}</span>),
      forceRender: true,
    }
  ));

  return (
    <Tabs
      animated={false}
      tabBarStyle={{ height: '25px', margin: '4px' }}
      {...props}
      items={tabItems}
      className="flex flex-col flex-1 overflow-hidden"
      onChange={(tabKey) => {
        setTabsLabelClass(cur => ({
          ...cur, [tabKey]: ""
        }));
        if (onChange) {
          onChange(tabKey);
        }
      }}
    />
  );
};

export default MainTabs;
