import { pretty, splitList } from "../lib/format";

function toOption(item) {
  return typeof item === "string" ? { value: item, label: pretty(item) } : item;
}

/**
 * One form control. The `kind` decides both how the value is stored and which iPhone
 * keyboard opens: `money` and `number` bring up the numeric pad, `phone` the dialler,
 * `email` the email keyboard. Everything renders at 16px so iOS never zooms the page in
 * when a field is focused.
 */
export default function Field({
  label, value, onChange, kind, type = "text", options, rows = 1,
  help, placeholder, min, step, required, autoComplete, disabled, wide
}) {
  const wrapClass = wide || kind === "multi" || rows > 1 ? "block md:col-span-2" : "block";

  if (kind === "multi") {
    const selected = Array.isArray(value) ? value : splitList(value);
    return <div className={wrapClass}>
      <span className="field-label">{label}</span>
      <div className="option-grid">
        {(options || []).map((item) => {
          const option = toOption(item);
          const checked = selected.includes(option.value);
          return <button
            type="button"
            key={option.value}
            aria-pressed={checked}
            className={`option-pill ${checked ? "selected" : ""}`}
            onClick={() => onChange(checked ? selected.filter((current) => current !== option.value) : [...selected, option.value])}
          >{option.label}</button>;
        })}
      </div>
      {help && <span className="field-help">{help}</span>}
    </div>;
  }

  const numeric = kind === "money" || kind === "number";
  const inputMode = numeric ? "decimal" : kind === "phone" ? "tel" : kind === "email" ? "email" : undefined;
  const inputType = numeric ? "number" : kind === "phone" ? "tel" : kind === "email" ? "email" : type;

  return <label className={wrapClass}>
    <span className="field-label">{label}{required && <span className="text-[#be123c]"> *</span>}</span>
    {options ? (
      <select className="input" value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {!required && <option value="">Not set</option>}
        {options.map((item) => {
          const option = toOption(item);
          return <option key={option.value} value={option.value}>{option.label}</option>;
        })}
      </select>
    ) : rows > 1 ? (
      <textarea className="input" rows={rows} value={value ?? ""} placeholder={placeholder} disabled={disabled}
        onChange={(event) => onChange(event.target.value)} />
    ) : (
      <input
        className="input"
        type={inputType}
        inputMode={inputMode}
        min={numeric ? (min ?? "0") : min}
        step={kind === "money" ? "0.01" : step}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    )}
    {help && <span className="field-help">{help}</span>}
  </label>;
}
