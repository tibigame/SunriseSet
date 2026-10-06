import { eventKinds } from "./types";
import type { City, CityResult, Language } from "./types";
import { eventName, strings } from "./i18n";

export function CityTable({ cities, results, language }: { cities: City[]; results: Map<string, CityResult>; language: Language }) {
  const t = strings(language);
  return <div class="table-scroll panel" tabIndex={0} aria-label={t.detailedView}>
    <table class="city-table">
      <caption>{t.local}</caption>
      <thead><tr>
        {[t.city, t.country, t.latitude, t.timezone, ...eventKinds.map(kind => eventName(kind, language)), t.maximumAltitude]
          .map(label => <th key={label} scope="col">{label}</th>)}
      </tr></thead>
      <tbody>{cities.map(city => {
        const result = results.get(city.id), day = result?.day;
        return <tr key={city.id}>
          <th scope="row">{city.name[language]}{day && day.status !== "normal" && <span class="table-polar polar-badge">{t[day.status]}</span>}</th>
          <td>{city.country_region[language]}</td>
          <td class="numeric">{Math.abs(city.latitude).toFixed(2)}°{city.latitude >= 0 ? "N" : "S"}</td>
          <td>{city.timezone}</td>
          {day ? <>
            {eventKinds.map(kind => <td class="numeric" key={kind}>{day.events.some(event => event.kind === kind)
              ? day.events.filter(event => event.kind === kind).map((event, index) => <span key={event.timestamp} title={`UTC${event.offset}`}>
                {index > 0 ? " / " : ""}{event.time}<small>UTC{event.offset}</small>
              </span>) : <span class="missing">{t.none}</span>}</td>)}
            <td class="numeric altitude-value" title={t.maximumAltitude}>{day.maximum_altitude.toFixed(2)}°</td>
          </> : <td colSpan={9} class={result?.error ? "table-error" : "table-loading"}>
            {result?.error ? `${t.calcError} ${result.error}` : t.calculating}
          </td>}
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
