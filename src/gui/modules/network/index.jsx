import { useState, useEffect, useRef } from "react";
import { Button, Input, Alert, Layout, Menu, Tag, Tabs, Form, Select, Modal } from 'antd';
// import { dispatchApiEvent } from "@/utils";
import { useEvent } from "@/hooks/useEvents";
// import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import Interceptor from "@/modules/network/interceptor";
import Repeater from "@/modules/network/repeater";
import MainTabs from "@/components/main-tabs.jsx";
// Register all Community features
// ModuleRegistry.registerModules([AllCommunityModule]);
import SettingsModal from "@/modules/network/settings-modal";
import { SettingOutlined, ProfileOutlined, ToolOutlined   } from "@ant-design/icons";

const Network = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const tabItems = [
    {
      key: "interceptor",
      label: "Interceptor",
      // children: <div className="h-[calc(100vh-70px)]"><Interceptor /></div>
      children: <Interceptor />
    },
    {
      key: "repeater",
      label: "Repeater",
      children: <Repeater />
    }
  ]
  return (
    <>
      <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <MainTabs defaultActiveKey="interceptor"
        items={tabItems}
        className="flex-1 flex flex-col"
        tabBarExtraContent={{
          right: (
            <span
              className="hover:text-primary"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
            >
              <ToolOutlined />
            </span>
          )
        }}

      />
    </>
  );
}



export default Network;