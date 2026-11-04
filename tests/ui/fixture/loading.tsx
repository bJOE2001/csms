import { useRef, useState } from "react";
import { useBeginLoading, useLoadingSignal, useLoadingTransition } from "@/components/ui/global-loading-bar";
import { useCatalog } from "@/lib/menu/use-catalog";

function PendingScope() { useLoadingSignal(true); return <p>Scoped content</p>; }
function CatalogProbe() {
  const { data, refresh } = useCatalog();
  return <section aria-label="Catalog probe"><button onClick={refresh}>Refresh catalog</button><p>{data?.shop.name ?? "Waiting for catalog"}</p></section>;
}
export function LoadingFixture() {
  const begin = useBeginLoading();
  const transition = useLoadingTransition();
  const first = useRef(() => {}), second = useRef(() => {}), resolve = useRef(() => {});
  const [scoped, setScoped] = useState(false), [catalog, setCatalog] = useState(false), [action, setAction] = useState(true);
  return <main className="workspace-content">
    <h1>Loading coordination</h1>
    <button onClick={() => { first.current = begin(); }}>Start first</button>
    <button onClick={() => { second.current = begin(); }}>Start second</button>
    <button onClick={() => { first.current(); first.current(); }}>Finish first twice</button>
    <button onClick={() => second.current()}>Finish second</button>
    <button onClick={() => setScoped(value => !value)}>Toggle scope</button>
    {scoped && <PendingScope />}
    <button onClick={() => setCatalog(value => !value)}>Toggle catalog</button>
    {catalog && <CatalogProbe />}
    {action && <button onClick={() => transition(async () => { await new Promise<void>(done => { resolve.current = done; }); })}>Start transition</button>}
    <button onClick={() => setAction(false)}>Unmount action</button>
    <button onClick={() => resolve.current()}>Complete transition</button>
  </main>;
}
