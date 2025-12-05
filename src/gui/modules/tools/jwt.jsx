import { useState, useEffect, useRef } from "react";
import { Button, Input, Form, Select, Flex } from 'antd';
import DynamicTabs from "@/components/dynamic-tabs";
import CodeEditor from "@/components/code-editor";
import { createJwt, verifyJwt, showNotification } from "@/utils";


const JwtTab = () => {
  const [formCreate] = Form.useForm();
  const [formVerify] = Form.useForm();
  const [jwtToken, setJwtToken] = useState("");
  const [decodedJwtToken, setDecodedJwtToken] = useState("");
  const [decodeErrors, setDecodeErrors] = useState(null);
  const [decodeAlgo, setDecodeAlgo] = useState("");


  useEffect(() => {
    setDecodedJwtToken("");
    setDecodeAlgo("");
    setDecodeErrors(null);
  }, [jwtToken]);

  const create = async (values) => {
    let payload;
    try {
      payload = JSON.parse(values.payload);
    } catch (e) {
      showNotification({ type: "error", message: "Payload is not a valid json" });
      return;
    }
    const jwt = await createJwt(payload, values.secret, {
      expiresIn: Number(values.expiresIn),
      algorithm: values.algo
    });
    formVerify.setFieldsValue({
      jwtToken: jwt
    });
    setJwtToken(jwt);
  };

  const verify = async (values) => {
    const secret = formCreate.getFieldValue("secret");
    if (!secret) {
      showNotification({ type: "error", message: "Set a secret key" });
      return;
    }
    if (!values.jwtToken) {
      showNotification({ type: "error", message: "No JWT token to verify" });
      return;
    }
    setDecodedJwtToken("");
    setDecodeAlgo("");
    setDecodeErrors(null);
    try {
      const v = await verifyJwt(values.jwtToken, secret);
      setDecodedJwtToken(JSON.stringify(v.payload, null, 2));
      setDecodeAlgo(v.algorithm);
      setDecodeErrors(v.errors);
    } catch (e) {
      showNotification({ type: "error", message: `${e}` });
    }
  };

  return (
    <div className="h-full overflow-auto">
      <Form
        form={formCreate}
        onFinish={create}
        layout="vertical"
        initialValues={{
          expiresIn: "3600",
          payload: "{}",
          algo: "SHA-256"
        }}
      >
        <Form.Item
          name="secret"
          label="Secret Key"
          rules={[{ required: true, message: "Set a secret key" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="payload">
          <CodeEditor
            height="100"
            showActions={true}
            resize="vertical"
          />
        </Form.Item>
        <Flex direction="horiontal" className="mt-15!" gap="large">
          <Form.Item
            name="expiresIn"
            label="Expires In"
            defaultValue="3600"
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="algo"
            label="Sign Algorithm"
          >
            <Select options={[
              { value: "SHA-256", label: "HS256" },
              { value: "SHA-384", label: "HS384" },
              { value: "SHA-512", label: "HS512" },
              { value: "none", label: "None" },
            ]} />
          </Form.Item>
        </Flex>
        <Form.Item>
          <Button type="primary" htmlType="submit">
            Create JWT Token
          </Button>
        </Form.Item>
      </Form>
      <div>
        <Form
          form={formVerify}
          onFinish={verify}
          onValuesChange={(values) => {
            setJwtToken(values.jwtToken);
          }}
          layout="vertical"
        >
          <Form.Item
            name="jwtToken"
            label="JWT Token"
          >
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              Verify JWT Token
            </Button>
          </Form.Item>
        </Form>
      </div>
      <div>
        {decodeErrors !== null && (
          decodeErrors.length > 0 ? (
            decodeErrors.map((e, i) => (
              <span key={i} className="text-error">{e}</span>
            ))
          ) : <span key="valid" className="text-success">The JWT Token is valid</span>
        )}
        {decodeAlgo && (
          <div>Algorithm: {decodeAlgo}</div>
        )}

        <CodeEditor value={decodedJwtToken} height="100" resize="vertical"/>
      </div>
    </div>

  );
}


const Jwt = () => {
  const tabsRef = useRef();

  const addTab = () => {
    if (tabsRef.current) {
      tabsRef.current.addTab(
        <JwtTab />
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
      label="Jwt"
      hideAdd={false}
      onAddTabRequest={() => {
        addTab();
      }}
      noDataHelper={
        <Button className="mt-10" type="primary" onClick={addTab}>
          New JWT Tool
        </Button>
      }
    />
  );

}


export default Jwt;