import { useState, useEffect, useRef, cloneElement, useImperativeHandle } from "react";
import { Button, Space } from "antd";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import DynamicTabs from "@/components/dynamic-tabs";
import { useGlobal } from "@/global-context";
import FileList from "@/components/file-list";
import { InfoCircleOutlined } from "@ant-design/icons";
import { showNotification } from "@/utils";


const FileEditor = ({ filesFromSettings, onUpdate, tabComponent, addHelpTab, ref }) => {
  const tabsRef = useRef(null);
  const { settings, updateSettings } = useGlobal();
  const [selectedFile, setSelectedFile] = useState(null);

  const FilesTab = (props) => {
    return cloneElement(tabComponent, props);
  }

  const getFiles = () => {
    if (!settings) {
      return;
    }
    return filesFromSettings(settings)?.map(f => ({...f, meta: {...f.meta}}))
      || [{ id: 1, name: "/", type: "dir", parentId: null, meta: {} }];
  }

  const updateFiles = (updateFnc) => {
    const files = getFiles();
    if (!files) {
      return;
    }
    onUpdate([...updateFnc(files)]);
  }

  useEffect(() => {
    if (addHelpTab) {
      addHelpTab(tabsRef);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedFile) {
      addTab(selectedFile);
    }
  }, [selectedFile]);

  useImperativeHandle(ref, () => ({
    addFile: (content) => {
      newFile("file", null, content);
    }
  }));

  const getNextId = () => {
    const files = getFiles();
    return files && files.length > 0 ? Math.max(...files.map(s => s.id)) + 1 : 1;
  }


  const addTab = (fileId) => {
    const file = getFiles().find(f => f.id === fileId);
    if (tabsRef.current) {
      const tab = tabsRef.current.getTab(file.id)
      if (tab) {
        tabsRef.current.selectTab(tab.key);
        return;
      }
      tabsRef.current.addTab(
        <FilesTab
          fileId={fileId}
          value={file.content || ""}
          onChange={(value) => {
            updateFiles(cur => {
              const f = cur.find(f => f.id === fileId);
              f.content = value;
              return [...cur];
            });
          }}
        />,
        file.name,
        file.id
      );
    }
  };

  const closeTab = (key) => {
    if (tabsRef.current) {
      tabsRef.current.closeTab(key);
    }
  };

  const newFile = (type, parentId, content) => {
    const prid = parentId || getFiles().find(f => f.parentId === null).id;
    const id = getNextId();
    updateFiles(cur => [...cur, {
      id,
      name: "",
      type,
      content: content || "",
      parentId: prid,
      meta: {}
    }]);
    // setButtonsNewEnabled(false);
  }


  return (

    <PanelGroup direction="horizontal">
      <Panel defaultSize={20} minSize={18}>
        <div className="relative h-full flex flex-col overflow-auto">
          <div className="flex-1">
            <FileList
              files={getFiles()}
              onRename={(fileId, newName) => {
                updateFiles(cur => {
                  cur.find(f => f.id === fileId).name = newName;
                  return [...cur];
                });
                //setButtonsNewEnabled(true);
                const tab = tabsRef.current.getTab(fileId);
                if (tab) {
                  tabsRef.current.setTabTitle(tab.key, newName);
                  return;
                }
              }}
              onDelete={(fileId) => {
                if (getFiles().find(f => f.parentId === fileId)) {
                  showNotification({ type: "error", message: "Cannot delete a non-empty dir" });
                  return;
                }
                updateFiles(cur => {
                  cur.splice(cur.findIndex(f => f.id === fileId), 1);
                  return [...cur];
                });
                closeTab(fileId);
              }}
              onMove={(fileId, parentId) => {
                updateFiles(cur => {
                  cur.find(f => f.id === fileId).parentId = parentId;
                  return [...cur];
                });
              }}
              onNewFile={(parentId) => newFile("file", parentId)}
              onNewDir={(parentId) => newFile("dir", parentId)}
              onSelectFile={(fileId) => setSelectedFile(fileId)}
              // onSelectDir={(fileId) => setSelectedDir(fileId)}
              selected={selectedFile}
            />
          </div>
          <div className="flex-none">

          </div>
          <div className="absolute top-0 right-0">
            {addHelpTab && <Button type="text" icon={<InfoCircleOutlined />}
              onClick={() => addHelpTab(tabsRef, true)}
            />}
          </div>
        </div>

      </Panel>
      <PanelResizeHandle className="w-2" />
      <Panel>

        <DynamicTabs
          ref={tabsRef}
          hideAdd={true}
          label="File"
          confirmClose={false}
          noDataTitle="No File Selected"
          onCloseTab={(key) => {
            if (selectedFile === key) {
              setSelectedFile(null);
            }
          }}
          // onAddTabRequest={() => {
          //   addTab();
          // }}
          onSelectTab={(key) => {
            if (Number.isNaN(Number(key))) {
              return;
            }
            setSelectedFile(key);
          }}
        />
      </Panel>
    </PanelGroup>

  );
}

export default FileEditor;