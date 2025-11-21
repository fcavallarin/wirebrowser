import { useState, useEffect, useRef } from "react";
import RequestEditor from "@/components/request-editor";
import { useApiEvent } from "@/hooks/useEvents";
import { Button } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, LoadingOutlined } from "@ant-design/icons";
import { Request, Response } from "@/../common/models";


const RequestCreator = ({ request, onChange }) => {
  const [currentRequest, setCurrentRequest] = useState(request);
  const [currentRequestIndex, setCurrentRequestIndex] = useState(0);
  const [historyPrevEnabled, setHistoryPrevEnabled] = useState(false);
  const [historyNextEnabled, setHistoryNextEnabled] = useState(false);
  const [actionsEnabled, setActionsEnabled] = useState(true);
  const executingRequestId = useRef(null);
  const requestHistory = useRef([request]);

  useEffect(() => {
    setCurrentRequest(request);
  }, [request]);

  useEffect(() => {
    setHistoryPrevEnabled(currentRequestIndex > 0);
    setHistoryNextEnabled(currentRequestIndex < requestHistory.current.length - 1);
  }, [currentRequestIndex]);

  const { dispatchApiEvent } = useApiEvent({
    "network.sendUserRequestExecuted": (reqId) => {
      executingRequestId.current = reqId;
    },
    "network.sendUserRequestDone": (response) => {
      setActionsEnabled(true);
      executingRequestId.current = null;
      if (!response) {
        return;
      }
      setCurrentRequest(cur => {
        const next = new Request(cur);
        next.response = new Response(response);
        requestHistory.current[currentRequestIndex] = next;
        return next;
      });
    }
  });

  const sendRequest = (req) => {
    setActionsEnabled(false);
    if (!req.compare(currentRequest)) {
      setCurrentRequest(req);
      setCurrentRequestIndex(requestHistory.current.length);
      requestHistory.current.push(req);
    }

    dispatchApiEvent("network.sendUserRequest", req);
  }

  const cancelExecutingRequest = () => {
    if (!executingRequestId.current) {
      return;
    }
    dispatchApiEvent("network.cancelUserRequest", executingRequestId.current);
    executingRequestId.current = null;
    setActionsEnabled(true);
  };

  const historyPrev = () => {
    setCurrentRequest(requestHistory.current[currentRequestIndex - 1]);
    setCurrentRequestIndex(cur => cur - 1);
  }

  const historyNext = () => {
    setCurrentRequest(requestHistory.current[currentRequestIndex + 1]);
    setCurrentRequestIndex(cur => cur + 1);
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex-none">
          <Button
            type="text"
            disabled={!historyPrevEnabled}
            onClick={historyPrev}
            icon={<ArrowLeftOutlined />}
          />
          <Button
            type="text"
            disabled={!historyNextEnabled}
            onClick={historyNext}
            icon={<ArrowRightOutlined />}
          />
        </div>
        <RequestEditor
          request={currentRequest}
          requestActionsEnabled={actionsEnabled}
          onChange={onChange}
          requestActions={{
            position: "end",
            buttons: [
              { label: "Send", type: "primary", onClick: req => sendRequest(req) },
            ]
          }}
        />
      </div>
      <div
        className={`
          absolute top-0 left-0 ${actionsEnabled ? "h-0" : "h-full"}
          ${actionsEnabled ? "opacity-0" : "opacity-100"} w-full bg-black/50
          flex items-center justify-center transition-opacity duration-1000
        `}
      >
        {!actionsEnabled && (
          <div>
            <div className="text-center">
              <LoadingOutlined className="text-5xl" />
            </div>
            <div className="mt-20">
              <Button type="primary" onClick={cancelExecutingRequest}>CANCEL</Button>
            </div>
          </div>
        )}
      </div>

    </>
  )
}

export default RequestCreator;