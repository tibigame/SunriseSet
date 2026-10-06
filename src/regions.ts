import type { City, GeographicRegion } from "./types";

// 地域指定のない旧形式のJSONにも対応する。明示された分類を常に優先する。
export function cityRegion(city: City): GeographicRegion {
  if (city.geographic_region) return city.geographic_region;
  if (city.timezone.startsWith("Pacific/")) return "oceania";
  if (city.timezone.startsWith("Asia/")) return "asia";
  if (city.timezone.startsWith("Europe/")) return "europe";
  if (city.timezone.startsWith("Africa/")) return "africa";
  if (["AR", "BO", "BR", "CL", "CO", "EC", "FK", "GF", "GY", "PE", "PY", "SR", "UY", "VE"].includes(city.country_region.code)) return "south_america";
  if (city.timezone.startsWith("America/")) return "north_america";
  if (city.timezone.startsWith("Atlantic/")) return "atlantic";
  return "oceania";
}
