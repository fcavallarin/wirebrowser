import { useState, useEffect, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "@/components/panels";
import CodeEditor from "@/components/code-editor";
import { jsonStringify, showNotification } from "@/utils";
import Table from "@/components/table";
import ColorDot from "@/components/color-dot";


const SnapshotExplorer = ({ snapshot }) => {
  const [editorValue, setEditorValue] = useState("");
  const snapshotData = useRef(null);
  const tableRef = useRef();

  const colDefs = [
    { field: "id", headerName: "#", width: 50 },
    { field: "object", flex: 1, headerName: "Object", filter: "agTextColumnFilter" },
    { field: "className", width: 100, headerName: "Class", filter: "agTextColumnFilter" },
    { field: "highlight", width: 70, hide: true },
    { field: "color", width: 70, hide: true },
    { field: "similarity", width: 100, filter: "agNumberColumnFilter", },
  ];

  useEffect(() => {
    if (!snapshot) return;
    snapshotData.current = new Map();
    let id = 1;
    const tblData = [];
    for (const res of snapshot) {
      snapshotData.current.set(id, res);
      tblData.push({ id, varName: "", ...res, object: JSON.stringify(res.object) });
      id++;
    }

    try {
      tableRef.current.clear();
    } catch { }
    tableRef.current.addRows(tblData.sort((a, b) => b.similarity - a.similarity));

  }, [snapshot])


  const handleRowSelection = (row) => {
    const { object, className } = snapshotData.current.get(row.id);
    setEditorValue(jsonStringify(object, true));
  }

  const highlightRow = (row, v) => {
    const req = snapshotData.current.get(row.id);
    const rowNode = tableRef.current.getRowNode(row.id);
    const color = v.key !== "none" ? v.key : null;
    rowNode.setDataValue('color', color);
    req.color = color;
  }

  const menuItems = [
    {
      key: "highlight", label: `Highlight`, onClick: highlightRow,
      children: ["red", "blue", "yellow", "green", "none"].map(c => (
        {
          key: c, label: <ColorDot color={c} />,
        })
      ),
    },
  ];

  return (
    <>
      <div className="h-full">

        <PanelGroup direction="vertical">
          <Panel defaultSize={30} minSize={20}>
            <div className="flex flex-col h-full">
              {/* <div className={`flex-none h-6 ${isMaxResultsLimitReached ? "text-error" : ""}`}>
                {resultStats}
              </div> */}
              <div className="flex flex-1">
                <Table
                  colDefs={colDefs}
                  ref={tableRef}
                  menuItems={menuItems}
                  onRowSelected={handleRowSelection}
                />
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="h-2" />
          <Panel>
            <CodeEditor
              value={editorValue}
              showActions={true}
            />
          </Panel>
        </PanelGroup>
      </div >
    </>
  );
}


export default SnapshotExplorer;