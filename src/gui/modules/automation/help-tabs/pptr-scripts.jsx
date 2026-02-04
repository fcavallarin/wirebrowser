import HelpTab, { Section } from "@/components/help-tab.jsx";
import imgNewFile from "@/assets/images/help-files-new.png";


const PptrScriptstHelpTab = ({ onDismiss }) => {
  return (
    <HelpTab
      title="Puppeteer Scripts"
      subtitle="The Puppeteer Script section lets you write and run JavaScript code directly in the Node.js scope, with full access to Puppeteer"
      onDismiss={onDismiss}
    >
      <>
        <Section>
          Each script runs inside an async function, so you can freely use await to handle asynchronous operations.
        </Section>
        <Section>
          An Utils object is available, providing a set of helper functions and tools:
          <br />
          <ul className="text-left mt-5 mb-10 list-disc! ml-4">
            <li>WB.Node.Utils.getPage(id) → returns the Puppeteer page() object with the given ID.</li>
            <li>WB.Node.Utils.getVar(name) → returns the variable with the specified name (same variable scope as the API Collection).</li>
            <li>WB.Node.Utils.safeJsonStringify(obj) → safely converts any object to JSON without failing on circular references.</li>
            <li>
              WB.Node.Utils.iterate(obj) → iterates through any structure (Object, Array, Map, etc.), e.g.
              <pre className="ml-10">
                for (const [k, v] of WB.Node.Utils.iterate(obj))
              </pre>
            </li>
            <li>WB.Node.Utils.httpClient.got → exposes the got HTTP client for making network requests directly from Node.</li>
          </ul>
        </Section>
        <Section>
          Use Puppeteer Scripts to automate browser actions, scrape data, manipulate pages, or coordinate complex workflows across multiple browser contexts within Wirebrowser.
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

export default PptrScriptstHelpTab;