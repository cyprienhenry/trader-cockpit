"use client";

import { useMemo, useState } from "react";
import palletData from "@/data/data.json";
import {
  FilterCriteria,
  FIXED_NOW_ISO,
  ZONES,
  ZoneKey,
  applyFilters,
  computeStatus,
  hasEtaPassed,
  isEtaWithinSevenDays,
  zoneOptions
} from "@/lib/filters";
import type { PalletDataset, PalletItem, PalletRow } from "@/types";

const FIXED_NOW = new Date(FIXED_NOW_ISO);
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

type EnrichedRow = PalletRow & { stableKey: string };
type StringFieldKey = {
  [K in keyof PalletItem]: PalletItem[K] extends string | undefined
    ? K
    : never;
}[keyof PalletItem];

const PALLET_ITEMS: PalletItem[] = ((palletData as PalletDataset).palletitems ||
  []) as PalletItem[];

const SOURCE_DATA: EnrichedRow[] = PALLET_ITEMS.map((item, index) => ({
  ...item,
  etaDate: new Date(item.eta),
  etdDate: new Date(item.etd),
  stableKey: `${item.shipment_id}-${item.container_id ?? item.container_code}-${
    item.line_id ?? index
  }`
}));

const uniqueValues = <K extends StringFieldKey>(key: K) => {
  const values = PALLET_ITEMS.map(
    (item) => item[key as keyof PalletItem]
  )
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0
    );
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
};

const ALL_PORTS = uniqueValues("port_destination");
const VARIETIES = uniqueValues("variety");
const CALIBERS = uniqueValues("caliber_raw");

const INITIAL_FILTERS: FilterCriteria = {
  zone: "All",
  port: "",
  variety: "",
  caliber: "",
  etaFrom: "",
  etaTo: "",
  search: "",
  nextArrivalsOnly: false
};

type ColumnKey =
  | "booking_reference"
  | "shipment_id"
  | "container_code"
  | "port_destination"
  | "carrier_name"
  | "vessel_name"
  | "voyage_number"
  | "etd"
  | "eta"
  | "product"
  | "variety"
  | "caliber_raw"
  | "pack_format_raw"
  | "box_count"
  | "box_weight_kg"
  | "line_weight_kg"
  | "status"
  | "notes";

interface ColumnDefinition {
  key: ColumnKey;
  label: string;
  numeric?: boolean;
}

const COLUMNS: ColumnDefinition[] = [
  { key: "booking_reference", label: "Booking reference" },
  { key: "shipment_id", label: "Shipment ID" },
  { key: "container_code", label: "Container code" },
  { key: "port_destination", label: "Port" },
  { key: "carrier_name", label: "Carrier" },
  { key: "vessel_name", label: "Vessel" },
  { key: "voyage_number", label: "Voyage" },
  { key: "etd", label: "ETD" },
  { key: "eta", label: "ETA" },
  { key: "product", label: "Product" },
  { key: "variety", label: "Variety" },
  { key: "caliber_raw", label: "Caliber" },
  { key: "pack_format_raw", label: "Pack format" },
  { key: "box_count", label: "Boxes", numeric: true },
  { key: "box_weight_kg", label: "Box weight (kg)", numeric: true },
  { key: "line_weight_kg", label: "Line weight (kg)", numeric: true },
  { key: "status", label: "Status" },
  { key: "notes", label: "Notes" }
];

const dateToText = (date: Date) => {
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FORMATTER.format(date);
};

const getRowKey = (row: EnrichedRow) => row.stableKey;

const formatInteger = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US");
};

const formatWeight = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};

