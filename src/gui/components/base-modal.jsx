
import { Modal } from 'antd';


const BaseModal = ({ open, onCancel, onOk, title, footer, children }) => {

  return (
    <Modal
      open={open}
      title={title}
      onOk={onOk || onCancel}
      onCancel={onCancel}
      destroyOnHidden={true}
      style={{ top: 20, height: "90vh" }}
      styles={{
        body: {
          height: "calc(90vh - 110px)",
          overflowY: "auto",
        },
      }}
      width="90vw"
      footer={footer}
    >
      {children}
    </Modal>
  );
};

export default BaseModal;