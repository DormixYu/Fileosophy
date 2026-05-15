import { useState } from "react";
import { Share2, FolderOpen } from "lucide-react";
import { useShareStore } from "@/stores/useShareStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import ActiveShareRow, { normalizePath } from "@/components/sharing/ActiveShareRow";
import ConnectedPeerRow from "@/components/sharing/ConnectedPeerRow";
import RemoteFileBrowser from "@/components/sharing/RemoteFileBrowser";
import type { SavedConnection } from "@/types";

export default function MyShares() {
  const { shareStatus, savedConnections, startShare } = useShareStore();
  const { projects } = useProjectStore();
  const { addToast } = useNotificationStore();

  const [browsingConn, setBrowsingConn] = useState<SavedConnection | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [sharePath, setSharePath] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [shareLoading, setShareLoading] = useState(false);

  const hasShares = shareStatus.length > 0;
  const hasConnections = savedConnections.length > 0;
  const isEmpty = !hasShares && !hasConnections;

  const handleSelectFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true });
      if (selected) {
        setSharePath(selected as string);
        setShowStartDialog(true);
      }
    } catch {
      // 用户取消或出错
    }
  };

  const handleStartShare = async () => {
    if (!sharePassword.trim() || sharePassword.length < 4) {
      addToast({ type: "error", title: "密码不足", message: "密码至少 4 位" });
      return;
    }
    setShareLoading(true);
    try {
      await startShare(sharePath, sharePassword.trim());
      setShowStartDialog(false);
      setSharePath("");
      setSharePassword("");
      addToast({ type: "success", title: "共享已开启", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "启动失败", message: String(e) });
    } finally {
      setShareLoading(false);
    }
  };

  // 空状态 — 品牌化的 Share2 图标容器 + btn-primary
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        {/* 品牌化图标容器：gold-glow 背景 + gold 边框 */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
          style={{
            background: "var(--gold-glow)",
            border: "1px solid var(--gold)",
            boxShadow: "var(--shadow-gold)",
          }}
        >
          <Share2 size={24} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        </div>
        <p className="text-sm font-serif" style={{ color: "var(--text-secondary)" }}>
          暂无共享活动
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          分享一个项目文件夹，或连接到别人的共享
        </p>
        <button
          className="btn btn-primary mt-4"
          onClick={handleSelectFolder}
        >
          <FolderOpen size={14} strokeWidth={1.5} />
          选择文件夹共享
        </button>

        {showStartDialog && (
          <div
            className="mt-4 p-4 rounded-lg space-y-3"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
          >
            <p className="text-xs font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
              {sharePath}
            </p>
            <input
              type="password"
              value={sharePassword}
              onChange={(e) => setSharePassword(e.target.value)}
              placeholder="设置访问密码（至少 4 位）"
              autoFocus
              className="input-base w-full"
              onKeyDown={(e) => e.key === "Enter" && handleStartShare()}
            />
            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setShowStartDialog(false); setSharePath(""); setSharePassword(""); }}
              >
                取消
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleStartShare}
                disabled={shareLoading}
              >
                {shareLoading ? "启动中..." : "开始共享"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-6">
      {/* 正在分享区域 */}
      {hasShares ? (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
              正在分享
            </h2>
            <div
              className="w-8 h-[2px] rounded-full"
              style={{ background: "var(--gold)", opacity: 0.5 }}
            />
            <button className="btn btn-ghost btn-sm ml-auto" onClick={handleSelectFolder}>
              <FolderOpen size={12} strokeWidth={1.5} />
              添加共享
            </button>
          </div>
          <div className="space-y-2">
            {shareStatus.map((share) => {
              const matchedProject = projects.find(
                (p) => p.folder_path && normalizePath(p.folder_path) === normalizePath(share.path)
              );
              return <ActiveShareRow key={share.port} share={share} project={matchedProject} />;
            })}
          </div>

          {showStartDialog && (
            <div
              className="mt-3 p-4 rounded-lg space-y-3"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
            >
              <p className="text-xs font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                {sharePath}
              </p>
              <input
                type="password"
                value={sharePassword}
                onChange={(e) => setSharePassword(e.target.value)}
                placeholder="设置访问密码（至少 4 位）"
                autoFocus
                className="input-base w-full"
                onKeyDown={(e) => e.key === "Enter" && handleStartShare()}
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowStartDialog(false); setSharePath(""); setSharePassword(""); }}
                >
                  取消
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleStartShare}
                  disabled={shareLoading}
                >
                  {shareLoading ? "启动中..." : "开始共享"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          当前没有正在分享的项目
        </p>
      )}

      {/* 已连接项目区域 */}
      {hasConnections ? (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
              已连接项目
            </h2>
            <div
              className="w-8 h-[2px] rounded-full"
              style={{ background: "var(--gold)", opacity: 0.5 }}
            />
          </div>
          <div className="space-y-2">
            {savedConnections.map((conn) => (
              <ConnectedPeerRow
                key={conn.addr}
                conn={conn}
                onBrowse={() => setBrowsingConn(conn)}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
          还没有连接到别人的项目
        </p>
      )}

      {/* 远程文件浏览器弹窗 */}
      {browsingConn && (
        <RemoteFileBrowser
          conn={browsingConn}
          onClose={() => setBrowsingConn(null)}
        />
      )}
    </div>
  );
}