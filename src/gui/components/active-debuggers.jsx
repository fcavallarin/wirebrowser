import { useGlobal } from "@/global-context";
import { Button } from 'antd';
import { BugOutlined, CloseCircleOutlined } from "@ant-design/icons";
import useFloatingPopover from "@/hooks/useFloatingPopover";
import {dispatchGlobalApiEvent} from "@/utils";

const ActiveDebuggers = ({ onChange, value, multiple = true, ...props }) => {
  const { activeDebuggers } = useGlobal();
  const { openFloatingPopover, FloatingPopover } = useFloatingPopover();

  const disableDebugger = (pageId) => {
    dispatchGlobalApiEvent("debugger.disable", {pageId});
  }

  return (
    <>
      <span
        onClick={(event) => openFloatingPopover(event.clientX, event.clientY - 10)}
        title="Active Debuggers"
        className={`${activeDebuggers.length > 0 ? 'text-success-900' : ''} hover:text-primary`}
      >
        <BugOutlined />
      </span>
      <FloatingPopover>
        <div className="w-50">
          {activeDebuggers.length > 0 ? (
            <>
              <div className="font-bold mb-3">Active Debuggers</div>
              {activeDebuggers.map(pageId => (
                <div key={pageId}>
                  <Button
                  title="Disable"
                  type="text"
                  icon={<CloseCircleOutlined />}
                  onClick={()=> disableDebugger(pageId)}
                  />
                  Page{pageId}
                </div>
              ))}
            </>
          ) : (
            <div className="font-bold italic">No Active Debuggers</div>
          )}
        </div>
      </FloatingPopover>
    </>
  )
}

export default ActiveDebuggers;