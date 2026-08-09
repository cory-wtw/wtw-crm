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
import { formatDate } from "@/lib/format";
import { formatShortName } from "@/lib/name";
import { PIPELINE_LABELS, type PipelineStage } from "@/lib/schemas";
import type { VeteranListItem } from "@/lib/db/veterans";

const STAGE_TINT: Record<PipelineStage, string> = {
  found: "bg-secondary text-foreground",
  connected: "bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]",
  filed: "bg-primary/20 text-foreground",
  won: "bg-primary text-primary-foreground",
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
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${STAGE_TINT[stage]}`}
        >
          {PIPELINE_LABELS[stage]}
        </span>
      );
    },
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

export function VeteransTable({ rows }: { rows: VeteranListItem[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "updatedAt", desc: true },
  ]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      formatShortName(r.firstName, r.lastInitial).toLowerCase().includes(q),
    );
  }, [rows, query]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>
      <div className="mobile-touch-scroll overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-secondary/60">
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
        {filtered.length === 0 && (
          <p className="border-t border-border p-6 text-center text-xs text-muted-foreground">
            No matches for &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}

function SortIndicator({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <span aria-hidden>↑</span>;
  if (state === "desc") return <span aria-hidden>↓</span>;
  return <span aria-hidden className="opacity-30">↕</span>;
}
