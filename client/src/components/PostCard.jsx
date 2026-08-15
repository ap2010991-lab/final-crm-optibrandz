import { useRef, useState } from "react";
import { ArrowRight, Check, ImageUp, MessageCircle, Trash2 } from "lucide-react";
import { api, apiUpload } from "../lib/api";
import { normalizePhone, pretty, shortDate } from "../lib/format";
import { normalizeStage, stageOf } from "../lib/contentStages";
import { StageChip } from "./StageChip";
import { useToast } from "../lib/useToast";
import { compressImage } from "../lib/compressImage";

/**
 * One post, everywhere it appears.
 *
 * The designer attaches the creative here, the owner sees it and advances the stage, and
 * once approved it can go straight to the client on WhatsApp. Previously a post was a row
 * of text with a status buried in a modal, so nothing ever moved.
 */
export default function PostCard({ post, client, onChanged, readOnly = false, showClientName = false }) {
  const { notify } = useToast();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState("");
  const stage = stageOf(normalizeStage(post.status));
  const clientRecord = client || post.client;

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("upload");
    try {
      // Phone photos are routinely 5–8 MB and Vercel rejects bodies over 4.5 MB, so the
      // image is resized in the browser before it ever leaves the device.
      const prepared = await compressImage(file);
      const form = new FormData();
      form.append("image", prepared, prepared.name || "post.jpg");
      await apiUpload(`/calendar/${post.id}/media`, form);
      notify("Creative uploaded.");
      onChanged?.();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy("");
    }
  }

  async function advance() {
    if (!stage.next) return;
    setBusy("stage");
    try {
      await api(`/calendar/${post.id}`, { method: "PUT", body: JSON.stringify({ status: stage.next }) });
      notify(stageOf(stage.next).label);
      onChanged?.();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy("");
    }
  }

  function shareUrl() {
    const phone = normalizePhone(clientRecord?.phone);
    if (!phone) return "";
    const lines = [
      `Hello ${clientRecord?.contactPerson || clientRecord?.businessName || "there"}, here is your ${pretty(post.platform)} ${pretty(post.postType).toLowerCase()} for ${shortDate(post.scheduledDate)}.`,
      post.caption ? `\nCaption:\n${post.caption}` : null,
      post.mediaUrl ? `\nCreative: ${post.mediaUrl}` : null
    ].filter(Boolean);
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  const canShare = post.mediaUrl && shareUrl();

  return <div className="record-card">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {showClientName && <div className="truncate font-black">{clientRecord?.businessName || "Client"}</div>}
        <div className={`text-xs font-bold ${showClientName ? "text-zinc-500" : "text-zinc-700"}`}>
          {pretty(post.platform)} · {pretty(post.postType)} ·{" "}
          <span className={post.overdue ? "text-[#be123c]" : ""}>{shortDate(post.scheduledDate)}</span>
        </div>
      </div>
      <StageChip status={post.status} />
    </div>

    {post.mediaUrl
      // No loading="lazy": with it the creative stayed at 0x0 even once scrolled into
      // view, while the same URL loaded fine when requested directly. A handful of small
      // images per screen is not worth an optimisation that can leave them blank.
      ? <a href={post.mediaUrl} target="_blank" rel="noopener noreferrer" className="post-media mt-3 block">
          <img src={post.mediaUrl} alt={`${pretty(post.platform)} creative`} decoding="async" />
        </a>
      : !readOnly && <button type="button" className="post-media-empty mt-3" disabled={busy === "upload"}
          onClick={() => fileRef.current?.click()}>
          <ImageUp size={20} />
          {busy === "upload" ? "Uploading..." : "Add the creative"}
        </button>}

    {post.caption && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{post.caption}</p>}
    {!post.caption && post.designBrief && <p className="mt-3 text-sm leading-6 text-zinc-500">{post.designBrief}</p>}

    {!readOnly && <>
      <input ref={fileRef} className="hidden" type="file" accept="image/*" onChange={upload} />
      {stage.next && <button className="primary mt-3 w-full" onClick={advance} disabled={Boolean(busy)}>
        {stage.next === "PUBLISHED" ? <Check size={16} /> : <ArrowRight size={16} />}
        {busy === "stage" ? "Saving..." : stage.action}
      </button>}
      <div className="record-card-actions">
        {post.mediaUrl && <button className="table-action" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
          <ImageUp size={14} /> Replace
        </button>}
        {canShare && <a className="whatsapp-action" href={shareUrl()} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={14} /> Send to client
        </a>}
      </div>
    </>}
  </div>;
}

export function PostDeleteAction({ onDelete }) {
  return <button className="danger-action" onClick={onDelete}><Trash2 size={14} /> Remove</button>;
}
