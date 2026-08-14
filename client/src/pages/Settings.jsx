import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Save, Smartphone } from "lucide-react";
import { api, useAuth } from "../lib/api";
import { QueryState } from "../components/QueryState";
import { useToast } from "../lib/useToast";

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const isOwner = user?.role === "OWNER";

  const query = useQuery({ queryKey: ["settings"], queryFn: () => api("/settings") });
  // The agency profile was saved to localStorage only, so it never reached the invoice
  // PDF and was lost the moment you opened the CRM on another device. `draft` stays null
  // until something is typed, so the form always shows the latest saved values.
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const profile = draft || query.data?.data || null;
  const setProfile = setDraft;

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/settings", {
        method: "PUT",
        body: JSON.stringify({
          agencyName: profile.agencyName,
          address: profile.address,
          phone: profile.phone,
          whatsapp: profile.whatsapp,
          email: profile.email,
          website: profile.website,
          gstNumber: profile.gstNumber,
          invoiceNotes: profile.invoiceNotes
        })
      });
      notify("Agency profile saved. It now appears on every invoice PDF.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return <div className="grid gap-5 xl:grid-cols-2">
    <div className="panel">
      <h2 className="section-title">Agency profile</h2>
      <p className="mt-1 text-xs font-semibold text-zinc-500">These details print on every invoice and report PDF.</p>
      <QueryState query={query} label="settings">
        {profile && <form onSubmit={saveSettings} className="mt-4 space-y-4">
          <Text label="Agency name" value={profile.agencyName} onChange={(value) => setProfile({ ...profile, agencyName: value })} disabled={!isOwner} />
          <Text label="Address" value={profile.address} rows={2} onChange={(value) => setProfile({ ...profile, address: value })} disabled={!isOwner} />
          <Text label="Phone" value={profile.phone} type="tel" onChange={(value) => setProfile({ ...profile, phone: value })} disabled={!isOwner} />
          <Text label="WhatsApp" value={profile.whatsapp} type="tel" onChange={(value) => setProfile({ ...profile, whatsapp: value })} disabled={!isOwner} />
          <Text label="Email" value={profile.email} type="email" onChange={(value) => setProfile({ ...profile, email: value })} disabled={!isOwner} />
          <Text label="Website" value={profile.website} onChange={(value) => setProfile({ ...profile, website: value })} disabled={!isOwner} />
          <Text label="GSTIN" value={profile.gstNumber} onChange={(value) => setProfile({ ...profile, gstNumber: value })} disabled={!isOwner} />
          <Text label="Default note on invoices" value={profile.invoiceNotes} rows={2}
            onChange={(value) => setProfile({ ...profile, invoiceNotes: value })} disabled={!isOwner} />
          {isOwner
            ? <button className="primary" disabled={saving}><Save size={16} /> {saving ? "Saving..." : "Save profile"}</button>
            : <p className="text-sm font-semibold text-zinc-500">Only the owner can change the agency profile.</p>}
        </form>}
      </QueryState>
    </div>

    <div className="space-y-5">
      <ChangePassword />
      <InstallCard />
    </div>
  </div>;
}

function Text({ label, value, onChange, type = "text", rows = 1, disabled }) {
  return <label className="block">
    <span className="field-label">{label}</span>
    {rows > 1
      ? <textarea className="input" rows={rows} value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      : <input className="input" type={type} value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} />}
  </label>;
}

function ChangePassword() {
  const { notify } = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (form.newPassword.length < 8) return setError("Use at least 8 characters.");
    if (form.newPassword !== form.confirmPassword) return setError("The two new passwords do not match.");
    setSaving(true);
    try {
      await api("/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      });
      notify("Password changed.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="panel">
    <h2 className="section-title flex items-center gap-2"><KeyRound size={16} /> Change your password</h2>
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="block">
        <span className="field-label">Current password</span>
        <input className="input" type="password" autoComplete="current-password" value={form.currentPassword}
          onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required />
      </label>
      <label className="block">
        <span className="field-label">New password</span>
        <input className="input" type="password" autoComplete="new-password" value={form.newPassword}
          onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required />
      </label>
      <label className="block">
        <span className="field-label">Confirm new password</span>
        <input className="input" type="password" autoComplete="new-password" value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required />
      </label>
      {error && <div className="form-error">{error}</div>}
      <button className="primary" disabled={saving}>{saving ? "Saving..." : "Change password"}</button>
    </form>
  </div>;
}

function InstallCard() {
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;
  return <div className="panel">
    <h2 className="section-title flex items-center gap-2"><Smartphone size={16} /> Install on your iPhone</h2>
    {standalone
      ? <p className="mt-2 text-sm font-semibold leading-6 text-emerald-700">Installed. You are running the CRM as an app.</p>
      : <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
          <li><strong>1.</strong> Open this page in Safari on your iPhone.</li>
          <li><strong>2.</strong> Tap the Share button (the square with an arrow).</li>
          <li><strong>3.</strong> Choose <strong>Add to Home Screen</strong>.</li>
          <li><strong>4.</strong> Open it from your home screen — it runs full screen, without the Safari bars.</li>
        </ol>}
  </div>;
}
