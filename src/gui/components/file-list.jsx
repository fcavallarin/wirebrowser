import { useState, useEffect, useRef } from "react";
import { Button, Input, Space, Menu, Tree, Dropdown } from "antd";
import { useGlobal } from "@/global-context";
import { showNotification } from "@/utils";

const FileList = ({
  files,
  selected,
  onSelectFile,
  onSelectDir,
  onRename,
  onDelete,
  onMove,
  onClone,
  onNewFile,
  onNewDir
}) => {
  const [expandedKeys, setExpandedKeys] = useState(files ? files.map(f => f.id) : []);
  const [selectedFile, setSelectedFile] = useState(selected || null);
  const [selectedDir, setSelectedDir] = useState(null);
  const [renamingKey, setRenamingKey] = useState(null);
  const [renamingValue, setRenamingValue] = useState(null);
  const { modal } = useGlobal();

  useEffect(() => {
    if (!files) {
      return;
    }
    for (const f of files) {
      if (f.name === "") {
        setRenamingKey(f.id);
        setRenamingValue("");
        break;
      }
    }
    if (expandedKeys.length === 0) {
      setExpandedKeys(files.map(f => f.id));
    }
    if (!selectedDir) {
      setSelectedDir(files.find(f => f.parentId === null)?.id);
    }
  }, [files]);

  useEffect(() => {
    if (onSelectFile) {
      onSelectFile(selectedFile || null);
    }
  }, [selectedFile]);

  useEffect(() => {
    if (onSelectDir) {
      onSelectDir(selectedDir || null);
    }
  }, [selectedDir]);

  useEffect(() => {
    setSelectedFile(selected);
  }, [selected]);


  const handleMenuClick = (node, e) => {
    e.domEvent.stopPropagation();
    switch (e.key) {
      case "clone":
        onClone(node.id);
        break;
      case "rename":
        setRenamingKey(node.id)
        break;
      case "delete":
        deleteFile(node);
        break;
      case "new-file":
        onNewFile(node.id);
        break;
      case "new-dir":
        onNewDir(node.id);
        break;
      default:
        break;
    }
  };

  const getMenu = (node) => {
    const items = node.type === "dir" && onNewFile && onNewDir
      ? [
        { key: "new-file", label: "New File" },
        { key: "new-dir", label: "New Folder" },
      ]
      : [];

    if (node.parentId !== null) {
      if (onClone) {
        items.push({ key: "clone", label: "Clone" });
      }
      if (onRename) {
        items.push({ key: "rename", label: "Rename" });
      }
      if (onDelete) {
        items.push({ key: "delete", label: "Delete" });
      }
    }
    return {
      onClick: (e) => handleMenuClick(node, e),
      items
    }
  };

  const getFileFromDir = (fileName, dirId) => {
    return files.find(f => f.parentId === dirId && f.name === fileName);
  }

  const notifyFileAlreadyExists = (fileName) => {
    showNotification({
      type: "error",
      message: "File Already Exists",
      description: `A file named '${fileName}' already exists`
    });
  }

  const renameFile = (file, newName) => {
    const existing = getFileFromDir(newName, file.parentId);
    if (existing && existing.id !== file.id) {
      notifyFileAlreadyExists(newName);
      return;
    }
    setRenamingKey(null);
    setRenamingValue(null);
    if (onRename) {
      onRename(file.id, newName);
    }
  };

  const deleteFile = (file) => {
    modal.confirm({
      content: `Delete ${file.name}?`,
      onOk: () => {
        onDelete(file.id);
      },
    });
  };

  const moveFile = (e) => {
    if (!onMove) {
      return;
    }
    const dragId = e.dragNode.key;
    let targetId = e.node.key;
    const file = files.find(f => f.id === dragId);
    const targetFile = files.find(f => f.id === targetId);
    if (targetFile.type !== "dir") {
      targetId = targetFile.parentId;
    }
    if (getFileFromDir(file.name, targetId)) {
      notifyFileAlreadyExists(file.name);
      return;
    }
    if (!e.dropToGap) {
      onMove(dragId, targetId);
    }
  }

  const buildTreeData = (files, parentId = null) => {
    const children = files.filter((f) => f.parentId === parentId);

    children.sort((a, b) => {
      if (a.type === "dir" && b.type !== "dir") return -1;
      if (a.type !== "dir" && b.type === "dir") return 1;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

    return children.map((f) => {
      let title = <Dropdown menu={getMenu(f)} trigger={["contextMenu"]}>
        <span className="inline-block w-[85%]!">{f.name}</span>
      </Dropdown>;
      if (onRename && f.id === renamingKey) {
        title = <Input
          autoFocus={true}
          value={renamingValue !== null ? renamingValue : f.name}
          onBlur={(e) => renameFile(f, e.target.value)}
          onPressEnter={(e) => renameFile(f, e.target.value)}
          onChange={(e) => setRenamingValue(e.target.value)}
          className={`h-5 inline-block w-[80%]! ${!renamingValue && !f.name && "border-success-900!"}`}
        />;
        if (!expandedKeys.includes(f.parentId)) {
          setExpandedKeys(cur => [...cur, f.parentId]);
        }
      }
      const fSelectedStyle = f.id === selectedFile ? "bg-bg-elevated-500!" : "";
      const dSelectedStyle = f.id === selectedDir ? "text-primary-100! font-bold" : "";
      return {
        key: f.id,
        title,
        type: f.type,
        isLeaf: f.type === "file",
        children: buildTreeData(files, f.id),
        className: `rounded-md ${fSelectedStyle} ${dSelectedStyle}`
      }
    })
  };

  const handleClick = (e, node) => {
    e.stopPropagation();
    if (node.type === "dir") {
      setExpandedKeys(cur =>
        cur.includes(node.key)
          ? cur.filter((k) => k !== node.key || k === files.find(f => f.parentId === null).id)
          : [...cur, node.key]
      );
      setSelectedDir(node.key);
    } else {
      setSelectedFile(node.key);
    }
  };

  const treeData = buildTreeData(files || []);
  return (<>
    <Tree.DirectoryTree
      treeData={treeData}
      expandedKeys={expandedKeys}
      selectedKeys={[selectedFile]}
      selectable={false}
      onClick={(e, node) => handleClick(e, node)}
      draggable={{
        icon: false,
        nodeDraggable: (node) => {
          if (!files) {
            return false;
          }
          return (files.find(f => f.id === node.key) || {}).parentId !== null;
        }
      }}
      blockNode={true}
      onDragStart={(info) => {
        info.event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.event.nativeEvent.preventDefault();
        e.event.nativeEvent.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        moveFile(e);
      }}
      allowDrop={({ dropNode, dragNode, dropPosition }) => {
        const targetFile = files.find(f => f.id === dropNode.key);
        if (targetFile.type !== "dir") {
          return false;
        }
        return true
      }}
    />
    {(!files || files.length < 2) && onNewFile && onNewDir && (
      <Space>
        <Button onClick={() => onNewDir()}>New Folder</Button>
        <Button onClick={() => onNewFile()}>New File</Button>
      </Space>
    )}
  </>);
};

export default FileList;