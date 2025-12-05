import HelpTab, {Section} from "@/components/help-tab.jsx";

const LiveObjectSearchHelpTab = ({ onDismiss }) => {
  return (
    <HelpTab
      title="Live Object Search"
      subtitle="Search, inspect, and modify live JavaScript objects directly from the browser’s runtime."
      onDismiss={onDismiss}
    >
      <>
        <Section>
          Live Object Search lets you explore active objects in memory without capturing a full heap snapshot.  
          It dynamically queries the browser’s runtime for objects that match specific keys, values, or structures.
        </Section>

        <Section>
          You can search by text, regular expression, or object shape to instantly locate the data you’re interested in:
          <br />
          <ul className="text-left mt-5 mb-10 list-disc! ml-4">
            <li>Find objects by property name or value using plain text or regex filters.</li>
            <li>Inspect live object references directly, without pausing execution.</li>
            <li>View nested structures, prototypes, and property values in real time.</li>
          </ul>
        </Section>

        <Section>
          Each result provides a <strong>live reference</strong> to the actual in-memory object.  
          This means you can:
          <br />
          <ul className="text-left mt-5 mb-10 list-disc! ml-4">
            <li>Modify or patch object properties directly from the inspector.</li>
            <li>Invoke methods on the live instance within the runtime context.</li>
            <li>Experiment with runtime changes without reloading the page.</li>
          </ul>
        </Section>

        <Section>
          The built-in <strong>Similarity Engine</strong> analyzes object structure and content to find objects that are <em>similar</em> to a selected one.  
          <br />
          <ul className="text-left mt-5 mb-10 list-disc! ml-4">
            <li>Detect cloned or mutated versions of an object.</li>
            <li>Group instances that share the same structural “shape.”</li>
            <li>Quickly trace data flow between memory and network layers.</li>
          </ul>
        </Section>

        <Section>
          Use Live Object Search to monitor and manipulate your application’s in-memory state in real time — ideal for debugging leaks, verifying object lifecycles, patching logic on the fly, and understanding how data propagates through your code.
        </Section>
      </>
    </HelpTab>
  )
};

export default LiveObjectSearchHelpTab;
