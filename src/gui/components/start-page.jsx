import { useEffect, useState } from "react";
import { Card } from "antd";
import {
  PlusOutlined,
  FolderOpenOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { dispatchGlobalApiEvent } from "@/utils";
import { useGlobal } from "@/global-context";


const StartPage = ({ chromeInstallData }) => {
  const [isLoading, setIsLoding] = useState(false);
  const [waitLoadSettings, setWaitLoadSettings] = useState(false);
  const [isFilebrowserLoading, setIsFilebrowseLoding] = useState(false);
  const { settings } = useGlobal();

  useEffect(() => {
    if (settings && waitLoadSettings) {
      setIsLoding(true);
      dispatchGlobalApiEvent('runBrowser');
    }
  }, [settings, waitLoadSettings]);

  const handleSelect = async () => {
    setIsFilebrowseLoding(true);
    const file = await window.electronAPI.selectFile();
    setIsFilebrowseLoding(false);
    if (file) {
      setWaitLoadSettings(true);
      dispatchGlobalApiEvent("settings.setDbFile", file);
    }
  };

  const handleCreate = async () => {

    setIsFilebrowseLoding(true);
    let file = await window.electronAPI.createFile();
    setIsFilebrowseLoding(false);
    if (file) {
      if (!file.toLowerCase().endsWith(".json")) {
        file += ".json";
      }
      setIsFilebrowseLoding(false);
      dispatchGlobalApiEvent("settings.setDbFile", file);
      setIsLoding(true);
      dispatchGlobalApiEvent('runBrowser');
    }
  };

  const handleTempProject = () => {
    setWaitLoadSettings(true);
    dispatchGlobalApiEvent("settings.setDbFile", null);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg-base p-6">
      <h1 className="text-3xl font-bold mb-8 text-[#e5e5e5]">
        {!chromeInstallData
          ? "Welcome to WireBrowser"
          : "Wirebrowser uses a dedicated Chrome runtime"
        }
      </h1>
      {!isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          <Card
            className="cursor-pointer opacity-75 hover:shadow-xl hover:opacity-100"
            onClick={handleTempProject}
            cover={
              <div className="flex items-center justify-center h-40 pt-2 pl-1 bg-primary-bg-700">
                <ThunderboltOutlined className="text-5xl text-warning" />
              </div>
            }
          >
            <Card.Meta
              title="Temporary Project"
              description="Start a project saving it to a temporary file."
            />
          </Card>

          <Card
            className="cursor-pointer opacity-75 hover:shadow-xl hover:opacity-100"
            onClick={handleCreate}
            cover={
              <div className="flex items-center justify-center h-40 pt-2 pl-1 bg-primary-bg-600">
                <PlusOutlined className="text-5xl text-[#7186B0]" />
              </div>
            }
          >
            <Card.Meta
              title="Create New Project"
              description="Select a file where the new project will be saved."
            />
          </Card>

          <Card
            className="cursor-pointer opacity-75 hover:shadow-xl hover:opacity-100"
            onClick={handleSelect}
            cover={
              <div className="flex items-center justify-center h-40 pt-2 pl-2 bg-primary-bg-500">
                <FolderOpenOutlined className="text-5xl" />
              </div>
            }
          >
            <Card.Meta
              title="Open Existing Project"
              description="Choose from a previously created project."
            />
          </Card>
        </div>
      ) : (
        <div className="h-[280px] flex items-center justify-center text-text-base flex-col">
          <LoadingOutlined className="text-5xl" />
          {chromeInstallData && (
            <>
              <div className="text-xl text-text-base mt-6">
                Chrome is being downloaded to
              </div>
              <div className="text-sm text-text-base mt-6">{chromeInstallData.path}</div>
              <div className="text-sm text-text-base mt-6">This is a one-time operation</div>
              {chromeInstallData.isLinux && chromeInstallData.isPackaged && (
                <div className="text-text-base text-sm mt-10">
                  <p>
                    On Linux, Chrome security policies require unpacked extensions to be stored in a visible directory (not hidden).
                  </p>

                  <p>For this reason, Wirebrowser will install its Chrome extension in: <br />
                    <br />
                    ~/wirebrowser/chrome-extension/
                    <br />
                    <br />
                    This is expected behavior and is required for the extension to work correctly. <br />
                    Please do not move or hide this directory.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {isFilebrowserLoading && (
        <div className="absolute top-0 left-0 bg-black opacity-20 h-screen w-screen"></div>
      )}
    </div>
  );
};

export default StartPage;