const escapeCsv = (value: string | number) => {
  const text = `${value ?? ""}`;
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export default function Page() {
  const [filters, setFilters] = useState<FilterCriteria>(INITIAL_FILTERS);
  const [sort, setSort] = useState<{ column: ColumnKey; direction: "asc" | "desc" } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const filteredRows = useMemo(
    () => applyFilters(SOURCE_DATA, filters, FIXED_NOW),
    [filters]
  );

  const visibleRows = useMemo(() => {
    if (!sort) return filteredRows;
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const aValue = getComparableValue(a, notes, sort.column);
      const bValue = getComparableValue(b, notes, sort.column);
      if (aValue === bValue) return 0;
      if (aValue > bValue) return sort.direction === "asc" ? 1 : -1;
      return sort.direction === "asc" ? -1 : 1;
    });
    return sorted;
  }, [filteredRows, sort, notes]);

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
      shipments: shipments.size
    };
  }, [visibleRows]);

  const portOptions: string[] =
    filters.zone === "All"
      ? ALL_PORTS
      : Array.from(ZONES[filters.zone]);

  const handleFilterChange = <K extends keyof FilterCriteria>(
    key: K,
    value: FilterCriteria[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleZoneChange = (rawValue: string) => {
    const value: ZoneKey = (rawValue || "All") as ZoneKey;
    setFilters((prev) => {
      const allowedPorts =
        value === "All"
          ? null
          : (ZONES[value] as readonly string[]).map((port) => port as string);
      const nextPort =
        allowedPorts && prev.port && !allowedPorts.includes(prev.port)
          ? ""
          : prev.port;
      return { ...prev, zone: value, port: nextPort };
    });
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

  const handleNotesChange = (row: EnrichedRow, value: string) => {
    const key = getRowKey(row);
    setNotes((prev) => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => {
    setFilters(INITIAL_FILTERS);
    setSort(null);
  };

  const handleExportCsv = () => {
    if (!visibleRows.length) return;
    const header = COLUMNS.map((col) => col.label);
    const rows = visibleRows.map((row) => {
      const status = computeStatus(row, FIXED_NOW);
      const rowKey = getRowKey(row);
      const noteValue = notes[rowKey] ?? "";

      return [
        row.booking_reference,
        row.shipment_id,
        row.container_code,
        row.port_destination,
        row.carrier_name,
        row.vessel_name,
        row.voyage_number,
        row.etd,
        row.eta,
        row.product,
        row.variety,
        row.caliber_raw,
        row.pack_format_raw,
        row.box_count,
        row.box_weight_kg,
        row.line_weight_kg,
        status,
        noteValue
      ].map(escapeCsv);
    });

    const csvContent = [header.map(escapeCsv).join(","), ...rows.map((row) => row.join(","))].join("\n");
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
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Dataset loaded: <span className="font-semibold text-slate-900">{SOURCE_DATA.length}</span>{" "}
          lines · {nowLabel}
        </p>
        <button
          type="button"
          onClick={() =>
            handleFilterChange("nextArrivalsOnly", !filters.nextArrivalsOnly)
          }
          className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-medium transition ${
            filters.nextArrivalsOnly
              ? "bg-emerald-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Next arrivals ≤7d
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Filters</h2>
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            Clear all
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SelectControl
            label="Zone"
            value={filters.zone}
            onChange={handleZoneChange}
            options={zoneOptions}
            placeholder="All zones"
          />
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
          <SearchControl
            label="Full-text search"
            value={filters.search}
            onChange={(value) => handleFilterChange("search", value)}
            placeholder="Booking, shipment, container, vessel, voyage"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Shipments</h2>
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
        </div>

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
                const noteValue = notes[rowKey] ?? "";
                return (
                  <tr
                    key={rowKey}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.booking_reference}
                    </td>
                    <td className="px-4 py-3">{row.shipment_id}</td>
                    <td className="px-4 py-3">{row.container_code}</td>
                    <td className="px-4 py-3">{row.port_destination}</td>
                    <td className="px-4 py-3">{row.carrier_name}</td>
                    <td className="px-4 py-3">{row.vessel_name}</td>
                    <td className="px-4 py-3">{row.voyage_number}</td>
                    <td className="px-4 py-3">{dateToText(row.etdDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{dateToText(row.etaDate)}</span>
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
                    <td className="px-4 py-3 capitalize">{row.product}</td>
                    <td className="px-4 py-3 uppercase">{row.variety}</td>
                    <td className="px-4 py-3 uppercase">{row.caliber_raw}</td>
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
                      <input
                        type="text"
                        value={noteValue}
                        onChange={(event) =>
                          handleNotesChange(row, event.target.value)
                        }
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder="Add note"
                      />
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
      </section>
    </main>
  );
}

const SortIndicator = ({
  column,
  sort
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
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) => (
  <label className="text-sm text-slate-600">
    <span className="mb-1 block font-medium text-slate-700">{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

const DateControl = ({
  label,
  value,
  onChange
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

const SearchControl = ({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <label className="text-sm text-slate-600 md:col-span-2 lg:col-span-3">
    <span className="mb-1 block font-medium text-slate-700">{label}</span>
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  </label>
);

const getComparableValue = (
  row: EnrichedRow,
  notes: Record<string, string>,
  column: ColumnKey
) => {
  switch (column) {
    case "etd":
      return row.etdDate.getTime();
    case "eta":
      return row.etaDate.getTime();
    case "box_count":
    case "box_weight_kg":
    case "line_weight_kg":
      return row[column] ?? 0;
    case "status":
      return computeStatus(row, FIXED_NOW);
    case "notes":
      return (notes[row.stableKey] ?? "").toLowerCase();
    default: {
      const value = row[column as keyof PalletItem];
      if (typeof value === "number") return value;
      return (value ?? "").toString().toLowerCase();
    }
  }
};
