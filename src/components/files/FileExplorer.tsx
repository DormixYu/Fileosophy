import { useEffect, useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderClosed,
  FileIcon,
  Upload,
  Trash2,
  HardDrive,
} from "lucide-react";
import type { FileEntry, FolderEntry } from "@/types";
import { fileApi, projectApi } from "@/lib/tauri-api";
import { useNotificationStore } from "@/stores/useNotificationStore";

interface Props {
  projectId: number;
  folderPath?: string;
}

// ── 文件夹树模式 ──────────────────────────────────────────────

function FolderTree({ folderPath }: { folderPath: string }) {
  const [root, setRoot] = useState<FolderEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const addToast = useNotificationStore((s) => s.addToast);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tree = await fileApi.listFolderContents(folderPath);
      setRoot(tree);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleOpenFile = async (filePath: string) => {
    try {
      await projectApi.openFile(filePath);
    } catch (e) {
      addToast({ type: "error", title: "打开失败", message: String(e) });
    }
  };

  if (loading) {
    return (
      <div className="text-center py-6 text-xs" style={{ color: "var(--text-muted)" }}>
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-xs" style={{ color: "var(--color-danger)" }}>
        {error}
      </div>
    );
  }

  if (!root || root.children.length === 0) {
    return (
      <div className="text-center py-6 text-xs" style={{ color: "var(--text-muted)" }}>
        空文件夹
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {root.children.map((child) => (
        <TreeNode key={child.path} entry={child} depth={0} onOpenFile={handleOpenFile} />
      ))}
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  onOpenFile,
}: {
  entry: FolderEntry;
  depth: number;
  onOpenFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (entry.is_dir) {
    return (
      <div>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-colors select-none"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alt)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {expanded ? (
            <ChevronDown size={13} strokeWidth={1.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          ) : (
            <ChevronRight size={13} strokeWidth={1.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          )}
          {expanded ? (
            <FolderOpen size={14} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
          ) : (
            <FolderClosed size={14} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
          )}
          <span className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
            {entry.name}
          </span>
        </div>
        {expanded && (
          <div>
            {entry.children.map((child) => (
              <TreeNode key={child.path} entry={child} depth={depth + 1} onOpenFile={onOpenFile} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors select-none group"
      style={{ paddingLeft: `${depth * 16 + 8 + 13 + 4}px` }}
      onDoubleClick={() => onOpenFile(entry.path)}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alt)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <FileIcon size={14} strokeWidth={1.5} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span className="flex-1 text-xs truncate" style={{ color: "var(--text-primary)" }}>
        {entry.name}
      </span>
      <span className="text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>
        {formatSize(entry.size)}
      </span>
    </div>
  );
}

// ── 数据库文件列表模式（原有逻辑）─────────────────────────────

function DbFileList({ projectId }: { projectId: number }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const addToast = useNotificationStore((s) => s.addToast);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fileApi.list(projectId);
      setFiles(list);
    } catch (e) {
      console.error("获取文件列表失败:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

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
      console.error("上传失败:", e);
    }
  };

  const handleOpen = async (fileId: number) => {
    try {
      const filePath = await fileApi.download(fileId);
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(filePath);
    } catch (e) {
      addToast({ type: "error", title: "打开失败", message: String(e) });
    }
  };

  const handleDelete = async (fileId: number) => {
    if (!confirm("确定删除此文件？")) return;
    try {
      await fileApi.delete(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e) {
      console.error("删除失败:", e);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {files.length} 个文件
        </span>
        <button className="btn btn-primary btn-sm" onClick={handleUpload}>
          <Upload size={13} strokeWidth={1.5} />
          上传文件
        </button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-xs" style={{ color: "var(--text-muted)" }}>
          加载中…
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8 rounded-md" style={{ background: "var(--bg-surface-alt)" }}>
          <FileIcon size={28} strokeWidth={1} className="mx-auto mb-1" style={{ color: "var(--text-muted)" }} />
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            暂无文件，上传或拖拽文件到此处
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span className="flex-1">名称</span>
            <span className="w-20 text-right">大小</span>
            <span className="w-28 text-right">上传时间</span>
            <span className="w-16" />
          </div>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors group cursor-pointer select-none"
              style={{ background: "var(--bg-elevated)" }}
              onDoubleClick={() => handleOpen(file.id)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-alt)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
            >
              <FileIcon size={15} strokeWidth={1.5} className="shrink-0" style={{ color: "var(--gold)" }} />
              <span className="flex-1 text-xs truncate" style={{ color: "var(--text-primary)" }}>
                {file.original_name}
              </span>
              <span className="w-20 text-right text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {formatSize(file.size)}
              </span>
              <span className="w-28 text-right text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {new Date(file.uploaded_at).toLocaleDateString("zh-CN")}
              </span>
              <div className="w-16 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleOpen(file.id); }}
                  className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors"
                  style={{ color: "var(--gold)", cursor: "pointer", background: "none", border: "none" }}
                  title="打开"
                >
                  <FileIcon size={13} strokeWidth={1.5} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(file.id); }}
                  className="p-1 rounded hover:bg-red-50 transition-colors"
                  style={{ color: "var(--color-danger)", cursor: "pointer", background: "none", border: "none" }}
                  title="删除"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────

export default function FileExplorer({ projectId, folderPath }: Props) {
  if (folderPath) {
    return <FolderTree folderPath={folderPath} />;
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-md mb-3 text-xs"
        style={{ background: "var(--bg-surface-alt)", color: "var(--text-muted)" }}
      >
        <HardDrive size={13} strokeWidth={1.5} />
        未设置项目文件夹路径，显示已上传的文件
      </div>
      <DbFileList projectId={projectId} />
    </div>
  );
}
