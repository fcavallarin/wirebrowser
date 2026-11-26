import HelpTab, {Section} from "@/components/help-tab.jsx";

const OriginTraceHelpTab = ({ onDismiss }) => {
  return (
    <HelpTab
      title="Origin Trace"
      subtitle="Trace the exact line of code where an object or value first appears during execution."
      onDismiss={onDismiss}
    >
      <>
        <Section>
          Origin Trace lets you identify the precise moment an object is created or mutated by combining debugger breakpoints with heap snapshots.
        </Section>

        <Section>
          Each time execution pauses, Wirebrowser captures the current heap and searches for the target value within that snapshot. This enables you to:
          <br />
          <ul className="text-left mt-5 mb-10 list-disc! ml-4">
            <li>Pinpoint the line of code where a string, object, or value originates.</li>
            <li>Validate assumptions about which code paths create or modify specific data.</li>
          </ul>
        </Section>

        <Section>
          By default the trace starts on the next click. To trace values produced in other ways (hover, typing,
          timers, network responses, page load), set <i>Start on</i> to Breakpoint, or use <i>Start Origin Trace at
          Cursor Position</i> in Sources: the trace starts the first time that location runs. Place it before the
          value is created.
        </Section>

        <Section>
          Origin Trace automatically applies Heuristic Framework Blackboxing (based on script's url) to avoid stepping into framework and vendor code, keeping the trace focused on your application logic.
        </Section>

        <Section>
          Use this tool when you need to understand where a value is coming from, why it exists, or how it is being modified during runtime.
        </Section>
      </>
    </HelpTab>
  )
};

export default OriginTraceHelpTab;
