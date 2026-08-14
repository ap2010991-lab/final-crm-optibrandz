import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { api, useAuth } from "../lib/api";
import { pretty, shortDate, toDateInput } from "../lib/format";
import { QueryState } from "../components/QueryState";
import RecordModal, { ConfirmModal } from "../components/RecordModal";
import DataTable from "../components/DataTable";
import Badge from "../components/Badge";
import { useToast } from "../lib/useToast";

const SERVICE_TYPES = ["SEO", "SMO", "SMM", "GOOGLE_ADS", "META_ADS", "YOUTUBE", "GMB", "WEBSITE", "GRAPHIC_DESIGN", "INFLUENCER", "CONTENT"];
const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "REVIEW", "DONE"];

export default function Services() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [serviceEdit, setServiceEdit] = useState(null);
  const [taskEdit, setTaskEdit] = useState(null);
  const [deletingTask, setDeletingTask] = useState(null);
  const [deletingService, setDeletingService] = useState(null);

  const servicesQuery = useQuery({ queryKey: ["services"], queryFn: () => api("/services") });
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: () => api("/tasks") });
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: () => api("/clients") });
  const teamQuery = useQuery({ queryKey: ["team"], queryFn: () => api("/team"), retry: false });

  const services = servicesQuery.data?.data || [];
  const tasks = tasksQuery.data?.data || [];
  const clientOptions = (clientsQuery.data?.data || []).map((client) => ({ value: client.id, label: client.businessName }));
  const teamOptions = (teamQuery.data?.data || [])
    .filter((member) => member.isActive && member.role !== "CLIENT")
    .map((member) => ({ value: member.id, label: member.name }));
  const serviceOptions = services.map((service) => ({
    value: service.id,
    label: `${pretty(service.serviceType)} · ${clientOptions.find((c) => c.value === service.clientId)?.label || "Client"}`
  }));
  const canDelete = user?.role === "OWNER";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["services"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  async function saveService(payload) {
    await api(serviceEdit?.id ? `/services/${serviceEdit.id}` : "/services", {
      method: serviceEdit?.id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    notify(serviceEdit?.id ? "Service updated." : "Service added.");
    refresh();
  }

  async function saveTask(payload) {
    await api(taskEdit?.id ? `/tasks/${taskEdit.id}` : "/tasks", {
      method: taskEdit?.id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    notify(taskEdit?.id ? "Task updated." : "Task added.");
    refresh();
  }

  async function moveTask(task, status) {
    try {
      await api(`/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ status }) });
      notify(`${task.title} → ${pretty(status)}`);
      refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return <div className="space-y-5">
    <div className="panel min-w-0">
      <div className="toolbar-inline">
        <h2 className="section-title">Service orders</h2>
        <button className="primary" disabled={!clientOptions.length}
          onClick={() => setServiceEdit({ clientId: clientOptions[0]?.value, serviceType: "SEO", monthlyValue: 0, status: "ACTIVE" })}>
          <Plus size={16} /> Add service
        </button>
      </div>
      <QueryState query={servicesQuery} label="services">
        <DataTable
          rows={services}
          columns={["serviceType", "packageName", "monthlyValue", "status", "startDate"]}
          title={(row) => pretty(row.serviceType)}
          emptyMessage="No services yet. Add one, or pick services on a client record."
          action={(row) => <div className="flex flex-wrap gap-2">
            <button className="table-action" onClick={() => setServiceEdit({ ...row, startDate: toDateInput(row.startDate) })}>
              <Edit3 size={14} /> Edit
            </button>
            {canDelete && <button className="danger-action" onClick={() => setDeletingService(row)}><Trash2 size={14} /> Delete</button>}
          </div>}
        />
      </QueryState>
    </div>

    <div className="panel min-w-0">
      <div className="toolbar-inline">
        <h2 className="section-title">Task board</h2>
        <button className="primary" disabled={!teamOptions.length}
          onClick={() => setTaskEdit({
            serviceOrderId: serviceOptions[0]?.value || "",
            assignedToId: teamOptions[0]?.value || "",
            priority: "MEDIUM",
            status: "PENDING",
            dueDate: toDateInput(new Date(Date.now() + 3 * 86400000))
          })}>
          <Plus size={16} /> Add task
        </button>
      </div>
      {!teamOptions.length && teamQuery.isSuccess &&
        <p className="mt-3 text-sm font-semibold text-zinc-500">Only the owner can add team members, so tasks can only be assigned once a team login exists.</p>}

      <QueryState query={tasksQuery} label="tasks">
        <div className="task-board-grid">
          {TASK_STATUSES.map((status) => {
            const column = tasks.filter((task) => task.status === status);
            return <div key={status} className="task-column">
              <h3 className="flex items-center justify-between">{pretty(status)}<span className="text-xs text-zinc-400">{column.length}</span></h3>
              {column.length === 0 && <p className="text-xs font-semibold text-zinc-400">Nothing here</p>}
              {column.map((task) => {
                const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";
                return <div key={task.id} className="task-card">
                  <div className="font-semibold">{task.title}</div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={task.priority}>{pretty(task.priority)}</Badge>
                    <span className={`text-xs font-bold ${overdue ? "text-[#be123c]" : "text-slate-500"}`}>{shortDate(task.dueDate)}</span>
                  </div>
                  <select className="input mt-2 text-xs" value={task.status} onChange={(event) => moveTask(task, event.target.value)}>
                    {TASK_STATUSES.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}
                  </select>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="table-action" onClick={() => setTaskEdit({ ...task, dueDate: toDateInput(task.dueDate) })}>
                      <Edit3 size={13} /> Edit
                    </button>
                    <button className="danger-action" onClick={() => setDeletingTask(task)}><Trash2 size={13} /> Delete</button>
                  </div>
                </div>;
              })}
            </div>;
          })}
        </div>
      </QueryState>
    </div>

    {serviceEdit && <RecordModal
      title={serviceEdit.id ? "Edit service" : "Add service"}
      initial={serviceEdit}
      fields={[
        { name: "clientId", label: "Client", options: clientOptions, required: true },
        { name: "serviceType", label: "Service", options: SERVICE_TYPES, required: true },
        { name: "packageName", label: "Package name", placeholder: "e.g. Growth SEO" },
        { name: "monthlyValue", label: "Monthly value", kind: "money" },
        { name: "startDate", label: "Start date", kind: "date", type: "date" },
        { name: "status", label: "Status", options: ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"], required: true }
      ]}
      onSubmit={saveService}
      onClose={() => setServiceEdit(null)}
    />}

    {taskEdit && <RecordModal
      title={taskEdit.id ? "Edit task" : "Add task"}
      initial={taskEdit}
      fields={[
        { name: "title", label: "Task title", required: true },
        // This was a free-text "Service Order ID" box the user had to fill by hand.
        { name: "serviceOrderId", label: "Linked service", options: serviceOptions },
        { name: "assignedToId", label: "Assigned to", options: teamOptions, required: true },
        { name: "priority", label: "Priority", options: ["LOW", "MEDIUM", "HIGH", "URGENT"], required: true },
        { name: "status", label: "Status", options: TASK_STATUSES, required: true },
        { name: "dueDate", label: "Due date", kind: "date", type: "date", required: true }
      ]}
      onSubmit={saveTask}
      onClose={() => setTaskEdit(null)}
    />}

    {deletingTask && <ConfirmModal
      title="Delete task" message={`Delete "${deletingTask.title}"?`} confirmLabel="Delete task"
      onConfirm={async () => {
        await api(`/tasks/${deletingTask.id}`, { method: "DELETE" });
        notify("Task deleted.");
        refresh();
      }}
      onClose={() => setDeletingTask(null)}
    />}

    {deletingService && <ConfirmModal
      title="Delete service"
      message={`Delete the ${pretty(deletingService.serviceType)} service? Its tasks will be removed too.`}
      confirmLabel="Delete service"
      onConfirm={async () => {
        await api(`/services/${deletingService.id}`, { method: "DELETE" });
        notify("Service deleted.");
        refresh();
      }}
      onClose={() => setDeletingService(null)}
    />}
  </div>;
}
