import { useState, useImperativeHandle } from "react";
import { Tabs, Empty } from "antd";
import { useGlobal } from "@/global-context";


const DynamicTabs = ({
  ref,
  onCloseTab,
  onAddTabRequest,
  onSelectTab,
  label = "",
  hideAdd = true,
  confirmClose = true,
  noDataHelper,
  noDataTitle,
  tabBarExtraContent
}) => {
  const [tabs, setTabs] = useState([]);
  const [activeKey, setActiveKey] = useState();
  const [newTabIndex, setNewTabIndex] = useState(1);
  const { modal } = useGlobal();

  useImperativeHandle(ref, () => ({
    addTab: (content, title, key) => {
      addTab(content, title, key);
    },
    closeTab: (key) => {
      closeTab(key);
    },
    getTab: (key) => {
      return tabs.find(t => t.key === key);
    },
    selectTab: (key) => {
      setActiveKey(key);
    },
    setTabTitle: (key, newTitle) => {
      setTabs(cur => {
        const next = [...cur];
        next.find(t => t.key === key).label = newTitle;
        return next;
      });
      // setActiveKey(key);
    }
  }));

  const addTab = (content, title, key) => {
    const newKey = key || `${newTabIndex}`;
    setTabs(cur => [...cur, { key: newKey, label: title || `${label} ${newKey}`, children: content }]);
    setActiveKey(newKey);
    setNewTabIndex(newTabIndex + 1);
  };


  const closeTab = (targetKey) => {
    let newActiveKey = activeKey;
    let lastIndex = -1;

    tabs.forEach((tab, i) => {
      if (tab.key === targetKey) lastIndex = i - 1;
    });

    const newTabs = tabs.filter((tab) => tab.key !== targetKey);

    if (newTabs.length && newActiveKey === targetKey) {
      if (lastIndex >= 0) newActiveKey = newTabs[lastIndex].key;
      else newActiveKey = newTabs[0].key;
    }

    setTabs(newTabs);
    setActiveKey(newActiveKey);

    return targetKey;
  };

  const removeTab = (targetKey) => {
    let closedKey;
    if (confirmClose) {
      modal.confirm({
        content: "Close tab?",
        onOk: () => {
          closedKey = closeTab(targetKey);
          if (onCloseTab) {
            onCloseTab(closedKey)
          }
        }
      });
    } else {
      closedKey = closeTab(targetKey);
      if (onCloseTab) {
        onCloseTab(closedKey)
      }
    }

  };

  return (
    tabs.length > 0
      ? <Tabs
        type="editable-card"
        hideAdd={hideAdd}
        activeKey={activeKey}
        onChange={(k) => {
          setActiveKey(k);
          if (onSelectTab) {
            onSelectTab(k);
          }
        }}
        tabBarStyle={{ height: '35px', margin: '4px' }}
        onEdit={(key, action) => {
          if (action === "add") {
            if (onAddTabRequest) {
              onAddTabRequest();
            }
          }
          if (action === "remove") removeTab(key);
        }}
        items={tabs}
        tabBarExtraContent={tabBarExtraContent}
      />
      : <div className="h-full flex items-center justify-center">
        <Empty description={<>
          <div className="text-xl">{noDataTitle ?? "No Data"}</div>
          {noDataHelper && (
            <div>{noDataHelper}</div>
          )}
        </>} />
      </div>
  );
};

export default DynamicTabs;
