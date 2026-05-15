import { useEffect, useState, useCallback } from "react";
import {
  Upload,
  Trash2,
  FileIcon,
  Send,
  Share2,
  RefreshCw,
  Monitor,
  Download,
  Eye,
} from "lucide-react";
import type { FileEntry, FilePreview, Peer } from "@/types";
import { INLINE_PREVIEW_EXTS, getFileExt } from "@/types";
import { fileApi } from "@/lib/tauri-api";
import { formatSize } from "@/lib/formatUtils";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { ConfirmDialog } from "@/components/common/Modal";
import FilePreviewModal from "./FilePreviewModal";

interface Props {
  projectId: number;
}

export default function FilePanel({ projectId }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [sharingFileId, setSharingFileId] = useState<number | null>(null);
  const [showPeerPanel, setShowPeerPanel] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // 文件预览状态
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [previewData, setPreviewData] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const addToast = useNotificationStore((s) => s.addToast);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const list = await fileApi.list(projectId);
      setFiles(list);
    } catch (e) {
      console.error("Failed to fetch files:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeers = useCallback(async () => {
    setPeersLoading(true);
    try {
      const list = await fileApi.discoverPeers();
      setPeers(list);
    } catch (e) {
      console.error("Failed to discover peers:", e);
    } finally {
      setPeersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [projectId]);

  useEffect(() => {
    if (showPeerPanel) {
      fetchPeers();
      const interval = setInterval(fetchPeers, 5000);
      return () => clearInterval(interval);
    }
  }, [showPeerPanel, fetchPeers]);

  const handleUpload = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: true });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        await fileApi.upload(projectId, path);
      }
      await fetchFiles();
    } catch (e) {
      console.error("Upload failed:", e);
    }
  };

  const handleOpenExternal = async (fileId: number) => {
    try {
      await fileApi.openStoredFile(fileId);
    } catch (e) {
      addToast({ type: "error", title: "打开失败", message: String(e) });
    }
  };

  const handleDelete = async (fileId: number) => {
    try {
      await fileApi.delete(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const handleShare = async (fileId: number, peer: Peer) => {
    setSharingFileId(fileId);
    try {
      const addr = peer.addresses[0] || peer.host;
      await fileApi.shareOverNetwork(fileId, addr, peer.port, peer.token);
      addToast({
        type: "success",
        title: "发送成功",
        message: `文件已发送到 ${peer.name}`,
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "发送失败",
        message: String(e),
      });
    } finally {
      setSharingFileId(null);
    }
  };

  // 打开内联预览（按文件列表索引）
  const openPreview = useCallback(
    async (index: number) => {
      const file = files[index];
      if (!file) return;

      const ext = getFileExt(file.original_name);

      // 不可内联预览的文件 -> 用系统默认应用打开
      if (!INLINE_PREVIEW_EXTS.has(ext)) {
        await handleOpenExternal(file.id);
        return;
      }

      setPreviewIndex(index);
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewData(null);

      try {
        const data = await fileApi.preview(file.id);
        setPreviewData(data);
      } catch (e) {
        setPreviewError(String(e));
      } finally {
        setPreviewLoading(false);
      }
    },
    [files],
  );

  const closePreview = () => {
    setPreviewIndex(-1);
    setPreviewData(null);
    setPreviewError(null);
  };

  const handlePrev = useCallback(() => {
    if (previewIndex > 0) openPreview(previewIndex - 1);
  }, [previewIndex, openPreview]);

  const handleNext = useCallback(() => {
    if (previewIndex < files.length - 1) openPreview(previewIndex + 1);
  }, [previewIndex, files.length, openPreview]);

  // 当前预览文件打开时，用系统默认应用
  const handlePreviewOpenExternal = useCallback(async () => {
    const file = files[previewIndex];
    if (file) {
      await handleOpenExternal(file.id);
    }
  }, [files, previewIndex]);

  const previewFile = previewIndex >= 0 ? files[previewIndex] : null;

  return (
    <div className="space-y-4">
      {/* 标题栏 — 鎏金装饰 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-1 h-5 shrink-0 rounded-full"
            style={{ background: "var(--gold)" }}
          />
          <h3 className="font-serif text-base tracking-wide" style={{ color: "var(--text-primary)" }}>
            文件
          </h3>
          {/* 鎏金装饰细线 */}
          <div
            className="w-8 h-px shrink-0"
            style={{ background: "var(--gold)", opacity: 0.35 }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setShowPeerPanel(!showPeerPanel)}
            style={
              showPeerPanel
                ? { borderColor: "var(--gold)", color: "var(--gold)", background: "var(--gold-glow)" }
                : {}
            }
          >
            <Share2 size={14} strokeWidth={1.5} />
            局域网共享
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleUpload}>
            <Upload size={14} strokeWidth={1.5} />
            上传文件
          </button>
        </div>
      </div>

      {/* 对等节点面板 */}
      {showPeerPanel && (
        <div
          className="card animate-slide-up"
          style={{
            background: "var(--bg-elevated)",
            boxShadow: "var(--shadow-gold)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                style={{ background: "var(--gold-glow)", color: "var(--gold)" }}
              >
                <Monitor size={10} strokeWidth={1.5} />
              </span>
              <h4 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                局域网中的 Fileosophy 实例
              </h4>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={fetchPeers}
              disabled={peersLoading}
            >
              <RefreshCw
                size={12}
                strokeWidth={1.5}
                className={peersLoading ? "animate-spin" : ""}
              />
              刷新
            </button>
          </div>

          {peers.length === 0 ? (
            <div
              className="text-center py-4 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {peersLoading ? "正在搜索..." : "未发现其他实例，请确认对方已启动"}
            </div>
          ) : (
            <div className="space-y-1.5">
              {peers.map((peer, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md transition-colors hover-gold-bg"
                  style={{ background: "var(--bg-surface-alt)" }}
                >
                  <Monitor
                    size={14}
                    strokeWidth={1.5}
                    style={{ color: "var(--color-success)" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                      {peer.name}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {peer.addresses[0]}:{peer.port}
                    </p>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: "var(--color-success-light)",
                      color: "var(--color-success)",
                      fontSize: "10px",
                    }}
                  >
                    在线
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 文件列表 */}
      {loading ? (
        <div className="text-center py-8 text-xs" style={{ color: "var(--text-muted)" }}>
          加载中...
        </div>
      ) : files.length === 0 ? (
        <div className="card text-center py-8">
          <FileIcon
            size={32}
            strokeWidth={1}
            className="mx-auto mb-2"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            暂无文件
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {files.map((file, index) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md transition-all group cursor-pointer select-none hover-elevated-bg"
              style={{ background: "var(--bg-surface-alt)" }}
              onDoubleClick={() => openPreview(index)}
            >
              {/* 文件图标 — 鎏金 */}
              <FileIcon
                size={16}
                strokeWidth={1.5}
                style={{ color: "var(--gold)", flexShrink: 0 }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                  {file.original_name}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {formatSize(file.size)} · {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}
                </p>
              </div>

              {/* 分享按钮（仅在有对等节点时显示） */}
              {showPeerPanel && peers.length > 0 && (
                <div className="relative group/share">
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover-gold-bg hover-gold-text"
                    style={{ color: "var(--text-muted)" }}
                    title="发送到局域网"
                    aria-label="发送到局域网"
                  >
                    <Send size={14} strokeWidth={1.5} />
                  </button>
                  <div
                    className="absolute right-0 top-full mt-1 py-1.5 rounded-lg opacity-0 group-hover/share:opacity-100 pointer-events-none group-hover/share:pointer-events-auto transition-opacity z-10 animate-scale-in"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-default)",
                      boxShadow: "var(--shadow-gold)",
                      minWidth: 200,
                    }}
                  >
                    {peers.map((peer, i) => (
                      <button
                        key={i}
                        className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 hover-gold-bg"
                        style={{ color: "var(--text-secondary)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(file.id, peer);
                        }}
                        disabled={sharingFileId === file.id}
                      >
                        <Monitor size={12} strokeWidth={1.5} />
                        {peer.name}
                        {sharingFileId === file.id && (
                          <RefreshCw size={10} className="animate-spin ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 操作按钮 — 品牌化图标按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openPreview(index);
                }}
                className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover-gold-bg hover-gold-text"
                style={{ color: "var(--text-muted)" }}
                title="预览 (双击)"
                aria-label="预览"
              >
                <Eye size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenExternal(file.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover-gold-bg hover-gold-text"
                style={{ color: "var(--text-muted)" }}
                title="用系统应用打开"
                aria-label="用系统应用打开"
              >
                <Download size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmId(file.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover-danger-text"
                style={{ color: "var(--text-muted)" }}
                aria-label="删除文件"
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={() => {
          if (deleteConfirmId) handleDelete(deleteConfirmId);
        }}
        title="删除文件"
        message="确定删除此文件？删除后无法恢复。"
        confirmLabel="删除"
        danger
      />

      {/* QuickLook 风格文件预览 */}
      <FilePreviewModal
        open={previewIndex >= 0}
        onClose={closePreview}
        preview={previewData}
        loading={previewLoading}
        error={previewError}
        fileName={previewFile?.original_name ?? ""}
        hasPrev={previewIndex > 0}
        hasNext={previewIndex < files.length - 1}
        onPrev={handlePrev}
        onNext={handleNext}
        onOpenExternal={handlePreviewOpenExternal}
      />
    </div>
  );
}