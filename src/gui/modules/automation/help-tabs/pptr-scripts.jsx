import HelpTab, { Section } from "@/components/help-tab.jsx";
import imgNewFile from "@/assets/images/help-files-new.png";
import ExternalLink from "@/components//external-link";

const PptrScriptstHelpTab = ({ onDismiss }) => {
  return (
    <HelpTab
      title="Node Scripts"
      subtitle="Write and run JavaScript code in the Node.js context, with full access to Wirebrowser internals and Puppeteer."
      onDismiss={onDismiss}
    >
      <>
        <Section>
          Node scripts run inside an <strong>async function</strong>, so you can freely use <code>await</code> to handle asynchronous
          operations.
        </Section>

        <Section>
          Scripts execute in the <strong>Node.js scope</strong>, not in the browser page.
          This gives you direct access to Puppeteer, CDP primitives, filesystem APIs, and Wirebrowser runtime helpers.
        </Section>

        <Section>
          Wirebrowser exposes a global <code>WB</code> namespace that provides all scripting APIs.
          APIs are grouped by execution scope and domain, for example:
          <ul className="text-left mt-5 mb-10 list-disc! ml-4">
            <li><code>WB.Node.Utils</code> — generic helpers and utilities</li>
            <li><code>WB.Node.Memory</code> — memory inspection and heap analysis</li>
          </ul>
        </Section>

        <Section>
          Example:
          <pre className="ml-4 mt-3">
            {`const tabId = 1;
const page = WB.Node.Utils.getPage(tabId);
await page.goto("https://demo.wirebrowser.dev");

const results = await WB.Node.Memory.searchHeapSnapshot(tabId, {propertySearch:"token"})

return results;  // show the results in the UI
`}
          </pre>
        </Section>

        <Section>
          For the complete and always up-to-date API reference, see:
          <br />
          <ExternalLink
            href={`https://fcavallarin.github.io/wirebrowser/api/`}
            text="Wirebrowser API Reference"
          />
        </Section>

        <Section>
          Scripts are organized into files and folders for easy management.
          <div className="mt-5">
            <img src={imgNewFile} className="w-38 h-auto" />
          </div>
        </Section>
      </>
    </HelpTab>

  )
};

export default PptrScriptstHelpTab;