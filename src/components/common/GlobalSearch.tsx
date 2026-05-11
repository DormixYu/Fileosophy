import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FolderKanban, Columns3, ListTodo } from "lucide-react";
import Modal from "@/components/common/Modal";
import type { SearchResult } from "@/types";
import { searchApi } from "@/lib/tauri-api";

interface Props {
  open: boolean;
  onClose: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  project: <FolderKanban size={14} strokeWidth={1.5} />,
  card: <Columns3 size={14} strokeWidth={1.5} />,
  task: <ListTodo size={14} strokeWidth={1.5} />,
};

const typeLabels: Record<string, string> = {
  project: "项目",
  card: "卡片",
  task: "任务",
};

export default function GlobalSearch({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }
    setLoading(true);
    try {
      const r = await searchApi.search(q.trim());
      setResults(r);
      setSelectedIndex(0);
    } catch (e) {
      console.error("Search failed:", e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 200);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[selectedIndex];
      if (item) {
        handleResultClick(item);
      }
    }
  };

  const handleResultClick = (item: SearchResult) => {
    onClose();
    const { result_type, project_id } = item;
    if (result_type === "project") {
      navigate(`/project/${project_id}`);
    } else {
      // 打开项目并定位到对应视图
      navigate(`/project/${project_id}`);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="全局搜索" width="max-w-lg">
      <div className="space-y-3">
        {/* 搜索输入 */}
        <div className="relative">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索项目、卡片、任务…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded outline-none"
            style={{
              background: "var(--bg-surface-alt)",
              border: "1px solid var(--border-light)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* 搜索结果 */}
        <div className="max-h-64 overflow-y-auto -mx-1">
          {loading ? (
            <div
              className="text-center py-4 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              搜索中…
            </div>
          ) : results.length === 0 && query.trim() ? (
            <div
              className="text-center py-6"
              style={{ color: "var(--text-tertiary)" }}
            >
              <p className="text-sm">未找到结果</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                试试其他关键词
              </p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-0.5">
              {results.map((item, index) => (
                <button
                  key={`${item.result_type}-${item.id}`}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors"
                  style={{
                    background:
                      index === selectedIndex
                        ? "var(--gold-glow)"
                        : "transparent",
                    color: "var(--text-primary)",
                  }}
                  onClick={() => handleResultClick(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span style={{ color: "var(--gold)" }}>
                    {typeIcons[item.result_type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{item.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span
                        className="text-[9px] px-1 py-0.5 rounded"
                        style={{
                          background: "var(--gold-glow)",
                          color: "var(--gold)",
                        }}
                      >
                        {typeLabels[item.result_type]}
                      </span>
                      <span
                        className="text-[9px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.project_name}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim() ? null : (
            <div
              className="text-center py-6"
              style={{ color: "var(--text-tertiary)" }}
            >
              <p className="text-sm">输入关键词开始搜索</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                可搜索项目名称、卡片标题与描述、甘特图任务名称
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
