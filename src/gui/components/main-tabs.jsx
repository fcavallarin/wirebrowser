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
  const [activeKey, setActiveKey] = useState(null);

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

  useEvent("selectTab", ({ tabKey }) => {
    for(let k of tabKey.split(":")){
      if(tabItems.map(t => t.key).includes(k)){
        setActiveKey(k);
        return;
      }
    }
  });


  return (
    <Tabs
      animated={false}
      tabBarStyle={{ height: '25px', margin: '4px' }}
      {...props}
      {...(activeKey ? {activeKey} : {})}
      items={tabItems}
      className="flex flex-col flex-1 overflow-hidden"
      onChange={(tabKey) => {
        setTabsLabelClass(cur => ({
          ...cur, [tabKey]: ""
        }));
        setActiveKey(tabKey);
        if (onChange) {
          onChange(tabKey);
        }
      }}
    />
  );
};

export default MainTabs;
