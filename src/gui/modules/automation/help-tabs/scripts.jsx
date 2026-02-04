import HelpTab, { Section } from "@/components/help-tab.jsx";
import imgNewFile from "@/assets/images/help-files-new.png";

const ScriptstHelpTab = ({ onDismiss }) => {
  return (
    <HelpTab
      title="Scripts"
      subtitle="The Script section lets you write and run JavaScript code directly in the browser"
      onDismiss={onDismiss}
    >
      <>
        <Section>

          Each script runs inside an async function, so you can use await directly.
          <br />
          An Utils object is available and provides useful helpers:

          <ul className="text-left mt-5 mb-10 list-disc! ml-4">
            <li>WB.Browser.Utils.getVar(name) → returns the variable with the specified name (same variable scope as the API Collection).</li>
            <li>WB.Browser.Utils.safeJsonStringify(obj) → safely converts any object to JSON without failing on circular references.</li>
            <li>
              WB.Browser.Utils.iterate(obj) → iterates through any structure (Object, Array, Map, etc.), e.g.
              <pre className="ml-10">
                for (const [k, v] of WB.Browser.Utils.iterate(obj))
              </pre>
            </li>
          </ul>
        </Section>
        <Section>
          Scripts can be executed manually or automatically:
          <ul>
            <li>Run on all open pages or only on specific ones.</li>
            <li>Auto-execute on page creation, before load, or after load.</li>
          </ul>
          Use scripts to automate tasks or modify pages within Wirebrowser.
        </Section>
        <Section>
          A return statement immediately terminates script execution, and the returned value is displayed in the bottom panel for quick inspection.
        </Section>
        <Section>
          Scripts are organized into files and folders for easy management
          <div className="mt-5">
            <img src={imgNewFile} className="w-38 h-auto" />
          </div>
        </Section>
      </>
    </HelpTab>
  )
};

export default ScriptstHelpTab;