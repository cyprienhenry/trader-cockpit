"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import palletData from "@/data/data.json";
import {
  FilterCriteria,
  FIXED_NOW_ISO,
  applyFilters,
  computeStatus,
  hasEtaPassed,
  isEtaWithinSevenDays,
} from "@/lib/filters";
import type { PalletDataset, PalletItem, PalletRow } from "@/types";

// const FIXED_NOW = new Date(FIXED_NOW_ISO);
const FIXED_NOW = new Date("2025-11-12T00:00:00Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type EnrichedRow = PalletRow & { stableKey: string };
type StringFieldKey = {
  [K in keyof PalletItem]: PalletItem[K] extends string | undefined ? K : never;
}[keyof PalletItem];

const PALLET_ITEMS: PalletItem[] = ((palletData as PalletDataset).palletitems ||
  []) as PalletItem[];

const SOURCE_DATA: EnrichedRow[] = PALLET_ITEMS.map((item, index) => ({
  ...item,
  etaDate: new Date(item.eta),
  etdDate: new Date(item.etd),
  stableKey: `${item.shipment_id}-${item.container_id ?? item.container_code}-${
    item.line_id ?? index
  }`,
}));

const uniqueValues = <K extends StringFieldKey>(key: K) => {
  const values = PALLET_ITEMS.map(
    (item) => item[key as keyof PalletItem]
  ).filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
};

const ALL_PORTS = uniqueValues("port_destination");
const VARIETIES = uniqueValues("variety");
const CALIBERS = uniqueValues("caliber_raw");
const PREALLOCATED_FILTER_OPTIONS: Array<{
  value: PreAllocatedFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "pre", label: "Only pre-allocated" },
  { value: "not_pre", label: "Only unallocated" },
];

type PreAllocatedFilter = "all" | "pre" | "not_pre";
type UiFilters = FilterCriteria & { preAllocatedFilter: PreAllocatedFilter };

const INITIAL_FILTERS: UiFilters = {
  port: "",
  variety: "",
  caliber: "",
  etaFrom: "",
  etaTo: "",
  nextArrivalsOnly: false,
  preAllocatedFilter: "all",
};

type ColumnKey =
  | "port_destination"
  | "days_to_arrival"
  | "variety"
  | "caliber_raw"
  | "pack_format_raw"
  | "box_count"
  | "box_weight_kg"
  | "line_weight_kg"
  | "status"
  | "pre_allocated"
  | "pallet_pl_id";

interface ColumnDefinition {
  key: ColumnKey;
  label: string;
  numeric?: boolean;
}

const COLUMNS: ColumnDefinition[] = [
  { key: "port_destination", label: "Port" },
  { key: "days_to_arrival", label: "Days to arrival" },
  { key: "variety", label: "Variety" },
  { key: "caliber_raw", label: "Caliber" },
  { key: "pack_format_raw", label: "Pack format" },
  { key: "box_count", label: "Boxes", numeric: true },
  { key: "box_weight_kg", label: "Box weight (kg)", numeric: true },
  { key: "line_weight_kg", label: "Line weight (kg)", numeric: true },
  { key: "status", label: "Status" },
  { key: "pre_allocated", label: "Pre-allocated" },
  { key: "pallet_pl_id", label: "Pallet PL ID" },
];

const getRowKey = (row: EnrichedRow) => row.stableKey;

const formatInteger = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US");
};

const formatWeight = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
};

const getDaysToArrival = (row: EnrichedRow) =>
  Math.round((row.etaDate.getTime() - FIXED_NOW.getTime()) / ONE_DAY_MS);

const getRowTooltip = (row: EnrichedRow) => {
  const booking = row.booking_reference || "—";
  const container = row.container_code || "—";
  const voyage = row.voyage_number || "—";
  return `Booking: ${booking}\nContainer: ${container}\nVoyage: ${voyage}`;
};

const normalizeOptions = (
  options: Array<string | { value: string; label: string }>
) =>
  options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  );

