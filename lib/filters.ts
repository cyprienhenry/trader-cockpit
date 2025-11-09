import { PalletRow, Status } from "@/types";

export const FIXED_NOW_ISO = "2025-11-09T00:00:00Z";

export const ZONES = {
  All: [],
  UK: ["London Gateway Port", "Felixstowe"],
  "North Europe": ["Rotterdam", "Antwerp"],
  Iberia: ["Valencia", "Algeciras"]
} as const;

export type ZoneKey = keyof typeof ZONES;

export interface FilterCriteria {
  zone: ZoneKey;
  port: string;
  variety: string;
  caliber: string;
  etaFrom: string;
  etaTo: string;
  search: string;
  nextArrivalsOnly: boolean;
}

const SEARCHABLE_FIELDS = [
  "booking_reference",
  "shipment_id",
  "container_code",
  "vessel_name",
  "voyage_number"
] as const;

export const zoneOptions = Object.keys(ZONES) as ZoneKey[];

const toDateOrNull = (value: string, isEnd?: boolean) => {
  if (!value) return null;
  const suffix = isEnd ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return new Date(`${value}${value.includes("T") ? "" : suffix}`);
};

export const applyFilters = <T extends PalletRow>(
  items: T[],
  criteria: FilterCriteria,
  now: Date
): T[] => {
  const zonePorts =
    criteria.zone === "All"
      ? null
      : new Set<string>(ZONES[criteria.zone]);
  const etaFromDate = toDateOrNull(criteria.etaFrom);
  const etaToDate = toDateOrNull(criteria.etaTo, true);
  const searchTerm = criteria.search?.trim().toLowerCase() ?? "";
  const windowEnd = new Date(now);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

  return items.filter((item) => {
    if (zonePorts && !zonePorts.has(item.port_destination)) return false;
    if (criteria.port && item.port_destination !== criteria.port) return false;
    if (criteria.variety && item.variety !== criteria.variety) return false;
    if (criteria.caliber && item.caliber_raw !== criteria.caliber) return false;
    if (etaFromDate && item.etaDate < etaFromDate) return false;
    if (etaToDate && item.etaDate > etaToDate) return false;
    if (criteria.nextArrivalsOnly) {
      if (!(item.etaDate > now && item.etaDate <= windowEnd)) return false;
    }
    if (searchTerm) {
      const matches = SEARCHABLE_FIELDS.some((field) => {
        const value = item[field];
        return (
          typeof value === "string" &&
          value.toLowerCase().includes(searchTerm)
        );
      });
      if (!matches) return false;
    }
    return true;
  });
};

export const computeStatus = (item: PalletRow, now: Date): Status => {
  const etaTime = item.etaDate.getTime();
  const etdTime = item.etdDate.getTime();
  const nowTime = now.getTime();

  if (etaTime < nowTime) return "Arrived";
  if (etdTime <= nowTime && nowTime <= etaTime) return "At sea";
  return "Scheduled";
};

export const isEtaWithinSevenDays = (etaDate: Date, now: Date) => {
  const diff = etaDate.getTime() - now.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return diff > 0 && diff <= sevenDaysMs;
};

export const hasEtaPassed = (etaDate: Date, now: Date) =>
  etaDate.getTime() < now.getTime();
