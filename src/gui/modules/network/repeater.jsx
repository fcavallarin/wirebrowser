import { useRef } from "react";
import DynamicTabs from "@/components/dynamic-tabs";
import { useEvent } from "@/hooks/useEvents.js";
import RequestCreator from "@/components/request-creator";


const Repeater = () => {
  const tabsRef = useRef();

  useEvent("repeater.add", ({ req }) => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <div className="h-full">
          <RequestCreator request={req} />
        </div>
      );
    }
  });

  return (
    <DynamicTabs
      ref={tabsRef}
      label="Request"
      noDataHelper={`Use "Add to Repeater" from Interceptor`}
      onCloseTab={(index) => {
      }}
    />
  );

}


export default Repeater;