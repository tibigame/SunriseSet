import { useEffect, useRef, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import type { Bootstrap, CityResult, Settings } from "./types";
import { atYear, dateAt, dayIndex, formatDate, yearLength } from "./dates";
import { strings } from "./i18n";
import { CityRow } from "./CityRow";
import { CityTable } from "./CityTable";
import { SettingsPage } from "./SettingsPage";
import "./App.css";

function sameSettings(left: Settings, right: Settings) {
  return left.schema_version === right.schema_version
    && left.language === right.language
    && left.year === right.year
    && left.sort === right.sort
    && [...left.visible_cities].sort().join("\0") === [...right.visible_cities].sort().join("\0");
}

function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);
  const [date, setDate] = useState("");
  const [page, setPage] = useState<"main" | "settings">("main");
  const [startupError, setStartupError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [retry, setRetry] = useState(0);
  const [allDetails, setAllDetails] = useState(false);
  const [tableView, setTableView] = useState(false);
  const [results, setResults] = useState<{ key: string; rows: CityResult[] } | null>(null);
  const saveInProgress = useRef(false);
  const t = strings(settings?.language ?? "ja");
  const cityKey = JSON.stringify([...(settings?.visible_cities ?? [])].sort());
  const resultKey = `${date}:${cityKey}`;

  async function load() {
    setStartupError("");
    try {
      const initial = await invoke<Bootstrap>("bootstrap");
      setData(initial);
      setSettings(initial.settings);
      setSavedSettings(initial.settings);
      const year = Number(initial.today.slice(0, 4)) + (initial.settings.year === "next_year" ? 1 : 0);
      setDate(atYear(initial.today, year));
    } catch (error) {
      setStartupError(String(error));
    }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { document.documentElement.lang = settings?.language ?? "ja"; }, [settings?.language]);

  useEffect(() => {
    if (!date) return;
    let active = true;
    setCalcError("");
    // Coalesce slider input. Results from an obsolete request are never displayed.
    const timer = setTimeout(() => {
      invoke<CityResult[]>("calculate_days", { date, cityIds: JSON.parse(cityKey) })
        .then(rows => { if (active) setResults({ key: resultKey, rows }); })
        .catch(error => { if (active) setCalcError(String(error)); });
    }, 100);
    return () => { active = false; clearTimeout(timer); };
  }, [resultKey, retry]);

  function change(next: Settings) {
    if (!data) return;
    if (next.year !== settings?.year) {
      const year = Number(data.today.slice(0, 4)) + (next.year === "next_year" ? 1 : 0);
      setDate(atYear(date, year));
    }
    setSettings(next);
    setSaveError("");
  }

  async function saveSettings() {
    if (!settings || saveInProgress.current) return;
    const snapshot = settings;
    saveInProgress.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await invoke<void>("save_settings", { settings: snapshot });
      setSavedSettings(snapshot);
    } catch (error) {
      setSaveError(String(error));
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  if (!data || !settings) return <main class="startup panel"><img class="brand-symbol" src="/app-icon.svg" alt="" /><h1>SunriseSet</h1>
    {startupError ? <div role="alert"><h2>{t.startupError}</h2><p>{t.startupHelp}</p><pre>{startupError}</pre>
      <button onClick={() => void load()}>{t.retry}</button></div> : <p role="status">{t.loading}</p>}
  </main>;

  const year = Number(date.slice(0, 4)), index = dayIndex(date), days = yearLength(year);
  const rows = results?.key === resultKey ? results.rows : [];
  const byCity = new Map(rows.map(row => [row.city_id, row]));
  const selected = new Set(settings.visible_cities);
  const cities = data.cities.filter(city => selected.has(city.id)).sort((a, b) =>
    (settings.sort === "north" ? b.latitude - a.latitude : a.latitude - b.latitude) || a.id.localeCompare(b.id));
  const busy = results?.key !== resultKey && !calcError && cities.length > 0;
  const dirty = savedSettings !== null && !sameSettings(settings, savedSettings);

  return <main class="app-shell">
    <header class="app-header">
      <div class="brand"><img class="brand-symbol" src="/app-icon.svg" alt="" /><div><h1>SunriseSet</h1><p>{t.subtitle}</p></div></div>
      <div class="header-actions">{page === "settings"
        ? <button class="primary save-button" disabled={!dirty || saving} onClick={() => void saveSettings()}>{saving ? t.saving : dirty ? t.save : t.saved}</button>
        : <span class="save-status" role="status">{saving ? t.saving : dirty ? t.unsaved : saveError ? "" : t.saved}</span>}
        <button class={page === "settings" ? "primary" : ""} onClick={() => setPage(page === "main" ? "settings" : "main")}>
          {page === "main" ? `⚙ ${t.settings}` : `← ${t.back}`}</button></div>
    </header>
    {saveError && <div class="error-banner" role="alert"><div>{t.saveError}<pre>{saveError}</pre></div><button onClick={() => void saveSettings()}>{t.retry}</button></div>}
    {page === "settings" ? <SettingsPage data={data} settings={settings} change={change} /> : <>
      <section class="date-panel panel">
        <div class="date-top"><div><h2>{formatDate(date, settings.language)}</h2></div>
          <div class="date-actions"><button class="quiet" onClick={() => setDate(atYear(data.today, year))}>{t.today}</button>
            <button class="square" aria-label={t.previous} disabled={index === 0} onClick={() => setDate(dateAt(year, index - 1))}>←</button>
            <button class="square" aria-label={t.next} disabled={index === days - 1} onClick={() => setDate(dateAt(year, index + 1))}>→</button></div></div>
        <input class="date-slider" type="range" min={0} max={days - 1} step={1} value={index} aria-label={t.date}
          aria-valuetext={formatDate(date, settings.language)} onInput={e => setDate(dateAt(year, Number(e.currentTarget.value)))} />
        <div class="month-labels">{Array.from({ length: 12 }, (_, month) => <button key={month} class={Number(date.slice(5, 7)) === month + 1 ? "active" : ""}
          onClick={() => setDate(`${year}-${String(month + 1).padStart(2, "0")}-01`)}>
          {settings.language === "ja" ? `${month + 1}月` : new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month, 1)))}</button>)}</div>
      </section>
      <div class="list-toolbar"><div><h2>{t.cities} <span>{cities.length}</span></h2></div>
        <div class="list-options">{!tableView && <label class="details-toggle"><input type="checkbox" checked={allDetails} onChange={e => setAllDetails(e.currentTarget.checked)} />{t.allDetails}</label>}
          <button onClick={() => change({ ...settings, sort: settings.sort === "north" ? "south" : "north" })}>{settings.sort === "north" ? `↓ ${t.north}` : `↑ ${t.south}`}</button>
          <button aria-pressed={tableView} onClick={() => setTableView(!tableView)}>{tableView ? t.normalView : t.detailedView}</button></div></div>
      {calcError && <div class="error-banner" role="alert"><div>{t.calcError}<pre>{calcError}</pre></div><button onClick={() => setRetry(retry + 1)}>{t.retry}</button></div>}
      <section class="city-list" aria-busy={busy}>
        {tableView && cities.length > 0 ? <CityTable cities={cities} results={byCity} language={settings.language} />
          : cities.map(city => <CityRow key={city.id} city={city} result={byCity.get(city.id)} language={settings.language} allDetails={allDetails} />)}
        {!cities.length && <div class="empty-state panel"><img class="brand-symbol" src="/app-icon.svg" alt="" /><p>{t.empty}</p><button class="primary" onClick={() => setPage("settings")}>{t.choose}</button></div>}
      </section>
      <footer>{t.footnote}</footer>
    </>}
  </main>;
}

export default App;
