import { PalletRow, Status } from "@/types";

export const FIXED_NOW_ISO = "2025-11-09T00:00:00Z";

export interface FilterCriteria {
  ports: string[];
  varieties: string[];
  calibers: string[];
  packFormats: string[];
  nextArrivalsOnly: boolean;
}

export const applyFilters = <T extends PalletRow>(
  items: T[],
  criteria: FilterCriteria,
  now: Date
): T[] => {
  const windowEnd = new Date(now);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

  return items.filter((item) => {
    if (
      criteria.ports.length &&
      !criteria.ports.includes(item.port_destination)
    )
      return false;
    if (
      criteria.packFormats.length &&
      !criteria.packFormats.includes(item.pack_format_raw)
    )
      return false;
    if (
      criteria.varieties.length &&
      !criteria.varieties.includes(item.variety)
    )
      return false;
    if (
      criteria.calibers.length &&
      !criteria.calibers.includes(item.caliber_raw)
    )
      return false;
    if (criteria.nextArrivalsOnly) {
      if (!(item.etaDate > now && item.etaDate <= windowEnd)) return false;
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
