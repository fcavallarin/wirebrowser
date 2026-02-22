import { Button, Modal } from 'antd';
import { useGlobal } from "@/global-context";
import CodeEditor from "@/components/code-editor";
import BaseModal from '@/components/base-modal';

const ScratchpadModal = ({ open, onClose }) => {
  const { settings, updateSettings } = useGlobal();
  
  const saveSettings = (v) => {
    updateSettings("scratchpad", {content: v || ""});
  }

  return (
    <BaseModal
      open={open}
      title="Scratchpad"
      onCancel={onClose}
      footer={[
        <Button type="primary" key="close" onClick={onClose}>Close</Button>,
      ]}
    >
      <CodeEditor
        showActions={true}
        language="plaintext"
        onChange={((v) => saveSettings(v))}
        value={settings?.scratchpad?.content ?? ""}
      />
    </BaseModal>
  );
};

export default ScratchpadModal;