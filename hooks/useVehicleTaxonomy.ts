import { useEffect, useState } from "react";
import { vehicleApi } from "@/lib/api";
import { createLogger } from "@/lib/logger";

const log = createLogger("vehicles");

// Offline fallback for the make list. The API is the source of truth; this only
// keeps the picker usable with no connection.
export const FALLBACK_MAKES = [
  "Toyota", "Nissan", "Honda", "Mercedes-Benz", "BMW", "Hyundai", "Kia", "Ford", "Mitsubishi", "Volkswagen",
  "Suzuki", "Isuzu", "Mazda", "Subaru", "Land Rover", "Lexus", "Peugeot", "Renault", "Chevrolet", "Jeep",
  "Opel", "Fiat", "Volvo", "Audi", "Skoda", "Citroën", "Daewoo", "Daihatsu", "Infiniti", "Acura",
];

let makesCache: string[] | null = null;
const modelsCache = new Map<string, string[]>();

/**
 * Makes from the vehicle taxonomy, optionally narrowed to the vendor's brands.
 * Cached for the app session; falls back to a static list when offline.
 */
export function useMakes(restrictTo?: string[]) {
  const [makes, setMakes] = useState<string[]>(makesCache ?? []);
  const [loading, setLoading] = useState(makesCache === null);

  useEffect(() => {
    let cancelled = false;
    const apply = (all: string[]) => {
      const wanted = (restrictTo ?? []).filter((b) => b !== "ALL");
      const list = wanted.length > 0
        ? all.filter((m) => wanted.some((b) => b.toLowerCase() === m.toLowerCase()))
        : all;
      if (!cancelled) setMakes(list);
    };

    if (makesCache) {
      apply(makesCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    vehicleApi.getMakes()
      .then((res) => {
        makesCache = res.makes;
        apply(res.makes);
      })
      .catch((err) => {
        log.warn("getMakes failed — using fallback", err);
        apply(FALLBACK_MAKES);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restrictTo?.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return { makes, loading };
}

export function useModels(make: string) {
  const [models, setModels] = useState<string[]>(() => modelsCache.get(make) ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!make) { setModels([]); return; }
    const cached = modelsCache.get(make);
    if (cached) { setModels(cached); return; }
    setLoading(true);
    vehicleApi.getModels(make)
      .then((res) => {
        modelsCache.set(make, res.models);
        if (!cancelled) setModels(res.models);
      })
      .catch((err) => {
        log.warn("getModels failed", err, { make });
        if (!cancelled) setModels([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [make]);

  return { models, loading };
}

export function useVariants(make: string, model: string, year: string, enabled = true) {
  const [variants, setVariants] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !make || !model || !year) { setVariants([]); return; }
    setLoading(true);
    vehicleApi.getVariants(make, model, year)
      .then((res) => { if (!cancelled) setVariants(res.variants); })
      .catch((err) => {
        log.warn("getVariants failed", err, { make, model, year });
        if (!cancelled) setVariants([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, make, model, year]);

  return { variants, loading };
}

const CURRENT_YEAR = new Date().getFullYear();
export const YEARS = Array.from({ length: CURRENT_YEAR + 1 - 1980 + 1 }, (_, i) => String(CURRENT_YEAR + 1 - i));
