import { createContext, useContext } from "react";

export const ToastContext = createContext({ notify: () => {}, dismiss: () => {} });

export function useToast() {
  return useContext(ToastContext);
}
