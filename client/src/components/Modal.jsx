import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ title, children, onClose, footer }) {
  // Locking the background stops the page behind the sheet scrolling under your finger
  // on iOS, and Escape closes it on a desktop keyboard.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head">
        <h2 className="text-base font-black">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </div>
  </div>;
}
