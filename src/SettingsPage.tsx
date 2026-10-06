import { useState } from "preact/hooks";
import type { Bootstrap, Settings } from "./types";
import { geographicRegions } from "./types";
import type { GeographicRegion } from "./types";
import { cityRegion } from "./regions";
import { strings } from "./i18n";

export function SettingsPage({ data, settings, change }: { data: Bootstrap; settings: Settings; change: (s: Settings) => void }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<GeographicRegion | "all">("all");
  const t = strings(settings.language), year = Number(data.today.slice(0, 4));
  const visible = new Set(settings.visible_cities);
  const matches = data.cities.filter(c => (region === "all" || cityRegion(c) === region)
    && [c.name.ja, c.name.en, c.country_region.ja, c.country_region.en]
      .some(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  function toggle(id: string) {
    change({ ...settings, visible_cities: visible.has(id) ? settings.visible_cities.filter(v => v !== id) : [...settings.visible_cities, id] });
  }
  return <div class="settings-page">
    <div class="preferences panel">
      <label>{t.language}<select value={settings.language} onChange={e => change({ ...settings, language: e.currentTarget.value as Settings["language"] })}>
        <option value="ja">日本語</option><option value="en">English</option></select></label>
      <label>{t.year}<select value={settings.year} onChange={e => change({ ...settings, year: e.currentTarget.value as Settings["year"] })}>
        <option value="this_year">{t.thisYear} · {year}</option><option value="next_year">{t.nextYear} · {year + 1}</option></select></label>
      <label>{t.order}<select value={settings.sort} onChange={e => change({ ...settings, sort: e.currentTarget.value as Settings["sort"] })}>
        <option value="north">{t.north}</option><option value="south">{t.south}</option></select></label>
    </div>
    <section class="panel selection-panel">
      <div class="section-heading"><h2>{t.cities} <span>{visible.size} / {data.cities.length}</span></h2>
        <div class="button-group"><button onClick={() => change({ ...settings, visible_cities: data.cities.map(c => c.id) })}>{t.all}</button>
          <button onClick={() => change({ ...settings, visible_cities: [] })}>{t.clear}</button></div></div>
      <label class="region-filter">{t.regionFilter}<select value={region} onChange={e => setRegion(e.currentTarget.value as GeographicRegion | "all")}>
        <option value="all">{t.world}</option>
        {geographicRegions.map(value => <option key={value} value={value}>{t[value]}</option>)}
      </select></label>
      <input class="search" type="search" value={query} aria-label={t.search} placeholder={t.search} onInput={e => setQuery(e.currentTarget.value)} />
      <div class="city-picker">{matches.map(city => <label key={city.id} class={`city-option ${visible.has(city.id) ? "checked" : ""}`}>
        <input type="checkbox" checked={visible.has(city.id)} onChange={() => toggle(city.id)} />
        <span><strong>{city.name[settings.language]}</strong><small>{city.country_region[settings.language]}</small></span>
      </label>)}</div>
      {!matches.length && <p class="empty-search">{t.noMatch}</p>}
    </section>
    <section class="panel storage-panel"><h2>{t.storage}</h2><p>{t.storageHint}</p><code>{data.directory}</code>
      <div class="metadata"><span>{t.baseline}: {data.today}</span><span>{t.tzdb}: {data.tzdb_version}</span></div>
    </section>
  </div>;
}
