import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, BriefcaseBusiness, ImageUp, Megaphone, Send, Sparkles, UploadCloud, Wand2 } from "lucide-react";
import { api, apiUpload, useAuth } from "../lib/api";
import { pretty } from "../lib/format";
import { canAccess } from "../lib/nav";
import { useToast } from "../lib/useToast";

export default function AIAgent() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [prompt, setPrompt] = useState("What should I focus on today to grow revenue and avoid client risk?");
  const [answer, setAnswer] = useState("");
  const [imagePrompt, setImagePrompt] = useState("Analyse this creative for campaign potential, improvements, CTA and next actions.");
  const [imageAnswer, setImageAnswer] = useState("");
  const [busy, setBusy] = useState("");
  const [contentForm, setContentForm] = useState({ businessType: "dental clinic in Vapi", platform: "Instagram", goal: "more WhatsApp enquiries" });

  const statusQuery = useQuery({ queryKey: ["ai-status"], queryFn: () => api("/ai/status"), retry: false });
  const leadsQuery = useQuery({ queryKey: ["leads"], queryFn: () => api("/leads"), enabled: canAccess(user, "leads"), retry: false });
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients"), enabled: canAccess(user, "clients"), retry: false });

  const lead = leadsQuery.data?.data?.[0];
  const client = clientsQuery.data?.data?.[0];
  const live = statusQuery.data?.data?.configured;

  // These calls had no error handling at all, so a failed request produced an unhandled
  // promise rejection and a button that just stopped doing anything.
  async function run(path, body, label) {
    setBusy(label);
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify(body || {}) });
      setAnswer(result.data.text);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy("");
    }
  }

  async function analyzeImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      notify("That image is larger than 4 MB. Please pick a smaller one.", "error");
      return;
    }
    setBusy("image");
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("prompt", imagePrompt);
      const result = await apiUpload("/ai/image-agent", form);
      setImageAnswer(result.data.text);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy("");
    }
  }

  return <div className="space-y-5">
    <section className="hero-panel">
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#ffd84d] text-[#090909]"><Bot size={24} /></div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#ffd84d]">Gemini powered</p>
          <h2 className="text-2xl font-black tracking-tight">Your Optibrandz growth agent</h2>
        </div>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-white/70">
        Lead replies, campaign strategy, creative feedback, content ideas and client risk summaries — grounded in the
        records you are allowed to see.
      </p>
      {!live && statusQuery.isSuccess && <p className="mt-4 rounded-xl border border-white/15 bg-white/10 p-3 text-sm font-semibold text-white/80">
        Running in demo mode. Add a <code>GEMINI_API_KEY</code> environment variable to switch on live answers.
      </p>}
    </section>

    <div className="grid gap-5 xl:grid-cols-2">
      <div className="panel">
        <h2 className="section-title flex items-center gap-2"><Bot size={18} className="text-[#ff7a18]" /> Ask the CRM agent</h2>
        <textarea className="input mt-4 min-h-28" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <button className="primary mt-3" onClick={() => run("/ai/chat", { prompt }, "chat")} disabled={Boolean(busy) || !prompt.trim()}>
          <Send size={16} /> {busy === "chat" ? "Thinking..." : "Ask Gemini"}
        </button>
        {answer && <Output text={answer} />}
      </div>

      <div className="panel">
        <h2 className="section-title flex items-center gap-2"><ImageUp size={18} className="text-[#ff7a18]" /> Analyse a creative</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Upload a creative, screenshot, ad image or competitor post. Straight from your camera roll works too.
        </p>
        <textarea className="input mt-3 min-h-20" value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} />
        <label className="secondary-upload mt-3">
          <UploadCloud size={17} /> {busy === "image" ? "Analysing..." : "Upload image"}
          <input className="hidden" type="file" accept="image/*" onChange={analyzeImage} disabled={Boolean(busy)} />
        </label>
        {imageAnswer && <Output text={imageAnswer} />}
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-3">
      {canAccess(user, "leads") && <Card title="Lead follow-up" icon={Megaphone}
        text={lead ? `${lead.businessName || lead.name} · ${pretty(lead.status)}` : "No leads yet"}
        disabled={!lead || Boolean(busy)} busy={busy === "lead"}
        onClick={() => lead && run(`/ai/leads/${lead.id}/followup`, {}, "lead")} />}

      {canAccess(user, "clients") && <Card title="Client health brief" icon={BriefcaseBusiness}
        text={client ? `${client.businessName} · ${client.healthScore ?? 0}% health` : "No clients yet"}
        disabled={!client || Boolean(busy)} busy={busy === "client"}
        onClick={() => client && run(`/ai/clients/${client.id}/brief`, {}, "client")} />}

      <div className="panel">
        <h2 className="section-title flex items-center gap-2"><Wand2 size={18} className="text-[#ff7a18]" /> Content ideas</h2>
        <input className="input mt-4" value={contentForm.businessType} placeholder="Business type"
          onChange={(event) => setContentForm({ ...contentForm, businessType: event.target.value })} />
        <input className="input mt-3" value={contentForm.platform} placeholder="Platform"
          onChange={(event) => setContentForm({ ...contentForm, platform: event.target.value })} />
        <input className="input mt-3" value={contentForm.goal} placeholder="Goal"
          onChange={(event) => setContentForm({ ...contentForm, goal: event.target.value })} />
        <button className="primary mt-3" onClick={() => run("/ai/content-ideas", contentForm, "content")} disabled={Boolean(busy)}>
          <Wand2 size={16} /> {busy === "content" ? "Generating..." : "Generate"}
        </button>
      </div>
    </div>
  </div>;
}

function cleanText(text) {
  return String(text || "").replaceAll("**", "").replace(/^\s*\*\s+/gm, "• ");
}

function Output({ text }) {
  return <div className="ai-output mt-4 whitespace-pre-wrap text-sm leading-6">{cleanText(text)}</div>;
}

function Card({ title, icon: Icon, text, onClick, busy, disabled }) {
  return <div className="panel">
    <h2 className="section-title flex items-center gap-2"><Icon size={18} className="text-[#ff7a18]" /> {title}</h2>
    <p className="mt-3 text-sm text-zinc-600">{text}</p>
    <button className="primary mt-4" onClick={onClick} disabled={disabled}>
      <Sparkles size={16} /> {busy ? "Generating..." : "Generate"}
    </button>
  </div>;
}
