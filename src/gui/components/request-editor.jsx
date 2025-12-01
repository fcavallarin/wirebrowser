import React, { useEffect, useState, useRef } from "react";
import { Flex, Button, Input, Form, Space, Dropdown, Select, message } from "antd";
import { EyeOutlined, MenuOutlined, DownOutlined, PercentageOutlined, CloseOutlined, FundViewOutlined } from "@ant-design/icons";
import CodeEditor from "@/components/code-editor";
import { Panel, PanelGroup, VPanelResizeHandle, HPanelResizeHandle, PanelResizeHandle } from "@/components/panels";
import { Request, Response } from "@/../common/models";
import { showNotification } from "@/utils";
import HtmlRenderer from "@/components/html-renderer";
import { dispatchEvent, highlightTab, copyToClipboard } from "@/utils";


const RequestEditor = ({
  request,
  onChange,
  requestActions,
  responseActions,
  requestActionsEnabled = true,
  responseActionsEnabled = true
}) => {
  const [reqView, setReqView] = useState("json");
  const [reqValue, setReqValue] = useState("");
  const [reqModifiedValue, setReqModifiedValue] = useState("");
  const reqEditorRef = useRef();
  const [resView, setResView] = useState("json");
  const [resValue, setResValue] = useState("");
  const [resModifiedValue, setResModifiedValue] = useState("");
  const resEditorRef = useRef();
  const [currentRequest, setCurrentRequest] = useState(null);
  const [reqActionsEnabled, setReqActionsEnabled] = useState(false);
  const [resActionsEnabled, setResActionsEnabled] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState(null);

  const reqDefaultActions = [
    {
      key: 'add-to-repeater', label: "Add to Repeater", onClick: (e) => {
        if (!currentRequest) {
          return;
        }
        dispatchEvent(`repeater.add`, { req: new Request(currentRequest) });
        highlightTab("repeater");
      }
    },
    {
      key: 'add-to-apicollection', label: "Add to API Collection", onClick: (e) => {
        if (!currentRequest) {
          return;
        }
        dispatchEvent(`apicollection.add`, { req: new Request(currentRequest) });
        highlightTab("apicollection");
      }
    },
    {
      key: 'copy-url', label: "Copy URL", onClick: (e) => {
        if (!currentRequest) {
          return;
        }
        copyToClipboard(currentRequest.url, () => { });
      }
    },
  ];

  useEffect(() => {
    if (request) {
      const reqText = requestToString(request, reqView);
      setCurrentRequest(request);
      setReqValue(reqText);
      setReqModifiedValue(reqText);
      if (request.response) {
        setResValue(responseToString(request.response, resView));
      } else {
        setResValue("");
      }
    } else {
      setCurrentRequest(null);
      setResValue("");
      setReqValue("");
      setReqActionsEnabled(false);
      setResActionsEnabled(false);
    }
    setHtmlPreview(null);
  }, [request]);

  useEffect(() => {
    setReqActionsEnabled(requestActionsEnabled);
    setResActionsEnabled(responseActionsEnabled);
  }, [requestActionsEnabled, responseActionsEnabled]);

  const handleRequestChange = (val, event) => {
    setReqModifiedValue(val);
    setReqActionsEnabled(requestActionsEnabled);
    if (onChange) {
      onChange(val);
    }
  }

  const handleResponseChange = (val, event) => {
    setResModifiedValue(val);
    setResActionsEnabled(responseActionsEnabled);

  }

  const requestToString = (req, t) => {
    return req.serialize(t);
  }

  const requestViewChange = (value) => {
    const r = getModifiedRequest();
    if(r){
      setReqValue(requestToString(r, value));
      setReqView(value);
    }
  };

  const responseToString = (res, t) => {
    return res.serialize(t);
  }

  const responseViewChange = (value) => {
    const r = getModifiedResponse();
    if (!r) {
      return;
    }
    setResValue(responseToString(r, value));
    setResView(value);
  };

  const getModifiedRequest = () => {
    if (!reqModifiedValue) {
      return currentRequest;
    }
    try {
      return new Request(reqModifiedValue, currentRequest.id, currentRequest.pageId, currentRequest.type);
    } catch (e) {
      showNotification({
        type: "error",
        message: "Parsing error",
        description: "Error parsing request"
      });
    }
  }

  const getModifiedResponse = () => {
    if (!resModifiedValue) {
      return currentRequest.response;
    }
    try {
      return new Response(resModifiedValue, currentRequest.id, currentRequest.pageId)
    } catch (e) {
      showNotification({
        type: "error",
        message: "Parsing error",
        description: "Error parsing response"
      })
    }
  }

  const encodeRequestUrl = () => {
    const r = getModifiedRequest();
    if(!r) return;
    const url = decodeURI(r.url);
    r.url = encodeURI(url)
      .replace(/%7B/g, "{")
      .replace(/%7D/g, "}");  // Keep variables unencoded
    setCurrentRequest(r);
    setReqValue(r.serialize(reqView));
  }

  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={50} minSize={10}>
        <div className="h-full flex flex-col">
          <div className="flex-1 min-h-0">
            <CodeEditor
              ref={reqEditorRef}
              showActions={true}
              value={reqValue}
              language={reqView === "json+" ? "json" : reqView}
              onChange={handleRequestChange}
              header={
                <Space size="large">
                  <span className="text-lg">Request</span>
                  <span>
                    <Select
                      defaultValue="json"
                      style={{ width: 90 }}
                      onChange={requestViewChange}
                      options={[
                        { value: 'json', label: 'JSON' },
                        { value: 'json+', label: 'JSON+' },
                        { value: 'text', label: 'RAW' },
                        { value: 'curl', label: 'cURL' },
                      ]}
                    />
                    <Button icon={<PercentageOutlined />} type="text" onClick={encodeRequestUrl} title="Encode URL" />
                    <Dropdown menu={{
                      items: reqDefaultActions,
                    }}>
                      <Button icon={<MenuOutlined />} type="text" />
                    </Dropdown>

                  </span>
                </Space>
              }
            />
          </div>
          <div className="flex-none h-6 m-1 pr-4">
            {requestActions && (
              <div className="flex-none h-6 m-1">
                <Flex gap="small" align="center"
                  justify={requestActions.position || "start"}
                >
                  {requestActions.buttons.map((b, i) => (
                    b.actions ?
                      <Dropdown
                        size="small"
                        disabled={!reqActionsEnabled}
                        menu={{
                          items: b.actions,
                          onClick: (e) => {
                            const mr = getModifiedRequest();
                            if (mr) {
                              b.onClick(mr, e.key);
                            }
                          }
                        }}
                        key={i}
                      >
                        <Button size="small">
                          <Space>
                            {b.label}
                            <DownOutlined />
                          </Space>
                        </Button>
                      </Dropdown>
                      :
                      <Button
                        key={i}
                        size="small"
                        disabled={!reqActionsEnabled}
                        onClick={() => {
                          const mr = getModifiedRequest();
                          if (mr) {
                            b.onClick(mr);
                          }
                        }}
                        type={b.type || "default"}
                      >
                        {b.label}
                      </Button>
                  ))}
                </Flex>
              </div>
            )}
          </div>

        </div>
      </Panel>
      <PanelResizeHandle className="w-1" />
      <Panel>
        <div className="h-full flex flex-col">
          <div className="flex-1 min-h-0 relative">
            {htmlPreview && (
              <div className="absolute h-full w-full bg-white z-999 border-primary-border">
                <div className="text-right bg-bg-base">
                  <Button icon={<CloseOutlined />} onClick={() => setHtmlPreview(null)} />
                </div>
                <HtmlRenderer html={htmlPreview.html} baseUrl={htmlPreview.baseUrl} />
              </div>
            )}
            <CodeEditor
              ref={resEditorRef}
              showActions
              value={resValue}
              language={resView}
              onChange={handleResponseChange}
              header={
                <Space size="large" >
                  <span className="text-lg">Response</span>
                  <span>
                    <Select
                      defaultValue="json"
                      style={{ width: 90 }}
                      onChange={responseViewChange}
                      options={[
                        { value: 'json', label: 'JSON' },
                        { value: 'text', label: 'RAW' },
                      ]}
                    />
                    <Button title="html preview" icon={<FundViewOutlined />} type="text" onClick={() => {
                      setHtmlPreview({
                        html: request?.response?.data,
                        baseUrl: request.url
                      })
                    }} />
                  </span>
                </Space>
              }
            />
          </div>
          <div className="flex-none h-6 m-1 pr-8">
            {responseActions && (
              <div className="flex-none h-6 m-1 pr-8">
                <Flex gap="small" align="center"
                  justify={responseActions.position || "start"}
                >
                  {responseActions.buttons.map((b, i) =>
                    <Button
                      key={i}
                      size="small"
                      disabled={!resActionsEnabled}
                      onClick={() => {
                        const mr = getModifiedResponse();
                        if (mr) {
                          b.onClick(mr);
                        }
                      }}
                      type={b.type || "default"}
                    >
                      {b.label}
                    </Button>
                  )}
                </Flex>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </PanelGroup>

  );
};

export default RequestEditor;