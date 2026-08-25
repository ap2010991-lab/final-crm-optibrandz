import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { pretty } from "../lib/format";
import { navItems } from "../lib/nav";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import Badge from "../components/Badge";
import { useToast } from "../lib/useToast";

export default function Team() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [restoring, setRestoring] = useState("");

  const query = useQuery({ queryKey: ["team"], queryFn: () => api("/team") });
  const members = query.data?.data || [];
  const permissions = query.data?.permissions || navItems.map((item) => item.key);
  const roles = query.data?.roles || ["ACCOUNT_MANAGER", "SEO_EXEC", "DESIGNER"];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["team"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  async function saveMember(payload) {
    const body = { ...payload, permissions: payload.permissions?.length ? payload.permissions : ["dashboard"] };
    if (editing?.id && !body.password) delete body.password;
    if (!editing?.id && (!body.password || body.password.length < 6)) {
      throw new Error("Set a password of at least 6 characters for this login.");
    }
    await api(editing?.id ? `/team/${editing.id}` : "/team", {
      method: editing?.id ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    notify(editing?.id ? "Team login updated." : "Team login created.");
    refresh();
  }

  async function restore(member) {
    setRestoring(member.id);
    try {
      await api(`/team/${member.id}`, { method: "PUT", body: JSON.stringify({ isActive: true }) });
      notify(`${member.name} can sign in again.`);
      refresh();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setRestoring("");
    }
  }

  const fields = [
    { name: "name", label: "Team member name", required: true, placeholder: "e.g. Rohan Mehta" },
    { name: "email", label: "Login email", kind: "email", required: true, placeholder: "team@optibrandz.in", help: "This email is their CRM username." },
    {
      name: "password",
      label: editing?.id ? "New password (optional)" : "Password",
      type: "password",
      placeholder: "At least 6 characters",
      help: editing?.id ? "Leave blank to keep their current password." : "Share this with them privately, and ask them to change it."
    },
    { name: "phone", label: "Phone / WhatsApp", kind: "phone" },
    {
      name: "role",
      label: "Role",
      required: true,
      // OWNER is not offered when creating a login, but it has to appear when editing the
      // owner — otherwise their own role is missing from the dropdown and the field shows
      // somebody else's. CLIENT logins are managed with the client, not here.
      options: roles.filter((role) => role !== "CLIENT" && (role !== "OWNER" || editing?.role === "OWNER")),
      disabled: editing?.role === "OWNER",
      help: editing?.role === "OWNER" ? "The owner login always keeps full access." : undefined
    },
    {
      name: "permissions",
      label: "Sections they can open",
      kind: "multi",
      help: "Only the ticked sections appear in their menu, and the server blocks the rest.",
      options: permissions
        .filter((item) => item !== "settings" && item !== "team")
        .map((item) => ({ value: item, label: navItems.find((nav) => nav.key === item)?.label || pretty(item) }))
    }
  ];

  return <div className="space-y-5">
    <div className="toolbar">
      <div>
        <h2 className="section-title">Team access</h2>
        <p className="mt-1 text-xs font-semibold text-zinc-500">Create a login per team member and control exactly what they can open.</p>
      </div>
      <button className="primary" onClick={() => setEditing({
        name: "", email: "", password: "", phone: "", role: "ACCOUNT_MANAGER", permissions: ["dashboard"]
      })}><Plus size={16} /> Add team login</button>
    </div>

    <QueryState query={query} label="team">
      <div className="team-grid">
        {members.map((member) => {
          const pct = member.totalTasks ? Math.round((member.doneTasks / member.totalTasks) * 100) : 0;
          return <div key={member.id} className={`team-card ${member.isActive ? "" : "inactive"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-black">{member.name}</div>
                <div className="text-sm font-semibold text-slate-500">{pretty(member.role)}</div>
                <div className="mt-1 truncate text-xs font-semibold text-slate-400">{member.email}</div>
              </div>
              <Badge tone={member.isActive ? "ACTIVE" : "LOST"}>{member.isActive ? "Active" : "Removed"}</Badge>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {member.role === "OWNER"
                ? <span className="chip">Full access</span>
                : (member.permissions || []).map((item) => <span className="chip" key={item}>
                    {navItems.find((nav) => nav.key === item)?.label || pretty(item)}
                  </span>)}
            </div>

            <div className="mt-4 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
              <span>{member.totalTasks || 0} tasks · {pct}% done</span>
              <span className={member.overdueTasks ? "text-[#be123c]" : ""}>{member.overdueTasks || 0} overdue</span>
            </div>

            <div className="record-card-actions">
              <button className="table-action" onClick={() => setEditing({ ...member, password: "" })}><Edit3 size={14} /> Edit</button>
              {member.role !== "OWNER" && member.isActive &&
                <button className="danger-action" onClick={() => setRemoving(member)}><Trash2 size={14} /> Remove login</button>}
              {/* Removing a colleague was a one-way door: the API could switch a login
                  back on, but nothing on this screen ever offered it. */}
              {!member.isActive &&
                <button className="table-action" disabled={restoring === member.id} onClick={() => restore(member)}>
                  <RotateCcw size={14} /> {restoring === member.id ? "Restoring..." : "Restore login"}
                </button>}
            </div>
          </div>;
        })}
      </div>
    </QueryState>

    {editing && <RecordModal
      title={editing.id ? "Edit team login" : "Create team login"}
      initial={editing}
      fields={fields}
      onSubmit={saveMember}
      onClose={() => setEditing(null)}
      note={{
        title: "How team logins work",
        body: "The email and password below are what they type on the sign-in screen. Tick only the sections they need — the server enforces this, not just the menu."
      }}
    />}

    {removing && <ConfirmModal
      title="Remove login"
      message={`Remove the login for ${removing.name}? They will not be able to sign in any more. Their completed work and task history stay in the CRM.`}
      confirmLabel="Remove login"
      busyLabel="Removing..."
      onConfirm={async () => {
        await api(`/team/${removing.id}`, { method: "DELETE" });
        notify(`${removing.name} can no longer sign in.`);
        refresh();
      }}
      onClose={() => setRemoving(null)}
    />}
  </div>;
}
