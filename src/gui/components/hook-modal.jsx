import { Button, Form } from 'antd';
import BaseModal from '@/components/base-modal';
import HookForm from "@/components/hook-form";
import { showNotification, copyToClipboard } from "@/utils";

const HookModal = ({ open, formValues, onClose, onFinish, includePageId, pageId }) => {
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
    const values = await getValues();
    if (formValues?.id) {
      values.id = formValues.id;
    }
    onFinish(code, values);
  }

  const copyCode = async () => {
    const code = await generateCode();
    if (!code) return;
    copyToClipboard(code, () => {
      onClose();
    });
  };

  // const escapBacktick = (code) => {
  //   return code.replace(/`/g, '\\`');
  // };

  const generateCode = async () => {
    const values = await getValues();
    if (!values) return;
    const handlers = values.handlers.replace(
      /^\s*const\s+handlers\s*=\s*\{\s*/,
      ""
    ).replace(
      /\s*\}\s*;?\s*$/,
      ""
    );
    const handleResult = values.handleResult.split("\n").join("\n  ");
    const code = [
      `try {`,
      `  await WB.Node.Instrumentation.stopHooks()`,
      `} catch (e) { }`,
      ``,
      `WB.Node.Instrumentation.addHook({ file: "${values.file}", line: ${values.line}, col: ${values.col} }, {`,
      `  ${handlers}`,
      `},`,
      `  ${handleResult}`,
      ");",
      "",
      `await WB.Node.Instrumentation.startHooks(${pageId || values.pageId});`
    ];
    return code.join("\n");
  }

  return (
    <BaseModal title="Create Hook" open={open} onCancel={onClose} footer={[
      <Button key="copy" onClick={copyCode}>Copy Code</Button>,
      <Button key="create" type="primary" onClick={createHook}>{formValues?.id ? "Save" : "Create"}</Button>
    ]}>
      <HookForm form={form} formValues={formValues} includePageId={includePageId} />
    </BaseModal>
  );
}

export default HookModal;