"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { findWorkspacePages } from "@/lib/workspace/navigation";
import { Icon } from "@/components/ui/icon";

export function ModuleFinder({ role }: { role: string }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const id = useId();
  const open = () => { if (!dialog.current?.open) dialog.current?.showModal(); input.current?.focus(); };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); open(); } };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  const results = findWorkspacePages(query, role);
  return <>
    <button className="module-finder-trigger" type="button" onClick={open} aria-haspopup="dialog" aria-label="Find a page or task"><Icon name="search" size={18} /><span>Find a page or task</span><kbd>Ctrl K</kbd></button>
    <dialog className="module-finder" ref={dialog} aria-labelledby={`${id}-title`} onClose={() => setQuery("")} onKeyDownCapture={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dialog.current?.close(); } }} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="finder-heading"><h2 id={`${id}-title`}>Where would you like to go?</h2><button className="icon-button" type="button" aria-label="Close page search" onClick={() => dialog.current?.close()}><Icon name="close" /></button></div>
      <label className="finder-input"><Icon name="search" /><span className="sr-only">Search pages and tasks</span><input ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder="Try “stock count”, “supplier” or “receipt”" type="search" autoComplete="off" /></label>
      <div className="finder-results" aria-live="polite">{results.length ? <ul>{results.map(page => <li key={page.id}><Link href={page.href} onClick={() => dialog.current?.close()}><span className="finder-icon"><Icon name={page.id} /></span><span><strong>{page.label}</strong><small>{page.description}</small></span><Icon name="arrow" size={17} /></Link></li>)}</ul> : <p className="empty-state">No matching pages. Try “menu”, “cash” or “expenses”.</p>}</div>
      <p className="finder-footer">Choose a page to continue <span>Esc to close</span></p>
    </dialog>
  </>;
}
