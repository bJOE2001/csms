import { forwardRef, type AnchorHTMLAttributes } from "react";

// The isolated Vite fixture tests presentation and semantics; Next owns routing in E2E.
export default forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(function FixtureLink(props, ref) {
  return <a {...props} ref={ref} />;
});
