import { Button, Form } from 'antd';
import BaseModal from '@/components/base-modal';
import LiveHookForm from "@/components/livehook-form";
import { showNotification, copyToClipboard } from "@/utils";

const LiveHookModal = ({ open, formValues, onClose, onFinish }) => {
  const [form] = Form.useForm();

  const getValues = async () => {
    try {
      return await form.validateFields();
    } catch { }
    return null;
  }
  const createHook = async () => {
    const code = await generateCode();
    if (!code) return;
    onFinish(code);
  }

  const copyCode = async () => {
    const code = await generateCode();
    if (!code) return;
    copyToClipboard(code, () => {
      onClose();
    });
  };

  const escapBacktick = (code) => {
    return code.replace(/`/g, '\\`');
  };

  const generateCode = async () => {
    const values = await getValues();
    if (!values) return;
    const code = [
      `try {`,
      `  await WB.Node.Memory.stopLiveHooks()`,
      `} catch (e) { }`,
      ``,
      `WB.Node.Memory.addLiveHook({`,
      `  hookType: "${values.hookType}",`,
      `  file: "${values.file}",`,
      `  line: ${values.line},`,
      `  col: ${values.col},`
    ];
    if (values.condition) {
      code.push('  condition: `' + escapBacktick(values.condition) + '`,');
    }
    if (values.hookType == "inject") {
      code.push('  code: `' + escapBacktick(values.code) + '`,');
    }
    if (values.hookType == "return") {
      code.push('  returnExpr: `' + escapBacktick(values.returnExpr) + '`,');
    }

    code.push("});", "", `await WB.Node.Memory.startLiveHooks(${values.pageId});`);
    return code.join("\n");
  }

  return (
    <BaseModal title="Create Live Hook" open={open} onCancel={onClose} footer={[
      <Button key="copy" onClick={copyCode}>Copy Code</Button>,
      <Button key="create" type="primary" onClick={createHook}>Create</Button>
    ]}>
      <LiveHookForm form={form} formValues={formValues} />
    </BaseModal>
  );
}

export default LiveHookModal;