import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ATTACH_MAX_FILES, fileKind, fileSize, isPicture, type Attachment } from "@shared/attachments.ts";
import { useAttach } from "../lib/upload";
import { ChevronIcon, CloseIcon, DownloadIcon, PencilIcon, SwapIcon, TrashIcon } from "./icons";
import { Paperclip } from "./Paperclip";

type Props = { taskId: string; disabled?: boolean };
type Pending = { key: number; name: string; pct: number };

// Saved under its own name: fetched and handed over as a file (a cross-origin link would only open it).
async function download(f: Attachment) {
  if (!f.url) return;
  try {
    const blob = await (await fetch(f.url)).blob();
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href, download: f.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    window.open(f.url, "_blank", "noopener");
  }
}

const problemOf = (e: unknown, fallback: string) => {
  const data = (e as { data?: { message?: string } })?.data;
  return data?.message ?? fallback;
};

// A task's files, on its ticket: pictures in a carousel at full width, other files as lines that open on a click.
// Each has its controls (rename, download, replace, delete); files come in from the button, dropped anywhere on the
// ticket, or pasted.
export function Attachments({ taskId, disabled = false }: Props) {
  const found = useQuery(api.attachments.list, { task_id: taskId });
  const files: Attachment[] = Array.isArray(found) ? found : [];
  const attach = useAttach();
  const renameFile = useMutation(api.attachments.rename);
  const removeFile = useMutation(api.attachments.remove);
  const [pending, setPending] = useState<Pending[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const seq = useRef(0);
  const room = ATTACH_MAX_FILES - files.length - pending.length;

  // One file up and filed, onto a new line or (onto) in place of one already there.
  const send = async (file: File, onto?: string) => {
    const key = ++seq.current;
    setPending((p) => [...p, { key, name: file.name, pct: 0 }]);
    const onPct = (pct: number) => setPending((p) => p.map((x) => (x.key === key ? { ...x, pct } : x)));
    const bad = await attach(taskId, file, { onto, onPct });
    setPending((p) => p.filter((x) => x.key !== key));
    if (bad) setProblem(bad);
  };
  const take = (list: FileList | File[] | null | undefined) => {
    const all = [...(list ?? [])];
    if (!all.length || disabled) return;
    setProblem(all.length > room ? `A task holds up to ${ATTACH_MAX_FILES} files` : null);
    for (const f of all.slice(0, Math.max(0, room))) void send(f);
  };
  const latest = useRef(take);
  latest.current = take;

  // The whole ticket takes a drop, and a paste of files anywhere but into a field.
  useEffect(() => {
    const ticket = root.current?.closest<HTMLElement>(".ticket");
    if (!ticket) return;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    const over = (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); setDropping(true); } };
    const leave = (e: DragEvent) => { if (!ticket.contains(e.relatedTarget as Node | null)) setDropping(false); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDropping(false);
      latest.current(e.dataTransfer?.files);
    };
    const paste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      const into = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if (!files?.length || (into && !e.clipboardData?.types.every((t) => t === "Files"))) return;
      e.preventDefault();
      latest.current(files);
    };
    ticket.addEventListener("dragover", over);
    ticket.addEventListener("dragleave", leave);
    ticket.addEventListener("drop", drop);
    document.addEventListener("paste", paste);
    return () => {
      ticket.removeEventListener("dragover", over);
      ticket.removeEventListener("dragleave", leave);
      ticket.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste);
    };
  }, []);
  useEffect(() => { root.current?.closest(".ticket")?.classList.toggle("is-dropping", dropping); }, [dropping]);

  const controls = {
    disabled,
    onRename: (f: Attachment, name: string) => renameFile({ id: f.id, name }).then(() => true, (e) => { setProblem(problemOf(e, "Couldn't rename it")); return false; }),
    onReplace: (f: Attachment, file: File) => void send(file, f.id),
    onDelete: (f: Attachment) => void removeFile({ id: f.id }).catch((e) => setProblem(problemOf(e, "Couldn't delete it"))),
  };
  const fresh = useFresh(found === undefined ? null : files);
  const pictures = files.filter(isPicture);
  const others = files.filter((f) => !isPicture(f));
  return (
    <section ref={root} className="tk-files" aria-label="Attachments">
      {pictures.length > 0 && <Carousel pictures={pictures} fresh={fresh} {...controls} />}
      {(others.length > 0 || pending.length > 0) && (
        <ul className="tk-file-list">
          {others.map((f) => <FileLine key={f.id} file={f} isNew={fresh.has(f.id)} {...controls} />)}
          {pending.map((p) => (
            <li key={p.key} className="tk-file is-pending" aria-busy>
              <span className="tk-file-kind">{fileKind(p.name)}</span>
              <span className="tk-file-name">{p.name}</span>
              <span className="tk-file-size">{p.pct < 100 ? `${p.pct}%` : "FILING…"}</span>
              <span className="tk-file-progress" style={{ ["--pct" as string]: `${p.pct}%` }} aria-hidden />
            </li>
          ))}
        </ul>
      )}
      {problem && <small className="tk-problem" role="alert">{problem}</small>}
      <p className="tk-files-add">
        <button type="button" className="tk-prep-add" disabled={disabled || room <= 0} onClick={() => picker.current?.click()}>+ ATTACH FILES</button>
        <span className="tk-files-hint" aria-hidden>or drop or paste them here</span>
        <input ref={picker} type="file" multiple hidden aria-label="Attach files" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      </p>
    </section>
  );
}

