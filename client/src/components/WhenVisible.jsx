import { useEffect, useRef, useState } from "react";

/**
 * Renders `children` only once the placeholder is close to the viewport.
 *
 * The charts bundle is by far the heaviest asset in the app (~408 kB of Recharts). On a
 * phone the charts sit well below the fold behind the KPI cards, so downloading them
 * during the initial dashboard render cost ~400ms of network for something not yet on
 * screen. On a desktop the charts are usually visible immediately and `rootMargin` means
 * they still start loading straight away.
 */
export default function WhenVisible({ children, placeholder = null, rootMargin = "400px" }) {
  const ref = useRef(null);
  // A browser without IntersectionObserver renders immediately; deciding that in the
  // initial state avoids setting state synchronously from inside the effect.
  const [show, setShow] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (show) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShow(true);
        observer.disconnect();
      }
    }, { rootMargin });

    observer.observe(node);
    return () => observer.disconnect();
  }, [show, rootMargin]);

  if (show) return children;
  return <div ref={ref}>{placeholder}</div>;
}
