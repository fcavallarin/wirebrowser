import { InfoCircleOutlined } from "@ant-design/icons";
import { Button } from "antd";

export const Section = ({ children }) => (
  <div className="mt-5">{children}</div>
)

const HelpTab = ({ title, subtitle, buttonText = "Dismiss", onDismiss, children }) => {
  return (
    <div className="h-full p-8 relative overflow-auto">
      <div className="flex justify-center mb-4">
        <div className=" p-4 rounded-full">
          <InfoCircleOutlined className=" text-6xl" />
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">
        {title}
      </h2>

      {subtitle && (
        <p className="mb-6 leading-relaxed">
          {subtitle}
        </p>
      )}
      
        {children}
      
      {onDismiss && (
        <div className="mt-8 text-center">
          <Button
            type="primary"
            size="large"
            className="!rounded-full !px-8 !py-5 !text-lg"
            onClick={onDismiss}
          >
            {buttonText}
          </Button>
        </div>
      )}
    </div>
  );
}

export default HelpTab;