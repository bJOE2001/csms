"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./icon";

const FeedbackContext = createContext<
  (message: string, title?: string) => void
>(() => {});
export const useFeedback = () => useContext(FeedbackContext);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{
    message: string;
    id: number;
    title: string;
  }>();
  const [paused, setPaused] = useState(false);
  const sequence = useRef(0);
  const notify = useCallback(
    (message: string, title = "Saved successfully") => {
      setPaused(false);
      setNotice({ message, title, id: ++sequence.current });
    },
    [],
  );
  useEffect(() => {
    if (!notice || paused) return;
    const timer = setTimeout(() => setNotice(undefined), 5000);
    return () => clearTimeout(timer);
  }, [notice, paused]);
  const value = useMemo(() => notify, [notify]);
  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {notice && (
          <div
            className="success-toast"
            key={notice.id}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setPaused(false);
            }}
          >
            <span className="toast-icon">
              <Icon name="check" size={19} />
            </span>
            <div>
              <strong>{notice.title}</strong>
              <p>{notice.message}</p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice(undefined)}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
