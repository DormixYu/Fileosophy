import { useState, useCallback } from "react";
import Modal from "@/components/common/Modal";
import { useShareStore } from "@/stores/useShareStore";
import RemoteFileBrowserPanel from "./RemoteFileBrowserPanel";
import type { SavedConnection } from "@/types";

interface RemoteFileBrowserProps {
  conn: SavedConnection;
  onClose: () => void;
}

export default function RemoteFileBrowser({ conn, onClose }: RemoteFileBrowserProps) {
  const [password, setPassword] = useState("");
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const { updateLastPath } = useShareStore();

  const handlePathChange = useCallback((path: string) => {
    updateLastPath(conn.addr, path);
  }, [conn.addr, updateLastPath]);

  const footerContent = !passwordSubmitted ? (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>
        取消
      </button>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => setPasswordSubmitted(true)}
        disabled={!password.trim()}
      >
        连接
      </button>
    </>
  ) : (
    <button className="btn btn-ghost btn-sm" onClick={onClose}>
      关闭
    </button>
  );

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`远程文件 — ${conn.label}`}
      width="max-w-md"
      footer={footerContent}
    >
      <div className="space-y-3">
        {!passwordSubmitted ? (
          <div>
            <label
              className="block text-xs mb-1.5 font-serif"
              style={{ color: "var(--text-muted)" }}
            >
              输入访问密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入共享密码"
              autoFocus
              className="input-base w-full"
              onKeyDown={(e) =>
                e.key === "Enter" &&
                password.trim() &&
                setPasswordSubmitted(true)
              }
            />
          </div>
        ) : (
          <RemoteFileBrowserPanel
            addr={conn.addr}
            password={password}
            initialPath={conn.last_path || ""}
            showUpload={true}
            useStoreUpload={true}
            onPathChange={handlePathChange}
          />
        )}
      </div>
    </Modal>
  );
}