// The files that came in since the ticket opened (not the ones it opened with): they clip on as they arrive.
function useFresh(files: Attachment[] | null) {
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!files) return;
    if (!known.current) { known.current = new Set(files.map((f) => f.id)); return; }
    const added = files.filter((f) => !known.current!.has(f.id)).map((f) => f.id);
    if (!added.length) return;
    added.forEach((id) => known.current!.add(id));
    setFresh((s) => new Set([...s, ...added]));
  }, [files]);
  return fresh;
}

type Controls = {
  disabled: boolean;
  onRename: (f: Attachment, name: string) => Promise<boolean>;
  onReplace: (f: Attachment, file: File) => void;
  onDelete: (f: Attachment) => void;
};

// Pictures side by side in a strip that snaps one to a view, small enough to leave the ticket readable: swiped on
// the phone, arrows or the keyboard on desktop. The one in view prints its name and controls under it; a tap opens
// them all full screen (Lightbox), at that one.
function Carousel({ pictures, fresh, ...c }: Controls & { pictures: Attachment[]; fresh: Set<string> }) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const n = pictures.length;
  const i = Math.min(at, n - 1);
  useEffect(() => { if (at > n - 1) setAt(Math.max(0, n - 1)); }, [at, n]);
  const go = (k: number, smooth = true) => {
    const el = track.current;
    const to = (k + n) % n;
    setAt(to);
    el?.scrollTo?.({ left: to * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  };
  return (
    <div className="tk-carousel" role="region" aria-roledescription="carousel" aria-label="Pictures" onKeyDown={keys}>
      <div className="tk-frame">
        <div ref={track} className="tk-slides" tabIndex={0} aria-live="polite"
          onScroll={(e) => { const el = e.currentTarget; if (el.clientWidth) setAt(Math.round(el.scrollLeft / el.clientWidth)); }}>
          {pictures.map((p, k) => (
            <figure key={p.id} className={`tk-slide${fresh.has(p.id) ? " is-new" : ""}`} role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}: ${p.name}`}>
              <button type="button" className="tk-slide-open" tabIndex={k === i ? 0 : -1} aria-label={`View ${p.name}`} onClick={() => setViewing(k)}>
                <img src={p.url ?? undefined} alt={p.name} loading="lazy" draggable={false} />
              </button>
              {fresh.has(p.id) && <Paperclip className="tk-slide-clip" />}
            </figure>
          ))}
        </div>
        {n > 1 && (
          <>
            <button type="button" className="tk-slide-go is-prev" aria-label="Previous picture" onClick={() => go(i - 1)}><ChevronIcon size={20} /></button>
            <button type="button" className="tk-slide-go is-next" aria-label="Next picture" onClick={() => go(i + 1)}><ChevronIcon size={20} /></button>
            <span className="tk-slide-count" aria-hidden>{i + 1}/{n}</span>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="tk-dots" role="group" aria-label="Pick a picture">
          {pictures.map((p, k) => (
            <button key={p.id} type="button" className="tk-dot" aria-label={`Picture ${k + 1}: ${p.name}`} aria-current={k === i || undefined} onClick={() => go(k)} />
          ))}
        </div>
      )}
      <FileBar file={pictures[i]} {...c} />
      {viewing !== null && (
        <Lightbox pictures={pictures} start={viewing} onClose={(k) => { setViewing(null); go(k, false); }} />
      )}
    </div>
  );
}

// The pictures full screen, over everything (a modal of its own above the ticket): swiped or arrowed through like the
// strip, each at the most the screen allows. Escape, the cross or a tap off the picture closes it, at the picture
// last seen, and the strip on the ticket follows.
function Lightbox({ pictures, start, onClose }: { pictures: Attachment[]; start: number; onClose: (at: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(start);
  const n = pictures.length;
  const f = pictures[Math.min(at, n - 1)];
  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    const el = track.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    d.querySelector<HTMLElement>(".lb-close")?.focus();
    return () => { if (d.open && typeof d.close === "function") d.close(); };
  }, [start]);
  const go = (k: number) => {
    const to = (k + n) % n;
    setAt(to);
    const el = track.current;
    el?.scrollTo?.({ left: to * el.clientWidth, behavior: "smooth" });
  };
  const close = () => onClose(at);
  return (
    <dialog ref={dialog} className="lightbox" aria-label="Pictures, full size"
      onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { e.stopPropagation(); if (!(e.target as Element).closest("img, button")) close(); }}
      onKeyDown={(e) => {
        e.stopPropagation(); // the ticket under it keeps its keys to itself
        if (e.key === "Escape") { e.preventDefault(); close(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); go(at + 1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(at - 1); }
      }}>
      <div ref={track} className="lb-slides"
        onScroll={(e) => { const el = e.currentTarget; if (el.clientWidth) setAt(Math.round(el.scrollLeft / el.clientWidth)); }}>
        {pictures.map((p, k) => (
          <figure key={p.id} className="lb-slide" aria-label={`${k + 1} of ${n}: ${p.name}`}>
            <img src={p.url ?? undefined} alt={p.name} draggable={false} />
          </figure>
        ))}
      </div>
      <div className="lb-bar">
        <span className="lb-name" title={f.name}>{f.name}</span>
        {n > 1 && <span className="lb-count">{Math.min(at, n - 1) + 1}/{n}</span>}
        <button type="button" className="lb-tool" aria-label={`Download ${f.name}`} title="Download" onClick={() => void download(f)}><DownloadIcon size={18} /></button>
        <button type="button" className="lb-tool lb-close" aria-label="Close" onClick={close}><CloseIcon size={20} /></button>
      </div>
      {n > 1 && (
        <>
          <button type="button" className="lb-go is-prev" aria-label="Previous picture" onClick={() => go(at - 1)}><ChevronIcon size={26} /></button>
          <button type="button" className="lb-go is-next" aria-label="Next picture" onClick={() => go(at + 1)}><ChevronIcon size={26} /></button>
        </>
      )}
    </dialog>
  );
}

// A file that isn't a picture: its kind stamped, its name (a click opens it), size, and its controls.
function FileLine({ file, isNew, ...c }: Controls & { file: Attachment; isNew?: boolean }) {
  return (
    <li className={`tk-file${isNew ? " is-new" : ""}`}>
      <FileBar file={file} line {...c} />
    </li>
  );
}

// A file's name and controls. The name is retyped where it is printed; Delete asks once more before it goes.
function FileBar({ file: f, line = false, disabled, onRename, onReplace, onDelete }: Controls & { file: Attachment; line?: boolean }) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState(f.name);
  const [sure, setSure] = useState(false);
  const swap = useRef<HTMLInputElement>(null);
  useEffect(() => { setNaming(false); setSure(false); }, [f.id]);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 3000);
    return () => clearTimeout(t);
  }, [sure]);
  const keep = async () => {
    const name = draft.trim();
    if (!name || name === f.name) return setNaming(false);
    setNaming(false);
    if (!(await onRename(f, name))) setNaming(true);
  };
  return (
    <div className={`tk-file-bar-row${line ? " is-line" : ""}`}>
      {line && <span className="tk-file-kind" aria-hidden>{fileKind(f.name)}</span>}
      {naming ? (
        <input className="tk-file-rename" value={draft} aria-label="File name" maxLength={200} autoFocus
          onChange={(e) => setDraft(e.target.value)} onBlur={() => void keep()}
          onFocus={(e) => e.target.setSelectionRange(0, f.name.replace(/\.[^.]+$/, "").length || f.name.length)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void keep(); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setNaming(false); }
          }} />
      ) : line ? (
        <a className="tk-file-name" href={f.url ?? undefined} target="_blank" rel="noreferrer" title={f.name}>{f.name}</a>
      ) : (
        <span className="tk-file-name" title={f.name}>{f.name}</span>
      )}
      <span className="tk-file-size">{fileSize(f.size)}</span>
      <span className="tk-file-tools">
        <button type="button" className="tk-file-tool" aria-label={`Rename ${f.name}`} title="Rename" disabled={disabled}
          onClick={() => { setDraft(f.name); setNaming(true); }}><PencilIcon size={15} /></button>
        <button type="button" className="tk-file-tool" aria-label={`Download ${f.name}`} title="Download" disabled={!f.url}
          onClick={() => void download(f)}><DownloadIcon size={15} /></button>
        <button type="button" className="tk-file-tool" aria-label={`Replace ${f.name}`} title="Replace with another file" disabled={disabled}
          onClick={() => swap.current?.click()}><SwapIcon size={15} /></button>
        <button type="button" className={`tk-file-tool is-delete${sure ? " is-sure" : ""}`} aria-label={sure ? `Sure? Delete ${f.name}` : `Delete ${f.name}`}
          title={sure ? "Click again to delete" : "Delete"} disabled={disabled}
          onClick={() => (sure ? onDelete(f) : setSure(true))}>{sure ? "SURE?" : <TrashIcon size={15} />}</button>
      </span>
      <input ref={swap} type="file" hidden aria-label={`Replace ${f.name} with`} onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) onReplace(f, file);
      }} />
    </div>
  );
}
