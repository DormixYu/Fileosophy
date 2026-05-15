import { useState } from "react";
import { Download, Upload, FileJson, FileSpreadsheet } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { projectApi, exportApi } from "@/lib/tauri-api";
import Modal from "@/components/common/Modal";
import FolderScanImport from "@/components/settings/FolderScanImport";

export default function DataSection() {
  const { addToast } = useNotificationStore();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportProjects, setExportProjects] = useState<{ id: number; name: string }[]>([]);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const json = await exportApi.exportAllProjects();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fileosophy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({
        type: "success",
        title: "备份完成",
        message: "所有项目数据已导出",
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "备份失败",
        message: String(e),
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImportAll = async () => {
    setImporting(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [
          { name: "JSON", extensions: ["json"] },
        ],
      });
      if (!selected) {
        setImporting(false);
        return;
      }
      const projects = await exportApi.importAllProjects(selected as string);
      addToast({
        type: "success",
        title: "导入完成",
        message: `成功导入 ${projects.length} 个项目`,
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "导入失败",
        message: String(e),
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExportSingle = async (format: "json" | "csv") => {
    try {
      const allProjects = await projectApi.getAll();
      const projects = allProjects.map(p => ({ id: p.id, name: p.name }));

      if (projects.length === 0) {
        addToast({
          type: "warning",
          title: "没有项目",
          message: "请先创建一个项目",
        });
        return;
      }

      setExportProjects(projects);
      setExportFormat(format);
      setShowExportPicker(true);
    } catch (e) {
      addToast({
        type: "error",
        title: "导出失败",
        message: String(e),
      });
    }
  };

  const handleExportConfirm = async (projectId: number) => {
    try {
      setShowExportPicker(false);
      const result = await exportApi.exportProject(projectId, exportFormat);

      const ext = exportFormat === "json" ? "json" : "csv";
      const mimeType = exportFormat === "json" ? "application/json" : "text/csv";
      const blob = new Blob([result], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectId}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      addToast({
        type: "success",
        title: "导出完成",
        message: `项目已导出为 ${exportFormat.toUpperCase()} 格式`,
      });
    } catch (e) {
      addToast({
        type: "error",
        title: "导出失败",
        message: String(e),
      });
    }
  };

  return (
    <section className="animate-slide-up">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
          数据管理
        </h2>
        <div
          className="w-8 h-[2px] rounded-full"
          style={{ background: "var(--gold)", opacity: 0.5 }}
        />
      </div>

      {/* 备份与还原 */}
      <div className="mb-6">
        <h3
          className="text-sm font-serif mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          完整备份与还原
        </h3>
        <p
          className="text-xs mb-3 font-mono"
          style={{ color: "var(--text-tertiary)" }}
        >
          导出所有项目数据（含看板、甘特图、文件元数据）为 JSON 格式，可用于完整备份和迁移。
        </p>
        <div className="flex gap-3">
          <button
            className="btn btn-outline"
            onClick={handleExportAll}
            disabled={exporting}
          >
            <Download size={14} strokeWidth={1.5} />
            {exporting ? "导出中..." : "导出全部项目"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImportAll}
            disabled={importing}
          >
            <Upload size={14} strokeWidth={1.5} />
            {importing ? "导入中..." : "从备份文件导入"}
          </button>
        </div>
      </div>

      {/* 单项目导出 */}
      <div>
        <h3
          className="text-sm font-serif mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          单项目导出
        </h3>
        <p
          className="text-xs mb-3 font-mono"
          style={{ color: "var(--text-tertiary)" }}
        >
          将当前选中的项目导出为不同格式。
        </p>
        <div className="flex gap-3">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => handleExportSingle("json")}
          >
            <FileJson size={13} strokeWidth={1.5} />
            导出 JSON
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => handleExportSingle("csv")}
          >
            <FileSpreadsheet size={13} strokeWidth={1.5} />
            导出 CSV
          </button>
        </div>
      </div>

      {/* 文件夹扫描导入 */}
      <FolderScanImport addToast={addToast} />

      {/* 项目选择弹窗 */}
      <Modal
        open={showExportPicker}
        onClose={() => setShowExportPicker(false)}
        title="选择导出项目"
        footer={
          <button className="btn btn-ghost btn-sm" onClick={() => setShowExportPicker(false)}>
            取消
          </button>
        }
      >
        <div className="space-y-1 max-h-60 overflow-auto">
          {exportProjects.map((p) => (
            <button
              key={p.id}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-serif transition-colors hover-gold-bg"
              style={{ color: "var(--text-primary)" }}
              onClick={() => handleExportConfirm(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Modal>
    </section>
  );
}