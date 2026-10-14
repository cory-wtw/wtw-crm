"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary print:hidden"
    >
      Print / save PDF
    </button>
  );
}
