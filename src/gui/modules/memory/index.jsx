import MainTabs from "@/components/main-tabs.jsx";
import SearchSnapshot from "@/modules/memory/search-snapshot";
import LiveObjects from "@/modules/memory/live-objects";


const Memory = () => {
  const tabItems = [
    {
      key: "live-objects",
      label: "Live Objects",
      // children: <div className="h-[calc(100vh-70px)]"><LiveObjects /></div>
      // children: <div className="flex h-full"><LiveObjects /></div>
      children: <LiveObjects />
    },
    {
      key: "search-snapshot",
      label: "Heap Snapshot",
      // children: <div className="h-[calc(100vh-95px)]"><SearchSnapshot /></div>
      children: <SearchSnapshot />
    },
  ]

  return (
    <MainTabs
      items={tabItems}
    />
  );

}


export default Memory;