import Scripts from "@/modules/automation/scripts";
import PptrScripts from "@/modules/automation/pptr-scripts";
import MainTabs from "@/components/main-tabs.jsx";

const Automation = () => {
  const tabItems = [
    {
      key: "scripts",
      label: "Scripts",
      // children: <div className="h-[calc(100vh-90px)]"><Scripts /></div>
      children: <Scripts />
    },
    {
      key: "pptr-scripts",
      label: "Node Scripts",
      children: <PptrScripts />
    },
  ]

  return (
    <MainTabs
      items={tabItems}
      // className="flex-1 flex flex-col"
    />
  );

}


export default Automation;