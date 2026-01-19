import { useEffect, useRef, useState } from "react";
import { useGlobal } from "@/global-context";
import { checkForNewVersion } from "@/utils";
import ExternalLink from "@/components//external-link";
import { CloseCircleOutlined } from "@ant-design/icons";


const UpdatesChecker = () => {
  const { appSettings } = useGlobal();
  const isActive = useRef(appSettings?.checkForUpdates ?? false);
  const lock = useRef(false);
  const [isChecking, setIsChecking] = useState(false);
  const lastCheckedAt = useRef(null);
  const skipVersions = useRef([]);
  const [newVersion, setNewVersion] = useState(null);
  useEffect(() => {
    if (!appSettings) {
      return;
    }
    isActive.current = appSettings.checkForUpdates;
  }, [appSettings]);


  const dismiss = (version) => {
    setNewVersion(null);
    skipVersions.current.push(version)
  };

  const check = async () => {
    if (lock.current
      || !isActive.current
      || (lastCheckedAt.current !== null && Date.now() - lastCheckedAt.current < 24 * 3600 * 1000)
    ) {
      return;
    }
    setIsChecking(true);
    lock.current = true;
    const j = await checkForNewVersion();

    setIsChecking(false);
    lock.current = false;
    lastCheckedAt.current = Date.now();
    if (skipVersions.current.includes(j.latest)) {
      return;
    }
    if (j.isNew) {
      setNewVersion(j.latest);
    } else {
      setNewVersion(null);
    }
  }
  useEffect(() => {
    const i = setInterval(() => {
      check();
    }, 1800 * 1000);
    check();
    return () => clearInterval(i);
  }, []);

  if (!isActive.current) {
    return <></>;
  }

  return (<>
    {newVersion && (<>
      <span
        className="hover:text-primary"
        title="dismiss"
        onClick={() => dismiss(newVersion)}
      >
        <CloseCircleOutlined />
      </span>
      <span className="italic"> New version {newVersion} is available </span>
      <ExternalLink href={`https://github.com/fcavallarin/wirebrowser/releases/tag/v${newVersion}`} text="download" />
    </>)}
    {isChecking && <span>Checking for updates</span>}
  </>);
};

export default UpdatesChecker;