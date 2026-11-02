"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { formatDate, formatUsd } from "@/lib/format";
import { formatShortName } from "@/lib/name";
import { PIPELINE_LABELS, type PipelineStage } from "@/lib/schemas";
import type { VeteranListItem } from "@/lib/db/veterans";

import { Search } from "lucide-react";

// One hue per stage so the list scans at a glance.
const STAGE_TINT: Record<PipelineStage, string> = {
  found: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  connected: "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200",
  filed: "bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-200",
  won: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200",
  lost: "bg-muted text-muted-foreground",
};

const AVATAR_TINT: Record<PipelineStage, string> = {
  found: "bg-amber-200/70 text-amber-950",
  connected: "bg-sky-200/70 text-sky-950",
  filed: "bg-violet-200/70 text-violet-950",
  won: "bg-emerald-200/70 text-emerald-950",
  lost: "bg-muted text-muted-foreground",
};

const columns: ColumnDef<VeteranListItem>[] = [
  {
    id: "name",
    accessorFn: (row) => formatShortName(row.firstName, row.lastInitial),
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/veterans/${row.original.id}`}
        className="font-bold text-foreground underline-offset-4 hover:underline"
      >
        {formatShortName(row.original.firstName, row.original.lastInitial)}
      </Link>
    ),
  },
  {
    accessorKey: "pipelineStage",
    header: "Stage",
    cell: ({ row }) => {
      const stage = row.original.pipelineStage;
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${STAGE_TINT[stage]}`}
        >
          {PIPELINE_LABELS[stage]}
        </span>
      );
    },
  },
  {
    accessorKey: "monthlyBenefitAfter",
    header: "Monthly (now)",
    cell: ({ row }) =>
      row.original.monthlyBenefitAfter
        ? formatUsd(row.original.monthlyBenefitAfter)
        : "—",
    sortingFn: (a, b) =>
      a.original.monthlyBenefitAfter - b.original.monthlyBenefitAfter,
  },
  {
    accessorKey: "dateFound",
    header: "Found",
    cell: ({ row }) => formatDate(row.original.dateFound),
    sortingFn: (a, b) => {
      const av = a.original.dateFound ? Date.parse(a.original.dateFound) : 0;
      const bv = b.original.dateFound ? Date.parse(b.original.dateFound) : 0;
      return av - bv;
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Last updated",
    cell: ({ row }) => formatDate(row.original.updatedAt),
    sortingFn: (a, b) =>
      Date.parse(a.original.updatedAt) - Date.parse(b.original.updatedAt),
  },
];

export function VeteransTable({
  rows,
  counts,
  stageOrder,
}: {
  rows: VeteranListItem[];
  counts: Record<PipelineStage, number>;
  stageOrder: PipelineStage[];
}) {
  const [stage, setStage] = useState<PipelineStage | "all">("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (stage === "all" || r.pipelineStage === stage) &&
        (!q || formatShortName(r.firstName, r.lastInitial).toLowerCase().includes(q)),
    );
  }, [rows, query, stage]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const chips: { key: PipelineStage | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: rows.length },
    ...stageOrder.map((k) => ({ key: k, label: PIPELINE_LABELS[k], count: counts[k] })),
  ];

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search veterans</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          placeholder="Search veterans"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 w-full rounded-2xl border border-input bg-card pr-4 pl-12 text-sm shadow-[0_1px_2px_rgb(29_25_18/0.04)] focus:ring-2 focus:ring-ring focus:outline-none"
        />
      </label>

      <div
        role="group"
        aria-label="Filter by stage"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {chips.map((c) => {
          const on = stage === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => setStage(c.key)}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              }`}
            >
              {c.label}
              <span className={on ? "text-[color:var(--wtw-gold-light)]" : "text-muted-foreground"}>
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards on phones/tablets, sortable table on desktop. */}
      <ul className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(29_25_18/0.04)] lg:pointer-fine:hidden">
        {table.getRowModel().rows.map((row) => {
          const v = row.original;
          const name = formatShortName(v.firstName, v.lastInitial);
          return (
            <li key={row.id} className="border-b border-border last:border-b-0">
              <Link
                href={`/veterans/${v.id}`}
                className="flex items-center gap-3 px-4 py-3.5 active:bg-secondary/60"
              >
                <span
                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-black ${AVATAR_TINT[v.pipelineStage]}`}
                  aria-hidden
                >
                  {(v.firstName[0] ?? "") + (v.lastInitial[0] ?? "")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-foreground">{name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {v.monthlyBenefitAfter ? `${formatUsd(v.monthlyBenefitAfter)}/mo · ` : ""}
                    Updated {formatDate(v.updatedAt)}
                  </span>
                </span>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${STAGE_TINT[v.pipelineStage]}`}
                >
                  {PIPELINE_LABELS[v.pipelineStage]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mobile-touch-scroll hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgb(29_25_18/0.04)] lg:pointer-fine:block">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-secondary/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--wtw-deep-gold)]"
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <SortIndicator
                            state={header.column.getIsSorted()}
                          />
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-border transition-colors hover:bg-secondary/40"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {query ? <>No matches for &ldquo;{query}&rdquo;.</> : "Nobody in this stage yet."}
        </p>
      )}
    </div>
  );
}

function SortIndicator({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <span aria-hidden>↑</span>;
  if (state === "desc") return <span aria-hidden>↓</span>;
  return <span aria-hidden className="opacity-30">↕</span>;
}
