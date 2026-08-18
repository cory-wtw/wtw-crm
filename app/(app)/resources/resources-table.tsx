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
import {
  BUCKET_LABELS,
  CLASSIFICATION_GAP_LABELS,
  type Bucket,
  type ClassificationGap,
} from "@/lib/schemas";

export type ResourceRow = {
  id: string;
  organizationName: string;
  website: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  services: string | null;
  description: string | null;
  eligibility: string | null;
  buckets: Bucket[];
  /** Empty when the matcher can offer this record to somebody. */
  gaps: ClassificationGap[];
};

function truncate(value: string | null, max = 90): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

const columns: ColumnDef<ResourceRow>[] = [
  {
    accessorKey: "organizationName",
    header: "Organization",
    cell: ({ row }) => (
      <Link
        href={`/resources/${row.original.id}`}
        className="font-bold text-foreground underline-offset-4 hover:underline"
      >
        {row.original.organizationName}
      </Link>
    ),
  },
  {
    id: "buckets",
    header: "Needs served",
    enableSorting: false,
    cell: ({ row }) => {
      const { buckets, gaps } = row.original;
      if (buckets.length === 0) {
        return (
          <span className="text-xs font-bold text-[color:var(--wtw-deep-gold)]">
            {CLASSIFICATION_GAP_LABELS["no-buckets"]}
          </span>
        );
      }
      return (
        <div className="flex flex-wrap gap-1">
          {buckets.map((bucket) => (
            <span
              key={bucket}
              className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            >
              {BUCKET_LABELS[bucket]}
            </span>
          ))}
          {gaps.includes("no-states") && (
            <span className="inline-flex items-center rounded-full bg-[color:var(--wtw-deep-gold)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--wtw-deep-gold)]">
              {CLASSIFICATION_GAP_LABELS["no-states"]}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "services",
    header: "Services",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {truncate(row.original.services)}
      </span>
    ),
  },
  {
    id: "contact",
    header: "Contact",
    cell: ({ row }) => {
      const { contactName, contactPhone } = row.original;
      if (!contactName && !contactPhone) return "—";
      return (
        <div className="leading-tight">
          {contactName && <div>{contactName}</div>}
          {contactPhone && (
            <div className="text-xs text-muted-foreground">{contactPhone}</div>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "website",
    header: "Website",
    enableSorting: false,
    cell: ({ row }) => {
      const url = row.original.website;
      if (!url) return "—";
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--wtw-deep-gold)] underline-offset-4 hover:underline"
        >
          {url.replace(/^https?:\/\//i, "")}
        </a>
      );
    },
  },
];

export function ResourcesTable({ rows }: { rows: ResourceRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "organizationName", desc: false },
  ]);
  const [query, setQuery] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);

  const gapCount = useMemo(
    () => rows.filter((r) => r.gaps.length > 0).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const pool = onlyGaps ? rows.filter((r) => r.gaps.length > 0) : rows;
    if (!query.trim()) return pool;
    const q = query.toLowerCase();
    return pool.filter((r) =>
      [
        r.organizationName,
        r.services,
        r.description,
        r.eligibility,
        r.contactName,
        r.website,
      ]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(q)),
    );
  }, [rows, query, onlyGaps]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search by need, service, org, or description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {gapCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyGaps((v) => !v)}
              aria-pressed={onlyGaps}
              className={`inline-flex h-9 shrink-0 items-center justify-center rounded-md border px-3 text-xs font-bold transition-colors ${
                onlyGaps
                  ? "border-[color:var(--wtw-deep-gold)] bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]"
                  : "border-border bg-card hover:bg-secondary"
              }`}
            >
              {onlyGaps ? "Showing" : "Show"} {gapCount} not yet matchable
            </button>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>
      <div className="mobile-touch-scroll overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[48rem] text-sm">
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
                          <SortIndicator state={header.column.getIsSorted()} />
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
                  <td key={cell.id} className="px-4 py-2.5 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="border-t border-border p-6 text-center text-xs text-muted-foreground">
            {query
              ? `No matches for “${query}”.`
              : "Every record is classified."}
          </p>
        )}
      </div>
    </div>
  );
}

function SortIndicator({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <span aria-hidden>↑</span>;
  if (state === "desc") return <span aria-hidden>↓</span>;
  return (
    <span aria-hidden className="opacity-30">
      ↕
    </span>
  );
}
