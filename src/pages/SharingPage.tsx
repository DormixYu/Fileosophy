import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Share2, Link } from "lucide-react";
import MyShares from "@/components/sharing/MyShares";
import ConnectShare from "@/components/sharing/ConnectShare";
import { useShareStore } from "@/stores/useShareStore";

type TabKey = "my-shares" | "connect";

const tabs: { key: TabKey; label: string; icon: typeof Share2 }[] = [
  { key: "my-shares", label: "我的共享", icon: Share2 },
  { key: "connect", label: "连接共享", icon: Link },
];

export default function SharingPage() {
  const [searchParams] = useSearchParams();
  const validTabs: TabKey[] = ["my-shares", "connect"];
  const initialTab = validTabs.includes(searchParams.get("tab") as TabKey)
    ? (searchParams.get("tab") as TabKey)
    : "my-shares";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const { fetchShareStatus, fetchConnections, fetchPeers, fetchLocalIp } = useShareStore();

  useEffect(() => {
    fetchShareStatus();
    fetchConnections();
    fetchPeers();
    fetchLocalIp();
  }, [fetchShareStatus, fetchConnections, fetchPeers, fetchLocalIp]);

  return (
    <div className="h-full flex flex-col animate-slide-up">
      {/* 页头 */}
      <div
        className="shrink-0 px-6 flex items-center gap-6 border-b py-4"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-light)",
        }}
      >
        {/* 页面标题 + 鎏金装饰线 */}
        <div className="flex items-center gap-3">
          <h1 className="text-headline font-serif" style={{ color: "var(--text-primary)" }}>
            局域网共享
          </h1>
          <div
            className="w-12 h-[2px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.6 }}
          />
        </div>

        {/* Tab 栏 */}
        <div
          className="flex gap-1 p-1 rounded-lg ml-auto"
          style={{ background: "var(--bg-surface-alt)" }}
        >
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-xs transition-all relative"
              style={{
                background: activeTab === key ? "var(--bg-elevated)" : "transparent",
                color: activeTab === key ? "var(--gold)" : "var(--text-secondary)",
                boxShadow: activeTab === key ? "var(--shadow-sm)" : "none",
                cursor: "pointer",
                border: "none",
                borderBottom: activeTab === key ? "2px solid var(--gold)" : "2px solid transparent",
              }}
            >
              <Icon size={14} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {activeTab === "my-shares" && <MyShares />}
        {activeTab === "connect" && <ConnectShare onSwitchToMyShares={() => setActiveTab("my-shares")} />}
      </div>
    </div>
  );
}