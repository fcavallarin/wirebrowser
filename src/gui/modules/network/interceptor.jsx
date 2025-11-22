import { useState, useEffect, useRef } from "react";
import { Button, Input, Switch, Form, Select } from 'antd';
import { copyToClipboard, showNotification } from "@/utils";
import { useApiEvent } from "@/hooks/useEvents";
import { Panel, PanelGroup, HPanelResizeHandle } from "@/components/panels";
import Table from "@/components/table";
import RequestEditor from "@/components/request-editor";
import { useGlobal } from "@/global-context";
import PageSelector from "@/components/page-selector";
import { Request, Response } from "@/../common/models";
import { isValidRegExp } from "@/../common/utils";
import { dispatchEvent, highlightTab } from "@/utils";
import FilterSet from "@/components/table/filter-set";
import FilterPages from "@/components/table/filter-pages";
import ColorDot from "@/components/color-dot";
import TextSearchInput from "@/components/text-search-input.jsx";
import { CloseOutlined } from "@ant-design/icons";
import { requestTypes } from "@/constants";



const Interceptor = () => {
  const allRequests = useRef(new Map());
  const tableRef = useRef();
  const { settings, updateSettings, modal } = useGlobal();
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestActionsEnabled, setsRequestActionsEnabled] = useState(false);
  const [responseActionsEnabled, setResponseActionsEnabled] = useState(false);
  const [isGlobalSearchVisible, setIsGlobalSearchVisible] = useState(false);
  const [globalSearchValue, setGlobalSearchValue] = useState(null);
  const [hiddenRows, setHiddenRows] = useState([]);
  const [form] = Form.useForm();

  const { dispatchApiEvent } = useApiEvent({
    "network.newRequest": (data) => {
      const blockedRequests = getBlockedRequests();
      const req = new Request(data);
      allRequests.current.set(data.id, req);
      tableRef.current.addRows([data]);

      const rowNode = tableRef.current.getRowNode(data.id);
      if (blockedRequests.length > 0) {
        tableRef.current.ensureRowVisible(blockedRequests[0].id);
      } else {
        tableRef.current.scrollToBottom();
      }
      if (data.blocked) {
        if (rowNode) {
          rowNode.setDataValue('highlight', true);
        }
        if (!settings?.network?.interceptor.blockFilters.actions.includes("block-requests")) {
          forwardRequest(req);
        }
      }
    },
    "network.newResponse": (data) => {
      const req = allRequests.current.get(data.reqId);
      req.response = new Response(data);
      if (selectedRequest && data.reqId == selectedRequest.id) {
        setSelectedRequest(new Request(req));
      }
    },
    "network.bulkContinueRequestDone": (reqIds) => {
      for (const reqId of reqIds) {
        dismissBlockedRequest(reqId);
      }
    }
  });


  useEffect(() => {
    if (settings) {
      form.setFieldsValue(settings?.network?.interceptor?.blockFilters || {});
    }
  }, [settings, form]);


  useEffect(() => {
    if (globalSearchValue && globalSearchValue[0] !== "") {
      const hr = [];
      for (const [k, r] of allRequests.current) {
        if (!r.matches(globalSearchValue[0], globalSearchValue[1])) {
          hr.push(r.id);
        }
      }
      setHiddenRows(hr);
    } else {
      setHiddenRows([]);
    }
  }, [globalSearchValue]);

  useEffect(() => {
    if (!tableRef?.current.api) {
      return;
    }
    tableRef.current.onFilterChanged();
  }, [hiddenRows]);

  const doesExternalFilterPass = (node) => {
    return !hiddenRows.includes(node.data.id);
  };

  const addRequestToRepeater = (reqId) => {
    const er = allRequests.current.get(reqId);
    const req = new Request(er);
    req.id = null;
    req.response = null;
    dispatchEvent(`repeater.add`, { req });
    highlightTab("repeater");
  }

  const addRequestToApiCollection = (reqId) => {
    const er = allRequests.current.get(reqId);
    const req = new Request(er);
    req.id = null;
    req.response = null;
    dispatchEvent(`apicollection.add`, { req });
    highlightTab("apicollection");
  }

  const handleRowSelection = (row) => {
    const req = allRequests.current.get(row.id);
    setSelectedRequest(req);
    setsRequestActionsEnabled(req.blocked);
    setResponseActionsEnabled(req.blocked);
  }

  const highlightRow = (row, v) => {
    const req = allRequests.current.get(row.id);
    const rowNode = tableRef.current.getRowNode(row.id);
    const color = v.key !== "none" ? v.key : null;
    rowNode.setDataValue('color', color);
    req.color = color;
  }

  const memorySearch = (row, event) => {
    const req = allRequests.current.get(row.id);
    try {
      JSON.parse(req.response.data);
    } catch {
      showNotification({ type: "error", message: "Response doesn't contain a valid object" });
      return;
    }
    if (event.key === "live-object-search") {
      dispatchEvent("memory.searchLiveObject", {
        osEnabled: true,
        osObject: req.response.data,
        pageId: req.pageId
      });
    }
    if (event.key === "heap-snapshot-search") {
      dispatchEvent("memory.searchHeapSnapshot", {
        osEnabled: true,
        osObject: req.response.data,
        pageId: req.pageId
      });
    }
    highlightTab("memory");
  }

  const deleteRequest = (reqId) => {
    tableRef.current.deleteRow(reqId);
    allRequests.current.delete(reqId);
  }

  const removeAllRequests = () => {
    tableRef.current.clear();
    allRequests.current.clear();
  }

  const removeVisibleRequests = () => {
    tableRef.current.deleteVisibleRows();
  };

  const getBlockedRequests = () => {
    const curBlocked = [];
    for (const [k, v] of allRequests.current) {
      if (v.blocked) {
        curBlocked.push(v);
      }
    }
    return curBlocked;
  }

  const continueAllRequests = () => {
    const curBlocked = getBlockedRequests().map(r => r.id);
    if (curBlocked.length > 0) {
      dispatchApiEvent("network.bulkContinueRequest", curBlocked);
    }

  }

  const copyUrlToClipboard = (reqId) => {
    const req = allRequests.current.get(reqId);
    copyToClipboard(req.url, () => { });
  }

  const doesFilterSetPass = ({ model, handlerParams, node }) => {
    if (!model || model.length === 0) return true;
    const raw = handlerParams.getValue(node);
    return model.includes(String(raw));
  }

  const [colDefs, setColDefs] = useState([
    { field: "id", headerName: "#", width: 70 },
    {
      field: "pageId", headerName: "Page", width: 70, filter: {
        component: FilterPages,
        doesFilterPass: doesFilterSetPass,
      }
    },
    { field: "method", width: 100, filter: "agTextColumnFilter" },
    {
      field: "type", width: 100, filter: {
        component: FilterSet,
        doesFilterPass: doesFilterSetPass,
      },
      filterParams: { options: requestTypes, defaults: requestTypes },
    },
    { field: "highlight", width: 70, hide: true },
    { field: "color", width: 70, hide: true },
    { field: "url", flex: 1, filter: "agTextColumnFilter", },
  ]);


  const menuItems = [

    {
      key: "add-to-repeater", label: `Add to Repeater`, onClick: (data) => {
        addRequestToRepeater(data.id)
      }
    },
    {
      key: "add-to-api-collection", label: `Add to API Collection`, onClick: (data) => {
        addRequestToApiCollection(data.id)
      }
    },
    {
      key: "search-object", label: `Memory Search`, onClick: memorySearch,
      children: [
        { key: 'live-object-search', label: "Live Objects" },
        { key: 'heap-snapshot-search', label: "Heap Snapshot" }
      ]
    },
    {
      key: "copy-url", label: `Copy URL`, onClick: (data) => {
        copyUrlToClipboard(data.id);
      }
    },
    {
      key: "highlight", label: `Highlight`, onClick: highlightRow,
      children: ["red", "blue", "yellow", "green", "none"].map(c => (
        {
          key: c,
          label: <ColorDot color={c} />,
        })
      ),
    },
    {
      key: "delete-item", label: `Delete Item`, onClick: (data) => {
        modal.confirm({
          content: "Delete item?",
          onOk: () => {
            deleteRequest(data.id);
          },
        });
      }
    },
    { type: "divider" },
    {
      key: "continue-all", label: `Continue All Blocked Requests`, onClick: (data) => {
        continueAllRequests();
      }
    },
    { type: "divider" },
    {
      key: "global-search", label: `Global search`, onClick: (data) => {
        setIsGlobalSearchVisible(true);
      }
    },
    { type: "divider" },
    {
      key: "delete-visible-items", label: `Delete Visible Items`, onClick: (data) => {
        modal.confirm({
          content: "Delete visible items?",
          onOk: () => {
            removeVisibleRequests();
          },
        });
      }
    },
    {
      key: "clear-list", label: `Clear List`, onClick: (data) => {
        modal.confirm({
          content: "Delete all items?",
          onOk: () => {
            removeAllRequests();
          },
        });
      }
    },
  ];

  const updateNetworkSettings = (value, values) => {
    settings.network.interceptor.blockFilters = values;
    updateSettings(settings);
  }

  const dismissBlockedRequest = (reqId) => {
    const rowNode = tableRef.current.getRowNode(reqId);
    if (rowNode) {
      rowNode.setDataValue('highlight', false);
      rowNode.setSelected(false);
    }

    setSelectedRequest(null);
    setsRequestActionsEnabled(false);
    setResponseActionsEnabled(false);
    const req = allRequests.current.get(reqId);
    req.blocked = false;
  }

  const forwardRequest = (req) => {
    dispatchApiEvent("network.continueRequest", req);
    setsRequestActionsEnabled(false);
    allRequests.current.set(req.id, req);
    if (!settings?.network?.interceptor.blockFilters.actions.includes("block-responses")) {
      dismissBlockedRequest(req.id);
    }
  }

  const dropRequest = (req, action) => {
    dispatchApiEvent("network.dropRequest", { req, action });
    dismissBlockedRequest(req.id);
  }

  const forwardResponse = (res) => {
    dispatchApiEvent("network.respondToRequest", res);
    dismissBlockedRequest(res.reqId);
    const r = allRequests.current.get(res.reqId);
    r.response = res;
  }


  return (
    <div className="h-full flex flex-col">
      <div className="flex-none min-h-10">
        <Form form={form} onValuesChange={updateNetworkSettings} layout="inline"
          className="flex !w-full"
        >
          <Form.Item
            name="enabled"
            className="flex-none"
            valuePropName="checked"
            title={"Enable/Disable Interception"}
          >
            <Switch size="small" />
          </Form.Item>

          <Form.Item
            name="actions"
            label="Block"
            className="flex-none min-w-50"
          >
            <Select
              mode="multiple"
              options={[
                { value: 'block-requests', label: 'Requests' },
                { value: 'block-responses', label: 'Responses' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="reqType"
            label="of type"
            className="flex-none min-w-80"
          >
            <Select
              mode="tags"
              options={requestTypes.map(t => ({
                value: t,
                label: t
              }))}
            />
          </Form.Item>

          <Form.Item label="on" name="pageId" initialValue={[]}>
            <PageSelector />
          </Form.Item>

          <Form.Item
            name="urlFilter"
            label=""
            className="!flex-1"
            rules={[
              {
                validator: async (_rule, value) => {
                  if (!isValidRegExp(value)) {
                    throw new Error("It must be a valid RegExp");
                  }
                  return true;
                }
              }
            ]}
          >
            <Input
              className="!w-full !min-w-30"
              placeholder="Regexp of URLs to exclude"

            />
          </Form.Item>
        </Form>
      </div>
      {isGlobalSearchVisible && (
        <div className="flex-none min-h-10">
          <div className="flex flex-row">
            <div className="flex-1">
              <TextSearchInput
                value={globalSearchValue?.[0]}
                onChange={(v) => setGlobalSearchValue(v)}
                placeholder="Global search"
                autoFocus={true}
              />
            </div>
            <div className="flex-none">
              <Button type="text" onClick={() => {
                setIsGlobalSearchVisible(false);
                setGlobalSearchValue(null);
              }}>
                <CloseOutlined />
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1">
        <PanelGroup direction="vertical">
          <Panel defaultSize={40} minSize={10}>
            <Table
              colDefs={colDefs}
              ref={tableRef}
              menuItems={menuItems}
              onRowSelected={handleRowSelection}
              isExternalFilterPresent={() => hiddenRows.length > 0}
              doesExternalFilterPass={doesExternalFilterPass}
            />
          </Panel>
          <HPanelResizeHandle />
          <Panel className="pb-2 pt-2">
            <RequestEditor
              request={selectedRequest}
              requestActionsEnabled={requestActionsEnabled}
              responseActionsEnabled={responseActionsEnabled}
              requestActions={{
                position: "end",
                buttons: [
                  {
                    label: "Drop", onClick: (req, action) => dropRequest(req, action), actions: [
                      { label: "accessdenied", key: "accessdenied" },
                      { label: "addressunreachable", key: "addressunreachable" },
                      { label: "blockedbyclient", key: "blockedbyclient" },
                      { label: "blockedbyresponse", key: "blockedbyresponse" },
                      { label: "connectionaborted", key: "connectionaborted" },
                      { label: "connectionclosed", key: "connectionclosed" },
                      { label: "connectionfailed", key: "connectionfailed" },
                      { label: "connectionrefused", key: "connectionrefused" },
                      { label: "connectionreset", key: "connectionreset" },
                      { label: "internetdisconnected", key: "internetdisconnected" },
                      { label: "namenotresolved", key: "namenotresolved" },
                      { label: "timedout", key: "timedout" },
                      { label: "aborted", key: "aborted" },
                      { label: "failed", key: "failed" },
                    ]
                  },
                  { label: "Forward", type: "primary", onClick: req => forwardRequest(req) },
                ]
              }}
              responseActions={{
                buttons: [
                  { "label": "Respond", type: "primary", onClick: res => forwardResponse(res) }
                ]
              }}
            />
          </Panel>

        </PanelGroup>
      </div>
    </div>
  );

}



export default Interceptor;