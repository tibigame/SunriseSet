export type Language = "ja" | "en";
export type Localized = Record<Language, string>;
export const geographicRegions = ["asia", "europe", "atlantic", "north_america", "south_america", "africa", "oceania"] as const;
export type GeographicRegion = typeof geographicRegions[number];
export interface City {
  id: string;
  name: Localized;
  country_region: Localized & { code: string };
  latitude: number;
  longitude: number;
  timezone: string;
  geographic_region?: GeographicRegion | null;
  representative_point?: Localized | null;
}
export interface Settings {
  schema_version: number;
  language: Language;
  year: "this_year" | "next_year";
  sort: "north" | "south";
  visible_cities: string[];
}
export interface Bootstrap {
  today: string;
  directory: string;
  tzdb_version: string;
  cities: City[];
  settings: Settings;
}
export const eventKinds = ["astronomical_dawn", "nautical_dawn", "civil_dawn", "sunrise", "sunset", "civil_dusk", "nautical_dusk", "astronomical_dusk"] as const;
export type EventKind = typeof eventKinds[number];
export interface SolarEvent {
  kind: EventKind;
  time: string;
  offset: string;
  position: number;
  timestamp: number;
}
export interface SolarDay {
  city_id: string;
  status: "normal" | "polar_day" | "polar_night";
  hours: number;
  maximum_altitude: number;
  events: SolarEvent[];
  samples: { position: number; altitude: number }[];
  ticks: { position: number; time: string; offset: string }[];
}
export interface CityResult { city_id: string; day: SolarDay | null; error: string | null }
