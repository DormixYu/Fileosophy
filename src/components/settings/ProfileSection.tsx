import { useState, useEffect } from "react";
import { Save, Camera } from "lucide-react";
import { useUserStore } from "@/stores/useUserStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { systemApi } from "@/lib/tauri-api";
import { getInitials } from "@/lib/formatUtils";

const PRESET_EMOJIS = [
  "😀", "😎", "🤓", "🦊",
  "🐱", "🐼", "🦉", "🌸",
  "🔥", "⚡", "🌊", "🌙",
  "🎯", "🚀", "💎", "🎨",
];

export default function ProfileSection({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const { user, fetchUser, saveUser, uploadAvatar } = useUserStore();
  const { addToast } = useNotificationStore();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleNameChange = (value: string) => {
    setName(value);
    setDirty(value !== (user?.name || ""));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveUser(name.trim(), user?.avatar_path);
      setDirty(false);
      addToast({ type: "success", title: "用户资料已保存", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "保存失败", message: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readFile } = await import("@tauri-apps/plugin-fs");
      const selected = await open({
        multiple: false,
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
      });
      if (!selected) return;

      const filePath = selected as string;
      const fileData = await readFile(filePath);
      // 转为 base64 data URL
      const bytes = new Uint8Array(fileData);
      const base64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
      const ext = filePath.split(".").pop()?.toLowerCase() || "png";
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      const dataUrl = `data:${mime};base64,${base64}`;

      await uploadAvatar(dataUrl);
      addToast({ type: "success", title: "头像已更新", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "头像上传失败", message: String(e) });
    }
  };

  const handleEmojiSelect = async (emoji: string) => {
    try {
      // 将 emoji 绘制到 canvas 转为 PNG base64
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg-surface").trim();
      ctx.fillRect(0, 0, 128, 128);
      ctx.font = "72px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, 64, 68);
      const dataUrl = canvas.toDataURL("image/png");

      await uploadAvatar(dataUrl);
      setShowEmojiPicker(false);
      addToast({ type: "success", title: "头像已更新", message: "" });
    } catch (e) {
      addToast({ type: "error", title: "头像设置失败", message: String(e) });
    }
  };

  return (
    <section className="animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-title font-serif" style={{ color: "var(--text-primary)" }}>
            用户资料
          </h2>
          <div
            className="w-8 h-[2px] rounded-full"
            style={{ background: "var(--gold)", opacity: 0.5 }}
          />
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{ opacity: saving || !name.trim() ? 0.5 : 1 }}
        >
          <Save size={13} strokeWidth={1.5} />
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* 头像区域：gold-glow-strong + gold 边框 */}
      <div className="flex items-center gap-5 mb-4">
        {user?.avatar_path ? (
          <div
            className="w-20 h-20 rounded-full"
            style={{
              boxShadow: "var(--shadow-gold)",
              border: "2px solid var(--gold)",
            }}
          >
            <img
              src={systemApi.convertFileSrc(user.avatar_path)}
              alt="头像"
              className="w-full h-full rounded-full object-cover"
            />
          </div>
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-xl font-serif"
            style={{
              background: "var(--gold-glow-strong)",
              color: "var(--gold)",
              border: "2px solid var(--gold)",
              boxShadow: "var(--shadow-gold)",
            }}
          >
            {user?.name ? getInitials(user.name) : "?"}
          </div>
        )}
        <div className="space-y-2">
          <p className="text-sm font-serif" style={{ color: "var(--text-primary)" }}>
            {user?.name || "未设置用户名"}
          </p>
          <div className="flex gap-2">
            <button
              className="btn btn-outline btn-sm"
              onClick={handleAvatarUpload}
            >
              <Camera size={13} strokeWidth={1.5} />
              上传图片
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{
                borderColor: showEmojiPicker ? "var(--gold)" : undefined,
                color: showEmojiPicker ? "var(--gold)" : undefined,
              }}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              选择 Emoji
            </button>
          </div>
        </div>
      </div>

      {/* Emoji 预设头像选择：品牌 grid 布局 */}
      {showEmojiPicker && (
        <div
          className="mb-6 p-4 rounded-lg animate-slide-up"
          style={{ background: "var(--gold-glow)", border: "1px solid var(--gold)" }}
        >
          <p className="text-xs font-serif mb-3" style={{ color: "var(--gold)" }}>
            选择一个 Emoji 作为头像
          </p>
          <div className="grid grid-cols-8 gap-2">
            {PRESET_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all hover:scale-110"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                }}
                onClick={() => handleEmojiSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 用户名输入：.input-base */}
      <div className="mb-6">
        <label className="block text-xs mb-1.5 font-serif" style={{ color: "var(--text-muted)" }}>
          用户名
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="输入你的名称"
          className="input-base w-full"
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
      </div>
    </section>
  );
}