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
  PARTNERSHIP_STATUS_LABELS,
  type PartnershipStatus,
} from "@/lib/schemas";

export type VsoRow = {
  id: string;
  fullName: string;
  affiliation: string | null;
  city: string | null;
  state: string | null;
  partnershipStatus: PartnershipStatus;
  referralsMade: number;
};

const STATUS_TINT: Record<PartnershipStatus, string> = {
  active_partner: "bg-primary text-primary-foreground",
  in_discussion:
    "bg-[color:var(--wtw-deep-gold)]/15 text-[color:var(--wtw-deep-gold)]",
  inactive: "bg-muted text-muted-foreground",
  declined: "bg-secondary text-muted-foreground",
};

const columns: ColumnDef<VsoRow>[] = [
  {
    accessorKey: "fullName",
    header: "Name",
    cell: ({ row }) => (
      <Link
        href={`/vsos/${row.original.id}`}
        className="font-bold text-foreground underline-offset-4 hover:underline"
      >
        {row.original.fullName}
      </Link>
    ),
  },
  {
    accessorKey: "affiliation",
    header: "Affiliation",
    cell: ({ row }) => row.original.affiliation ?? "—",
  },
  {
    id: "location",
    header: "Location",
    cell: ({ row }) => {
      const { city, state } = row.original;
      if (!city && !state) return "—";
      return [city, state].filter(Boolean).join(", ");
    },
  },
  {
    accessorKey: "partnershipStatus",
    header: "Status",
    cell: ({ row }) => {
      const s = row.original.partnershipStatus;
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${STATUS_TINT[s]}`}
        >
          {PARTNERSHIP_STATUS_LABELS[s]}
        </span>
      );
    },
  },
  {
    accessorKey: "referralsMade",
    header: "Referrals",
    cell: ({ row }) => row.original.referralsMade,
  },
];

export function VsosTable({ rows }: { rows: VsoRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "fullName", desc: false },
  ]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.affiliation ?? "").toLowerCase().includes(q) ||
        (r.city ?? "").toLowerCase().includes(q) ||
        (r.state ?? "").toLowerCase().includes(q),
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
          placeholder="Search by name, affiliation, or location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
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
  return (
    <span aria-hidden className="opacity-30">
      ↕
    </span>
  );
}
