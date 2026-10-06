import { useMemo, useState } from "preact/hooks";
import { eventKinds } from "./types";
import type { City, CityResult, Language, SolarDay, SolarEvent } from "./types";
import { eventName, strings } from "./i18n";

// Color follows solar altitude even when no twilight threshold is crossed.
const palette = [
  { altitude: -18, rgb: [48, 36, 73] }, { altitude: -12, rgb: [83, 65, 110] },
  { altitude: -6, rgb: [132, 103, 137] }, { altitude: -0.8333, rgb: [221, 135, 49] },
  { altitude: 15, rgb: [249, 195, 76] }, { altitude: 45, rgb: [255, 220, 113] },
];
function color(height: number): string {
  let rgb = palette[0].rgb;
  for (let i = 1; i < palette.length; i++) {
    const left = palette[i - 1], right = palette[i];
    if (height >= right.altitude) { rgb = right.rgb; continue; }
    if (height > left.altitude) {
      const amount = (height - left.altitude) / (right.altitude - left.altitude);
      rgb = left.rgb.map((value, index) => Math.round(value + (right.rgb[index] - value) * amount));
    }
    break;
  }
  return `rgb(${rgb.join(",")})`;
}
function EventTime({ events, missing }: { events: SolarEvent[]; missing: string }) {
  return <>{events.length ? events.map((e, i) => <span key={e.timestamp} title={`UTC${e.offset}`}>
    {i > 0 ? " / " : ""}{e.time}
  </span>) : <span class="missing">{missing}</span>}</>;
}
function DayBar({ day, language }: { day: SolarDay; language: Language }) {
  const gradient = useMemo(() => `linear-gradient(to right, ${day.samples.map(s => `${color(s.altitude)} ${(s.position * 100).toFixed(4)}%`).join(",")})`, [day]);
  return <div class="bar-wrap">
    <div class="day-bar" style={{ background: gradient }} aria-label={strings(language).local}>
      {day.events.map(e => <span key={`${e.kind}-${e.timestamp}`} class={`event-mark ${e.kind === "sunrise" || e.kind === "sunset" ? "sun-mark" : ""}`}
        style={{ left: `${e.position * 100}%` }} title={`${eventName(e.kind, language)} ${e.time} (UTC${e.offset})`} />)}
    </div>
    <div class="bar-ticks">{day.ticks.map((tick, i) => <span key={i} title={`UTC${tick.offset}`} style={{ left: `${tick.position * 100}%` }}>{tick.time}</span>)}</div>
  </div>;
}
export function CityRow({ city, result, language, allDetails }: { city: City; result?: CityResult; language: Language; allDetails: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const t = strings(language), day = result?.day;
  const open = allDetails || expanded;
  return <article class="city-card">
    <div class="city-main">
      <div class="city-name">
        <h2>{city.name[language]}</h2>
        <span>{city.country_region[language]}</span>
        <small>{Math.abs(city.latitude).toFixed(2)}°{city.latitude >= 0 ? "N" : "S"}
          {day && day.status !== "normal" && <b class="polar-badge">{t[day.status]}</b>}
        </small>
      </div>
      {day ? <>
        <div class="timeline"><DayBar day={day} language={language} />
          {day.hours !== 24 && <small class="dst-note">{t.dst} · {day.hours}h</small>}
        </div>
        <div class="sun-times">
          <div><span class="time-label">↗ {t.rise}</span><strong><EventTime events={day.events.filter(e => e.kind === "sunrise")} missing={t.none} /></strong></div>
          <div><span class="time-label">↘ {t.set}</span><strong><EventTime events={day.events.filter(e => e.kind === "sunset")} missing={t.none} /></strong></div>
        </div>
        <button class="expand-button" disabled={allDetails} aria-label={open ? t.collapse : t.expand}
          aria-expanded={open} onClick={() => setExpanded(!expanded)}>{open ? "−" : "+"}</button>
      </> : <p class={result?.error ? "row-error" : "row-loading"}>{result?.error ? `${t.calcError} ${result.error}` : t.calculating}</p>}
    </div>
    {day && open && <div class="city-details">
      <div class="detail-caption">{t.details}<span>{city.timezone}{city.representative_point && ` · ${city.representative_point[language]}`}</span></div>
      <div class="event-grid">{eventKinds.map(kind => <div key={kind} class={kind === "sunrise" || kind === "sunset" ? "sun-event" : ""}>
        <span>{eventName(kind, language)}</span>
        <strong><EventTime events={day.events.filter(e => e.kind === kind)} missing={t.none} /></strong>
        {day.events.filter(e => e.kind === kind).map(e => <small key={e.timestamp}>UTC{e.offset}</small>)}
      </div>)}</div>
    </div>}
  </article>;
}
