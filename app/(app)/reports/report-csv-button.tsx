"use client";

export type ReportRow = {
  name: string;
  dependents: string;
  ratingBefore: number;
  ratingAfter: number;
  before: number;
  after: number;
  lift: number;
};

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ReportCsvButton({ rows }: { rows: ReportRow[] }) {
  function download() {
    const header = [
      "Name",
      "Dependents",
      "Rating before",
      "Rating after",
      "Monthly before",
      "Monthly after",
      "Monthly unlocked",
      "Annual unlocked",
    ];
    const body = rows.map((r) => [
      r.name,
      r.dependents,
      `${r.ratingBefore}%`,
      `${r.ratingAfter}%`,
      r.before.toFixed(2),
      r.after.toFixed(2),
      r.lift.toFixed(2),
      (r.lift * 12).toFixed(2),
    ]);
    const csv = [header, ...body]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "income-unlocked.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={rows.length === 0}
      className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-50"
    >
      Download CSV
    </button>
  );
}
