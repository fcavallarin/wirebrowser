import MainTabs from "@/components/main-tabs.jsx";
import SearchSnapshot from "@/modules/memory/search-snapshot";
import LiveObjects from "@/modules/memory/live-objects";
import OriginTrace from "@/modules/memory/origin-trace";

const Memory = () => {
  const tabItems = [

    {
      key: "live-objects",
      label: "Live Objects",
      children: <LiveObjects />
    },
    {
      key: "origin-trace",
      label: "Origin Trace",
      children: <OriginTrace />
    },
    {
      key: "search-snapshot",
      label: "Heap Snapshot",
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