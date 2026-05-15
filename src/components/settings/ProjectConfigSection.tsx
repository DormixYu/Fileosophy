import { useState, useEffect } from "react";
import { RotateCcw, Save, Plus, Trash2, FolderOpen } from "lucide-react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import type {
  ProjectTypeConfig,
  ProjectStatusConfig,
  ProjectTableColumn,
} from "@/types";
import {
  DEFAULT_PROJECT_TYPES,
  DEFAULT_PROJECT_STATUSES,
  DEFAULT_PROJECT_TABLE_COLUMNS,
  DEFAULT_NUMBER_TEMPLATE,
  DEFAULT_FOLDER_TEMPLATE,
} from "@/types";

export default function ProjectConfigSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { settings, saveSettings, parsedStatuses, parsedTypes, parsedColumns } = useSettingsStore();
  const { addToast } = useNotificationStore();

  const [numberTemplate, setNumberTemplate] = useState(
    settings["number_template"] || DEFAULT_NUMBER_TEMPLATE
  );
  const [folderTemplate, setFolderTemplate] = useState(
    settings["folder_template"] || DEFAULT_FOLDER_TEMPLATE
  );
  const [dateFormat, setDateFormat] = useState(
    settings["date_format"] || "YYMMDD"
  );
  const [projectRootPath, setProjectRootPath] = useState(
    settings["default_project_path"] || ""
  );

  const [types, setTypes] = useState<ProjectTypeConfig[]>(() => parsedTypes);

  const [statuses, setStatuses] = useState<ProjectStatusConfig[]>(() => parsedStatuses);

  const [columns, setColumns] = useState<ProjectTableColumn[]>(() => parsedColumns);

  const [dirty, setDirty] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypePrefix, setNewTypePrefix] = useState("");

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleSave = async () => {
    await saveSettings({
      number_template: numberTemplate,
      folder_template: folderTemplate,
      date_format: dateFormat,
      default_project_path: projectRootPath,
      project_types: JSON.stringify(types),
      project_statuses: JSON.stringify(statuses),
      project_table_columns: JSON.stringify(columns),
    });
    setDirty(false);
    addToast({ type: "success", title: "项目配置已保存", message: "" });
  };

  const handleReset = () => {
    setNumberTemplate(DEFAULT_NUMBER_TEMPLATE);
    setFolderTemplate(DEFAULT_FOLDER_TEMPLATE);
    setDateFormat("YYMMDD");
    setProjectRootPath("");
    setTypes([...DEFAULT_PROJECT_TYPES]);
    setStatuses([...DEFAULT_PROJECT_STATUSES]);
    setColumns([...DEFAULT_PROJECT_TABLE_COLUMNS]);
    setDirty(true);
  };

  const addType = () => {
    if (!newTypeName.trim()) return;
    setTypes((prev) => [
      ...prev,
      { id: newTypeName.trim(), name: newTypeName.trim(), prefix: newTypePrefix.trim() || newTypeName.trim().slice(0, 2), keywords: [] },
    ]);
    setNewTypeName("");
    setNewTypePrefix("");
    setDirty(true);
  };

  const removeType = (id: string) => {
    setTypes((prev) => prev.filter((t) => t.id !== id));
    setDirty(true);
  };

  const updateTypePrefix = (id: string, prefix: string) => {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, prefix } : t)));
    setDirty(true);
  };

  const updateTypeKeywords = (id: string, keywordsStr: string) => {
    const keywords = keywordsStr.split(",").map((k) => k.trim()).filter(Boolean);
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, keywords } : t)));
    setDirty(true);
  };

  const toggleColumn = (key: string) => {
    setColumns((prev) =>
      prev.map((c) =>
        c.key === key && !c.fixed ? { ...c, visible: !c.visible } : c
      )
    );
    setDirty(true);
  };

  return (
    <section className="animate-slide-up space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
            项目配置
          </h2>
          <div
            className="w-8 h-[2px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.5 }}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={handleReset}>
            <RotateCcw size={13} strokeWidth={1.5} />
            恢复默认
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!dirty}
            style={{ opacity: dirty ? 1 : 0.5 }}
          >
            <Save size={13} strokeWidth={1.5} />
            保存
          </button>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
            编号模板
          </h2>
          <div
            className="w-6 h-[1px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.4 }}
          />
        </div>
        <p className="text-xs mb-3 font-mono" style={{ color: "var(--text-tertiary)" }}>
          支持变量：{"{prefix}"}（项目分类前缀）、{"{date}"}（日期）、{"{sequence}"}（当日序号）
        </p>
        <div className="flex items-center gap-3 mb-3">
          <input
            type="text"
            value={numberTemplate}
            onChange={(e) => { setNumberTemplate(e.target.value); setDirty(true); }}
            className="input-base flex-1"
          />
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] mb-1 block font-mono" style={{ color: "var(--text-muted)" }}>文件夹模板</label>
            <input
              type="text"
              value={folderTemplate}
              onChange={(e) => { setFolderTemplate(e.target.value); setDirty(true); }}
              className="input-base w-64"
            />
          </div>
          <div>
            <label className="text-[11px] mb-1 block font-mono" style={{ color: "var(--text-muted)" }}>日期格式</label>
            <select
              value={dateFormat}
              onChange={(e) => { setDateFormat(e.target.value); setDirty(true); }}
              className="input-base"
            >
              <option value="YYMMDD">YYMMDD（如 260506）</option>
              <option value="YYYYMMDD">YYYYMMDD（如 20260506）</option>
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="text-[11px] mb-1 block font-mono" style={{ color: "var(--text-muted)" }}>项目根目录</label>
          <p className="text-xs mb-2 font-mono" style={{ color: "var(--text-tertiary)" }}>
            新建项目时在此目录下自动创建项目文件夹。留空则不自动创建。
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={projectRootPath}
              onChange={(e) => { setProjectRootPath(e.target.value); setDirty(true); }}
              placeholder="例如 D:\Projects"
              className="input-base flex-1"
            />
            <button
              className="btn btn-outline btn-sm"
              onClick={async () => {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({ directory: true, multiple: false });
                if (selected) { setProjectRootPath(selected as string); setDirty(true); }
              }}
            >
              <FolderOpen size={13} strokeWidth={1.5} />
              选择
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
            项目分类
          </h2>
          <div
            className="w-6 h-[1px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.4 }}
          />
        </div>
        <div className="space-y-2 mb-3">
          {types.map((t) => (
            <div key={t.id} className="card flex items-center gap-3 py-2 px-3 hover-gold-bg transition-colors">
              <span className="flex-1 text-sm font-serif" style={{ color: "var(--text-primary)" }}>
                {t.name}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>前缀</label>
                <input
                  type="text"
                  value={t.prefix}
                  onChange={(e) => updateTypePrefix(t.id, e.target.value)}
                  className="input-base w-20 text-xs text-center"
                />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={(t.keywords || []).join(", ")}
                  onChange={(e) => updateTypeKeywords(t.id, e.target.value)}
                  placeholder="关键词（逗号分隔）"
                  className="input-base w-full text-xs"
                />
              </div>
              <button
                onClick={() => removeType(t.id)}
                className="p-1 rounded hover-danger-text transition-colors"
                style={{ color: "var(--text-muted)", cursor: "pointer", background: "none", border: "none" }}
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="分类名称"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            className="input-base w-40"
            onKeyDown={(e) => e.key === "Enter" && addType()}
          />
          <input
            type="text"
            placeholder="前缀"
            value={newTypePrefix}
            onChange={(e) => setNewTypePrefix(e.target.value)}
            className="input-base w-24"
            onKeyDown={(e) => e.key === "Enter" && addType()}
          />
          <button className="btn btn-primary btn-sm" onClick={addType}>
            <Plus size={13} strokeWidth={1.5} />
            添加
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
            项目状态
          </h2>
          <div
            className="w-6 h-[1px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.4 }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono"
              style={{
                background: `${s.color}18`,
                border: `1px solid ${s.color}30`,
                color: s.color,
                letterSpacing: "0.04em",
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.name}
            </div>
          ))}
        </div>
        <p className="text-xs mt-2 font-mono" style={{ color: "var(--text-muted)" }}>
          项目状态暂不支持在线编辑，如需修改请直接编辑设置表中的 project_statuses 键值。
        </p>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
            项目列表显示列
          </h2>
          <div
            className="w-6 h-[1px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.4 }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 py-1.5 px-3 rounded-md text-xs cursor-pointer transition-colors font-mono hover-surface-alt-bg"
              style={{
                color: col.fixed ? "var(--text-muted)" : "var(--text-primary)",
                opacity: col.fixed ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={col.visible || col.fixed}
                disabled={col.fixed}
                onChange={() => toggleColumn(col.key)}
                className="accent-[var(--gold)]"
              />
              {col.label}
              {col.fixed && (
                <span className="text-[10px] ml-auto" style={{ color: "var(--text-muted)" }}>
                  固定
                </span>
              )}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}