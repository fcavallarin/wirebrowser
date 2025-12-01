import { useState, useRef, useImperativeHandle } from "react";
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { themeBalham } from 'ag-grid-community';
import { Dropdown } from "antd";

ModuleRegistry.registerModules([AllCommunityModule]);

const Table = ({
  colDefs,
  onRowSelected,
  menuItems,
  highlightedRow,
  ref,
  ...props
}) => {
  const menuRef = useRef(null);
  const tableRef = useRef();
  const queueRef = useRef([]);
  const [rightClickedRow, setRightClieckdRow] = useState(null);
  const [initRowData, setInitRowData] = useState([]);

  useImperativeHandle(ref, () => ({
    addRows: (rows) => {
      if (!tableRef.current?.api) {
        queueRef.current.push(...rows);
        return;
      }
      tableRef.current.api.applyTransaction({ add: rows });
    },
    scrollToBottom: () => {
      const lastIndex = tableRef.current.api.getDisplayedRowCount() - 1;
      tableRef.current.api.ensureIndexVisible(lastIndex, 'bottom');
    },
    deleteRow: (id) => {
      const rowNode = tableRef.current.api.getRowNode(id);
      tableRef.current.api.applyTransaction({ remove: [rowNode] });
    },
    clear: () => {
      tableRef.current.api.setGridOption("rowData", []);
    },
    deleteVisibleRows: () => {
      const visibleRows = [];
      tableRef.current.api.forEachNodeAfterFilterAndSort((node) => {
        visibleRows.push(node.data);
      });
      tableRef.current.api.applyTransaction({ remove: visibleRows });
    },
    getRowNode: (id) => {
      return tableRef.current.api.getRowNode(id);
    },
    ensureRowVisible: (id, position) => {
      const rowNode = tableRef.current.api.getRowNode(id);
      tableRef.current.api.ensureIndexVisible(rowNode.rowIndex, position || null);
    },
    onFilterChanged: () => {
      return tableRef.current.api.onFilterChanged();
    },
    getAllRows: () => {
      const rows = [];
      tableRef.current.api.forEachNode(node => {
        rows.push(node.data);
      });
      return rows;
    },
    selectRowByIndex: (rowIndex) => {
      selectRowByIndex(rowIndex);
    }
  }));

  const onGridReady = ({ api }) => {
    if (queueRef.current.length > 0) {
      api.applyTransaction({ add: queueRef.current });
      queueRef.current = [];
    }
  };

  const items = menuItems ? menuItems.map((e) => (
    {
      ...e, onClick: (event) => {
        e.onClick(rightClickedRow, event)
      }
    }
  )) : [];


  const selectRowByIndex = (rowIndex) => {
    const api = tableRef.current.api;
    if (api == null || rowIndex == null || rowIndex < 0) return;
    const node = api.getDisplayedRowAtIndex(rowIndex);
    if (!node) return;
    api.deselectAll();
    node.setSelected(true, true);
    api.ensureIndexVisible(rowIndex);
  };

  const onCellFocused = (e) => {
    selectRowByIndex(e.rowIndex);
  };

  return (

    <Dropdown
      menu={{
        items,
        style: { visibility: 'hidden' },
        ref: menuRef
      }}
      onOpenChange={(open) => {
        if (!open) {
          setRightClieckdRow(null);
          menuRef.current.menu.list.style.visibility = "hidden";
        }
      }}
      trigger={['contextMenu']}
    >
      <div
        data-ag-theme-mode="dark"
        style={{ height: '100%', width: '100%' }}
      >

        <AgGridReact
          {...props}
          theme={themeBalham}
          ref={tableRef}
          rowData={initRowData}
          columnDefs={colDefs}
          suppressHeaderFocus={true}
          rowSelection={{
            mode: "singleRow",
            checkboxes: false,
            enableClickSelection: true
          }}
          suppressCellFocus={false}
          enableFilterHandlers={true}
          onCellFocused={onCellFocused}
          onSelectionChanged={(event) => {
            const selected = event.api.getSelectedRows();
            if (onRowSelected && selected[0]) {
              onRowSelected(selected[0]);
            }
          }}
          onCellContextMenu={(r) => {
            menuRef.current.menu.list.style.visibility = "visible";
            setRightClieckdRow(r.data);
          }}
          getRowId={params => params.data.id}
          rowClassRules={{
            '!bg-red-500': (p) => !p.data.highlight && p.data.color === "red",
            '!bg-green-500': (p) => !p.data.highlight && p.data.color === "green",
            '!bg-yellow-500': (p) => !p.data.highlight && p.data.color === "yellow",
            '!bg-blue-500': (p) => !p.data.highlight && p.data.color === "blue",
            '!bg-amber-700': (p) => p.data.highlight === true,
          }}
          onGridReady={onGridReady}
        />
      </div>
    </Dropdown>
  );
}

export default Table;