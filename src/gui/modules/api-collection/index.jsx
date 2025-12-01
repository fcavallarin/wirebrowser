import { useState, useEffect, useRef } from "react";
import { Button, Select, Input, Flex, Space, Form, Tabs } from "antd";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
// import RequestEditor from "@/components/request-editor";
import RequestCreator from "@/components/request-creator";
import PageSelector from "@/components/page-selector";
import DynamicTabs from "@/components/dynamic-tabs";
import { useGlobal } from "@/global-context";
import ApiCollectionHelpTab from "@/modules/api-collection/help-tabs/api-collection";
import TextSearchInput, { TextSearchInputFormItem } from "@/components/text-search-input";
import FileList from "@/components/file-list";
import { useHelpTab } from "@/hooks/useHelpTab";
import FileEditor from "@/components/file-editor";
import { Request, Response } from "@/../common/models";
import { useEvent } from "@/hooks/useEvents";


const ApiCollectionTab = ({ value, onChange, fileId }) => {
  let req;
  try {
    req = new Request(value);
  } catch {
    req = new Request({
      method: "POST",
      headers: { "content-type": "application/json" },
      data: `{"test": 1}`,
      url: "https://example.com"
    });
  }

  return (
    <div className="h-full">
      <RequestCreator onChange={onChange} request={req} />
    </div>

  );
}
const ApiCollection = () => {
  const { settings, updateSettings } = useGlobal();
  const fileEditorRef = useRef();
  const { addHelpTab } = useHelpTab("apicollection", "apicollection", <ApiCollectionHelpTab />);

  useEvent("apicollection.add", ({ req }) => {
    fileEditorRef.current.addFile(req.serialize("json"));
  });

  return (
    <FileEditor
      ref={fileEditorRef}
      filesFromSettings={(s) => s?.apicollection?.files}
      onUpdate={(files) => {
        const validFiles = files.map(f => {
          if (f.type === "file") {
            try {
              new Request(f.content);
            } catch(e) {
              return settings.apicollection.files.find(ef => ef.id === f.id);
            }
          }
          return f;
        });
        updateSettings("apicollection.files", [...validFiles]);
      }}
      tabComponent={<ApiCollectionTab />}
      addHelpTab={addHelpTab}
    />
  );
}

export default ApiCollection;