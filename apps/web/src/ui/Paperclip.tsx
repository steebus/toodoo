// A task's files, on its paper: a steel paperclip hooked over the paper's left edge. One drawing for every ticket
// (dockets, stubs, slips, an epic's mini tickets); where it sits and how big is each one's CSS (.clip in pass.css).
export const filesLabel = (n: number) => `${n} ${n === 1 ? "attachment" : "attachments"}`;

export function Paperclip({ n, className = "" }: { n?: number; className?: string }) {
  const label = n ? filesLabel(n) : undefined;
  return (
    <span className={`clip ${className}`} {...(label ? { role: "img", "aria-label": label, title: label } : { "aria-hidden": true })}>
      <svg viewBox="-1 -1 18 46" aria-hidden focusable="false">
        <path d="M5 14V34a3 3 0 0 0 6 0V8a5 5 0 0 0-10 0V36a7 7 0 0 0 14 0V12" />
      </svg>
    </span>
  );
}