function formatKg(value: number) {
  const hasFraction = !Number.isInteger(value);
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 1 : 0,
    maximumFractionDigits: hasFraction ? 1 : 0,
  })} kg`;
}

function formatTons(value: number) {
  const tons = value / 1000;
  return tons.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

const formatPercent = (value: number) => `${value.toFixed(1)} %`;

const escapeCsv = (value: string | number) => {
  const text = `${value ?? ""}`;
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export default function Page() {
  const [filters, setFilters] = useState<UiFilters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<{
    column: ColumnKey;
    direction: "asc" | "desc";
  } | null>(null);
  const [preAllocated, setPreAllocated] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"lines" | "summary">("lines");

  const isRowPreAllocated = useCallback(
    (row: EnrichedRow) => preAllocated[getRowKey(row)] ?? false,
    [preAllocated]
  );

  const filteredRows = useMemo(() => {
    const { preAllocatedFilter, ...dataFilters } = filters;
    const rows = applyFilters(
      SOURCE_DATA,
      dataFilters as FilterCriteria,
      FIXED_NOW
    );
    return rows.filter((row) => {
      const rowPreAllocated = isRowPreAllocated(row);
      if (preAllocatedFilter === "pre") return rowPreAllocated;
      if (preAllocatedFilter === "not_pre") return !rowPreAllocated;
      return true;
    });
  }, [filters, isRowPreAllocated]);

  const visibleRows = useMemo(() => {
    if (!sort) return filteredRows;
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const aValue = getComparableValue(a, preAllocated, sort.column);
      const bValue = getComparableValue(b, preAllocated, sort.column);
      if (aValue === bValue) return 0;
      if (aValue > bValue) return sort.direction === "asc" ? 1 : -1;
      return sort.direction === "asc" ? -1 : 1;
    });
    return sorted;
  }, [filteredRows, sort, preAllocated]);

  const visibleCounts = useMemo(() => {
    const containers = new Set<string>();
    const shipments = new Set<string>();
    visibleRows.forEach((row) => {
      containers.add(row.container_id);
      shipments.add(row.shipment_id);
    });
    return {
      rows: visibleRows.length,
      containers: containers.size,
      shipments: shipments.size,
    };
  }, [visibleRows]);

  const portOptions = ALL_PORTS;

  const kpis = useMemo(() => {
    const horizon = new Date(FIXED_NOW);
    horizon.setUTCDate(horizon.getUTCDate() + 7);
    let totalKg = 0;
    let preAllocatedKg = 0;
    let unallocatedKg7d = 0;

    visibleRows.forEach((row) => {
      const weight = row.line_weight_kg ?? 0;
      totalKg += weight;
      const rowPreAllocated = isRowPreAllocated(row);
      if (rowPreAllocated) preAllocatedKg += weight;
      const etaTime = row.etaDate.getTime();
      if (Number.isNaN(etaTime)) {
        return;
      }
      if (
        !rowPreAllocated &&
        etaTime > FIXED_NOW.getTime() &&
        etaTime <= horizon.getTime()
      ) {
        unallocatedKg7d += weight;
      }
    });

    const pctPreAllocated =
      totalKg > 0 ? (preAllocatedKg / totalKg) * 100 : 0;
    const pctUnallocated7d =
      totalKg > 0 ? (unallocatedKg7d / totalKg) * 100 : 0;

    return {
      totalKg,
      preAllocatedKg,
      unallocatedKg7d,
      pctPreAllocated,
      pctUnallocated7d,
    };
  }, [visibleRows, isRowPreAllocated]);

  const arrivalsSummary = useMemo(() => {
    const groupMap = new Map<
      string,
      {
        port_destination: string;
        daysToArrival: number;
        totalKg: number;
        containers: Set<string>;
        shipments: Set<string>;
        lines: number;
      }
    >();
    const containersSet = new Set<string>();
    const shipmentsSet = new Set<string>();

    filteredRows.forEach((row) => {
      const diffMs = row.etaDate.getTime() - FIXED_NOW.getTime();
      if (diffMs <= 0) return;
      const daysToArrival = Math.round(diffMs / ONE_DAY_MS);
      if (daysToArrival < 1) return;

      const key = `${row.port_destination}__${daysToArrival}`;
      let group = groupMap.get(key);
      if (!group) {
        group = {
          port_destination: row.port_destination,
          daysToArrival,
          totalKg: 0,
          containers: new Set<string>(),
          shipments: new Set<string>(),
          lines: 0,
        };
        groupMap.set(key, group);
      }

      group.totalKg += row.line_weight_kg ?? 0;
      if (row.container_id) {
        group.containers.add(row.container_id);
        containersSet.add(row.container_id);
      }
      if (row.shipment_id) {
        group.shipments.add(row.shipment_id);
        shipmentsSet.add(row.shipment_id);
      }
      group.lines += 1;
    });

    const groups = Array.from(groupMap.values()).map((group) => ({
      port_destination: group.port_destination,
      daysToArrival: group.daysToArrival,
      totalKg: group.totalKg,
      containers: group.containers.size,
      shipments: group.shipments.size,
      lines: group.lines,
    }));

    groups.sort((a, b) => {
      if (a.daysToArrival !== b.daysToArrival) {
        return a.daysToArrival - b.daysToArrival;
      }
      return a.port_destination.localeCompare(b.port_destination);
    });

    const totalKg = groups.reduce((sum, group) => sum + group.totalKg, 0);

    return {
      groups,
      totals: {
        groups: groups.length,
        totalKg,
        containers: containersSet.size,
        shipments: shipmentsSet.size,
      },
    };
  }, [filteredRows]);

  const handleFilterChange = <K extends keyof UiFilters>(
    key: K,
    value: UiFilters[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSort = (column: ColumnKey) => {
    setSort((current) => {
      if (current?.column === column) {
        const direction = current.direction === "asc" ? "desc" : "asc";
        return { column, direction };
      }
      return { column, direction: "asc" };
    });
  };

  const handleTogglePreAllocated = (row: EnrichedRow) => {
    const key = getRowKey(row);
    setPreAllocated((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const clearAllFilters = () => {
    setFilters({ ...INITIAL_FILTERS });
    setSort(null);
  };

  const handleExportCsv = () => {
    if (!visibleRows.length) return;
    const header = COLUMNS.map((col) => col.label);
    const rows = visibleRows.map((row) => {
      const status = computeStatus(row, FIXED_NOW);
      const rowPreAllocated = isRowPreAllocated(row);

      return [
        row.port_destination,
        getDaysToArrival(row),
        row.variety,
        row.caliber_raw,
        row.pack_format_raw,
        row.box_count,
        row.box_weight_kg,
        row.line_weight_kg,
        status,
        rowPreAllocated ? "true" : "false",
        row.pallet_pl_id ?? "",
      ].map(escapeCsv);
    });

    const csvContent = [
      header.map(escapeCsv).join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "lading-cockpit-visible-rows.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const nowLabel = "As of 2025-11-09";

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-6 py-10">
      <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-2">
            <Image
              src="/logo.png"
              alt="Beta logo"
              fill
              className="object-contain p-2"
              sizes="64px"
              priority
            />
          </div>
          <div>
            <p className="text-sm uppercase tracking-wide text-emerald-600">
              Demo
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Beta Best Produce - Trader&apos;s Cockpit
            </h1>
            <p className="text-sm text-slate-500">
              Explore shipments and upcoming arrivals from a single view.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Filters</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                handleFilterChange(
                  "nextArrivalsOnly",
                  !filters.nextArrivalsOnly
                )
              }
              className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-medium transition ${
                filters.nextArrivalsOnly
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Next arrivals ≤7d
            </button>
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              Clear all
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SelectControl
            label="Port"
            value={filters.port}
            onChange={(value) => handleFilterChange("port", value)}
            options={portOptions}
            placeholder="All ports"
          />
          <SelectControl
            label="Variety"
            value={filters.variety}
            onChange={(value) => handleFilterChange("variety", value)}
            options={VARIETIES}
            placeholder="All varieties"
          />
          <SelectControl
            label="Caliber"
            value={filters.caliber}
            onChange={(value) => handleFilterChange("caliber", value)}
            options={CALIBERS}
            placeholder="All calibers"
          />
          <DateControl
            label="ETA from"
            value={filters.etaFrom}
            onChange={(value) => handleFilterChange("etaFrom", value)}
          />
          <DateControl
            label="ETA to"
            value={filters.etaTo}
            onChange={(value) => handleFilterChange("etaTo", value)}
          />
          <SelectControl
            label="Pre-allocated filter"
            value={filters.preAllocatedFilter}
            onChange={(value) =>
              handleFilterChange(
                "preAllocatedFilter",
                value as UiFilters["preAllocatedFilter"]
              )
            }
            options={PREALLOCATED_FILTER_OPTIONS}
          />
        </div>
      </section>

      <section className="space-y-4">
        <KPIBar totals={kpis} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              Shipments
            </h2>
            <ViewToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
          {viewMode === "lines" && (
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!visibleRows.length}
              className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition ${
                visibleRows.length
                  ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              }`}
            >
              Export visible rows (CSV)
            </button>
          )}
        </div>

        {viewMode === "lines" ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column.key} className="px-4 py-3 font-semibold">
                        <button
                          type="button"
                          onClick={() => handleSort(column.key)}
                          className="flex items-center gap-1"
                        >
                          <span>{column.label}</span>
                          <SortIndicator column={column.key} sort={sort} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const status = computeStatus(row, FIXED_NOW);
                    const rowKey = getRowKey(row);
                    const daysToArrival = getDaysToArrival(row);
                    const rowPreAllocated = isRowPreAllocated(row);
                    const preAllocatedLabel = `Toggle pre-allocation for ${
                      row.booking_reference || row.container_code || rowKey
                    }`;
                    return (
                      <tr
                        key={rowKey}
                        title={getRowTooltip(row)}
                        aria-label={getRowTooltip(row)}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">{row.port_destination}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {formatInteger(daysToArrival)}
                            </span>
                            {isEtaWithinSevenDays(row.etaDate, FIXED_NOW) && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                ≤7d
                              </span>
                            )}
                            {hasEtaPassed(row.etaDate, FIXED_NOW) && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                ETA passed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 uppercase">{row.variety}</td>
                        <td className="px-4 py-3 uppercase">
                          {row.caliber_raw}
                        </td>
                        <td className="px-4 py-3 uppercase">
                          {row.pack_format_raw}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatInteger(row.box_count)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatWeight(row.box_weight_kg)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatWeight(row.line_weight_kg)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <PreallocatedToggle
                            checked={rowPreAllocated}
                            onChange={() => handleTogglePreAllocated(row)}
                            label={preAllocatedLabel}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {row.pallet_pl_id || "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleRows.length && (
                    <tr>
                      <td
                        colSpan={COLUMNS.length}
                        className="px-4 py-6 text-center text-sm text-slate-500"
                      >
                        No matching lines
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-slate-600">
              Visible:{" "}
              <span className="font-semibold text-slate-900">
                {visibleCounts.rows.toLocaleString("en-US")}
              </span>{" "}
              lines ·{" "}
              <span className="font-semibold text-slate-900">
                {visibleCounts.containers.toLocaleString("en-US")}
              </span>{" "}
              containers ·{" "}
              <span className="font-semibold text-slate-900">
                {visibleCounts.shipments.toLocaleString("en-US")}
              </span>{" "}
              shipments
            </p>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-4 text-sm text-slate-600">
                Groups:{" "}
                <span className="font-semibold text-slate-900">
                  {arrivalsSummary.totals.groups.toLocaleString("en-US")}
                </span>{" "}
                · Total kg:{" "}
                <span className="font-semibold text-slate-900">
                  {formatKg(arrivalsSummary.totals.totalKg)}
                </span>{" "}
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Port</th>
                      <th className="px-4 py-3 font-semibold">
                        Days to arrival
                      </th>
                      <th className="px-4 py-3 font-semibold">Total weight</th>
                      <th className="px-4 py-3 font-semibold text-right">
                        Lines
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {arrivalsSummary.groups.map((group) => (
                      <tr
                        key={`${group.port_destination}-${group.daysToArrival}`}
                        className="border-t border-slate-100"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {group.port_destination}
                        </td>
                        <td className="px-4 py-3">{group.daysToArrival}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold">
                              {formatKg(group.totalKg)}
                            </span>
                            <span className="text-xs text-slate-500">
                              ({formatTons(group.totalKg)} t)
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {group.lines.toLocaleString("en-US")}
                        </td>
                      </tr>
                    ))}
                    {!arrivalsSummary.groups.length && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-6 text-center text-sm text-slate-500"
                        >
                          No upcoming arrivals for the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
      <footer className="text-sm text-slate-500">
        Dataset loaded:{" "}
        <span className="font-semibold text-slate-900">
          {SOURCE_DATA.length}
        </span>{" "}
        lines · {nowLabel}
      </footer>
    </main>
  );
}

const SortIndicator = ({
  column,
  sort,
}: {
  column: ColumnKey;
  sort: { column: ColumnKey; direction: "asc" | "desc" } | null;
}) => {
  if (!sort || sort.column !== column) {
    return null;
  }
  return (
    <span aria-hidden="true" className="text-slate-500">
      {sort.direction === "asc" ? "^" : "v"}
    </span>
  );
};

const SelectControl = ({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
  placeholder?: string;
}) => {
  const normalized = normalizeOptions(options);
  return (
    <label className="text-sm text-slate-600">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {normalized.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
};

const DateControl = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="text-sm text-slate-600">
    <span className="mb-1 block font-medium text-slate-700">{label}</span>
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  </label>
);

const PreallocatedToggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`relative inline-flex h-5 w-10 items-center rounded-full transition ${
      checked ? "bg-emerald-600" : "bg-slate-300"
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
        checked ? "translate-x-5" : "translate-x-1"
      }`}
    />
  </button>
);

