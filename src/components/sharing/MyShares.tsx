import { useState } from "react";
import { Share2 } from "lucide-react";
import { useShareStore } from "@/stores/useShareStore";
import { useProjectStore } from "@/stores/useProjectStore";
import EmptyState from "@/components/common/EmptyState";
import ActiveShareRow, { normalizePath } from "@/components/sharing/ActiveShareRow";
import ConnectedPeerRow from "@/components/sharing/ConnectedPeerRow";
import RemoteFileBrowser from "@/components/sharing/RemoteFileBrowser";
import type { SavedConnection, Project } from "@/types";

export default function MyShares() {
  const { shareStatus, savedConnections } = useShareStore();
  const { projects } = useProjectStore();

  const [browsingConn, setBrowsingConn] = useState<SavedConnection | null>(null);

  const hasShare = shareStatus !== null;
  const hasConnections = savedConnections.length > 0;
  const isEmpty = !hasShare && !hasConnections;

  // 匹配正在分享的项目
  const matchedProject: Project | undefined = hasShare
    ? projects.find((p) => p.folder_path && normalizePath(p.folder_path) === normalizePath(shareStatus!.path))
    : undefined;

  // 空状态
  if (isEmpty) {
    return (
      <EmptyState
        icon={<Share2 size={24} strokeWidth={1.5} />}
        title="暂无共享活动"
        description="分享一个项目文件夹，或连接到别人的共享"
      />
    );
  }

  return (
    <div className="animate-slide-up space-y-6">
      {/* 正在分享区域 */}
      {hasShare ? (
        <div>
          <h2 className="text-title font-serif mb-3" style={{ color: "var(--text-primary)" }}>
            正在分享
          </h2>
          <ActiveShareRow project={matchedProject} />
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          当前没有正在分享的项目
        </p>
      )}

      {/* 已连接项目区域 */}
      {hasConnections ? (
        <div>
          <h2 className="text-title font-serif mb-3" style={{ color: "var(--text-primary)" }}>
            已连接项目
          </h2>
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