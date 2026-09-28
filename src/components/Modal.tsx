"use client";

/** Centered dialog shell: dimmed backdrop + click-outside-to-close panel. */
export default function Modal({
  onClose,
  children,
  className = "w-full max-w-sm",
}: {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className={`card p-5 ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
