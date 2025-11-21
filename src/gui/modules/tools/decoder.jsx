import { useState, useEffect, useRef } from "react";
import { Button, Dropdown, Space } from 'antd';
import { DownOutlined } from "@ant-design/icons";
import DynamicTabs from "@/components/dynamic-tabs";
import CodeEditor from "@/components/code-editor";
import { Buffer } from 'buffer';

const DecoderForm = ({ value, onDecode, onEncode }) => {
  const [decoderValue, setDecodertValue] = useState(value || "");
  const formats = [
    { label: "Base64", key: "base64" },
    { label: "URL", key: "url" },
    { label: "HTML", key: "html" },
    { label: "Base36", key: "base36" },
  ];

  useEffect(() => {
    setDecodertValue(value || "");
  }, [value]);

  return (
    <div>
      <div className="h-40">
        <CodeEditor
          language="plaintext"
          value={decoderValue}
          showActions={true}
          onChange={(val) => setDecodertValue(val)}
        />
      </div>
      <Space>
        <Dropdown
          size="small"
          menu={{
            items: formats,
            onClick: (e) => {
              onDecode(decoderValue, e.key);
            }
          }}
        >
          <Button size="small">
            <Space>
              Decode as
              <DownOutlined />
            </Space>
          </Button>
        </Dropdown>

        <Dropdown
          size="small"
          menu={{
            items: formats,
            onClick: (e) => {
              onEncode(decoderValue, e.key);
            }
          }}
        >
          <Button size="small">
            <Space>
              Encode as
              <DownOutlined />
            </Space>
          </Button>
        </Dropdown>
      </Space>
    </div>
  );
}


const DecoderTab = () => {
  const [decoderForms, setDecoderForms] = useState([""]);

  const decode = (val, format) => {
    try {
      switch (format) {
        case "base64":
          return Buffer.from(val, 'base64').toString('utf8');
        case "url":
          return decodeURI(val);
        case "html":
          const div = document.createElement("div");
          div.innerHTML = val;
          return div.textContent;
        case "base36":
          return parseInt(val, 36);
      }
    } catch (e) {
      return `${e}`;
    }
  }

  const encode = (val, format) => {
    try {
      switch (format) {
        case "base64":
          return Buffer.from(val, 'utf8').toString('base64');
        case "url":
          return encodeURI(val);
        case "html":
          const div = document.createElement("div");
          div.textContent = val;
          return div.innerHTML;
        case "base36":
          return parseInt(val).toString(36);
      }
    } catch (e) {
      return `${e}`;
    }
  }


  const onDecode = (val, format, target) => {
    const dec = decode(val, format);
    setDecoderForms(cur => {
      const next = cur.splice(0, target);
      next[target - 1] = val;
      next.push(dec);
      return next;
    })
  }


  const onEncode = (val, format, target) => {
    const enc = encode(val, format);
    setDecoderForms(cur => {
      const next = cur.splice(0, target);
      next[target - 1] = val;
      next.push(enc);
      return next;
    })
  }


  return (
    <div className="h-full overflow-auto">
      {decoderForms.map((v, i) => (
        <DecoderForm
          value={v}
          key={i}
          onEncode={(val, format) => onEncode(val, format, i + 1)}
          onDecode={(val, format) => onDecode(val, format, i + 1)}
        />
      ))}
    </div>
  );

}



const Decoder = () => {
  const tabsRef = useRef();

  const addTab = () => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <DecoderTab />
      );
    }
  };

  useEffect(() => {
    addTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <DynamicTabs
      ref={tabsRef}
      label="Decoder"
      hideAdd={false}
      onAddTabRequest={() => {
        addTab();
      }}
      noDataHelper={
        <Button className="mt-10" type="primary" onClick={addTab}>
          New Decoder
        </Button>
      }
    />
  );

}


export default Decoder;