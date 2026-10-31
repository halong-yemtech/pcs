export function Modal({
  title,
  eyebrow,
  wide,
  onClose,
  children,
  footer,
}: {
  title: string;
  eyebrow?: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-[rgba(10,16,22,0.45)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`grid max-h-[calc(100vh-32px)] w-full gap-3 overflow-auto rounded-lg border border-line bg-surface p-[18px] ${wide ? "max-w-[1000px]" : "max-w-[620px]"}`}
      >
        <div>
          {eyebrow ? <div className="font-mono text-[13px] text-muted">{eyebrow}</div> : null}
          <h2 className="m-0 font-display text-2xl font-semibold">{title}</h2>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}
