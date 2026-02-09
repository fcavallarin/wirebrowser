import HelpTab, { Section } from "@/components/help-tab.jsx";
import imgNewFile from "@/assets/images/help-files-new.png";
import ExternalLink from "@/components//external-link";


const ScriptstHelpTab = ({ onDismiss }) => {
  return (
    <HelpTab
      title="Browser Scripts"
      subtitle="Write and run JavaScript code directly inside the browser page context."
      onDismiss={onDismiss}
    >
      <>
        <Section>
          Browser scripts run inside an <strong>async function</strong> and execute in the
          <strong> page JavaScript context</strong>. You can freely use <code>await</code>,
          but you do <em>not</em> have access to Node.js or Puppeteer APIs.
        </Section>

        <Section>
          These scripts behave like code executed in the browser console, but with additional
          Wirebrowser helpers and automation capabilities.
        </Section>

        <Section>
          Wirebrowser exposes a global <code>WB</code> namespace for browser-side scripting.
          APIs are grouped by execution scope and domain, for example:
          <ul className="text-left mt-5 mb-10 list-disc! ml-4">
            <li><code>WB.Browser.Utils</code> — generic helpers and utilities</li>
          </ul>
        </Section>

        <Section>
          Example:
          <pre className="ml-4 mt-3">
            {`const url = WB.Browser.Utils.getVar("url");
document.location.href = url;

for (const [k, v] of WB.Browser.Utils.iterate(window.obj)) {
  console.log(k, v);
}
`}
          </pre>

        </Section>

        <Section>
          Scripts can be executed manually or automatically:
          <ul className="mt-3 list-disc! ml-4">
            <li>Run on all open pages or only on specific ones</li>
            <li>Auto-execute on page creation, before load, or after load</li>
          </ul>
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

export default ScriptstHelpTab;