const KPIBar = ({
  totals,
}: {
  totals: {
    totalKg: number;
    pctPreAllocated: number;
    pctUnallocated7d: number;
  };
}) => {
  const cards = [
    {
      label: "Total in transit",
      value: formatKg(totals.totalKg),
      sub: `(${formatTons(totals.totalKg)} t)`,
    },
    {
      label: "% pre-allocated",
      value: formatPercent(totals.pctPreAllocated),
      sub: "Share of visible weight",
    },
    {
      label: "% unallocated ≤7d",
      value: formatPercent(totals.pctUnallocated7d),
      sub: "Unallocated arriving within 7 days",
      title: "Unallocated share landing within 7 days",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          title={card.title}
        >
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="text-2xl font-semibold text-slate-900">{card.value}</p>
          <p className="text-sm text-slate-500">{card.sub}</p>
        </div>
      ))}
    </div>
  );
};

const getComparableValue = (
  row: EnrichedRow,
  preAllocatedMap: Record<string, boolean>,
  column: ColumnKey
) => {
  switch (column) {
    case "days_to_arrival":
      return getDaysToArrival(row);
    case "pre_allocated":
      return preAllocatedMap[row.stableKey] ? 1 : 0;
    case "pallet_pl_id":
      return (row.pallet_pl_id ?? "").toLowerCase();
    case "box_count":
    case "box_weight_kg":
    case "line_weight_kg":
      return row[column] ?? 0;
    case "status":
      return computeStatus(row, FIXED_NOW);
    default: {
      const value = row[column as keyof PalletItem];
      if (typeof value === "number") return value;
      return (value ?? "").toString().toLowerCase();
    }
  }
};

function ViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: "lines" | "summary";
  onChange: (mode: "lines" | "summary") => void;
}) {
  const options: Array<{ id: "lines" | "summary"; label: string }> = [
    { id: "lines", label: "Lines view" },
    { id: "summary", label: "Arrivals summary" },
  ];
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-sm">
      {options.map((option) => {
        const active = option.id === viewMode;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-full px-3 py-1 transition ${
              active
                ? "bg-emerald-600 text-white"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
