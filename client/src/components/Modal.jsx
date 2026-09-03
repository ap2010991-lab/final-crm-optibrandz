import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Sheets stack: picking a post out of the day sheet opens the move/remove sheet over it.
// Every mounted Modal listens for Escape on the window, so without a stack one press
// reached all of them and the sheet underneath closed along with — or instead of — the
// one you were looking at.
const openModals = [];

export default function Modal({ title, children, onClose, footer }) {
  // A stable identity for this sheet's place in the stack, created once per mount.
  const [id] = useState(() => Symbol("modal"));

  // Locking the background stops the page behind the sheet scrolling under your finger
  // on iOS. Kept apart from the key handler below, whose dependency changes on every
  // render, so re-rendering cannot shuffle this sheet back to the top of the stack.
  useEffect(() => {
    openModals.push(id);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      const index = openModals.indexOf(id);
      if (index >= 0) openModals.splice(index, 1);
      document.body.style.overflow = overflow;
    };
  }, [id]);

  // Escape dismisses the sheet on top and only that one.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (openModals[openModals.length - 1] !== id) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, onClose]);

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
