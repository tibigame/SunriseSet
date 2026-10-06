import type { Language, EventKind } from "./types";

const ja = {
  regionFilter: "地域", world: "全世界", asia: "アジア", europe: "ヨーロッパ", atlantic: "大西洋", north_america: "北アメリカ", south_america: "南アメリカ", africa: "アフリカ", oceania: "オセアニア",
  detailedView: "詳細表示へ", normalView: "通常表示へ", city: "都市", country: "国・地域", latitude: "緯度", timezone: "タイムゾーン", maximumAltitude: "最高高度",
  subtitle: "世界の日の出と日の入り", settings: "設定", back: "一覧に戻る",
  date: "日付", today: "起動日の月日へ", previous: "前日", next: "翌日",
  north: "北から", south: "南から", cities: "都市", local: "各都市の現地時刻",
  rise: "日の出", set: "日の入り", details: "薄明の時刻", none: "なし",
  polar_day: "白夜", polar_night: "極夜", loading: "読み込み中…", calculating: "計算中…",
  retry: "再試行", empty: "表示する都市が選択されていません。", choose: "都市を選ぶ",
  language: "言語", year: "表示する年", thisYear: "今年", nextYear: "来年", order: "並び順",
  search: "都市・国・地域を検索", all: "すべて表示", clear: "すべて非表示",
  selected: "都市を表示", noMatch: "一致する都市がありません。",
  saving: "保存中…", saved: "保存済み", save: "保存する", unsaved: "未保存", saveError: "設定を保存できませんでした。",
  startupError: "データを読み込めませんでした。", startupHelp: "下記のファイルや書き込み権限を確認し、再試行してください。既存ファイルは上書きしていません。",
  calcError: "計算できませんでした。", night: "夜", twilight: "薄明", day: "昼",
  footnote: "標準的な地平線での計算値です。地形・標高・天候による違いは含みません。",
  storage: "データと設定", storageHint: "このフォルダーの cities.json を編集すると、次回起動時に反映されます。「保存する」を押すと設定を settings.toml に保存します。",
  baseline: "起動時の基準日", tzdb: "タイムゾーンデータ", dst: "時刻変更日：実際の経過時間で表示",
  offline: "オフライン計算", expand: "薄明の時刻を表示", collapse: "薄明の時刻を閉じる",
  allDetails: "薄明の時刻をすべて表示", noDesktop: "デスクトップアプリから起動してください。",
};
const en: typeof ja = {
  regionFilter: "Region", world: "Worldwide", asia: "Asia", europe: "Europe", atlantic: "Atlantic", north_america: "North America", south_america: "South America", africa: "Africa", oceania: "Oceania",
  detailedView: "Detailed view", normalView: "Normal view", city: "City", country: "Country / region", latitude: "Latitude", timezone: "Time zone", maximumAltitude: "Maximum altitude",
  subtitle: "Sunrise and sunset around the world", settings: "Settings", back: "Back to overview",
  date: "Date", today: "Startup month & day", previous: "Previous day", next: "Next day",
  north: "North first", south: "South first", cities: "Cities", local: "Local time in each city",
  rise: "Sunrise", set: "Sunset", details: "Twilight times", none: "None",
  polar_day: "Polar day", polar_night: "Polar night", loading: "Loading…", calculating: "Calculating…",
  retry: "Retry", empty: "No cities selected.", choose: "Choose cities",
  language: "Language", year: "Display year", thisYear: "This year", nextYear: "Next year", order: "Sort order",
  search: "Search cities, countries or regions", all: "Show all", clear: "Hide all",
  selected: "cities selected", noMatch: "No matching cities.",
  saving: "Saving…", saved: "Saved", save: "Save changes", unsaved: "Unsaved", saveError: "Could not save settings.",
  startupError: "Could not load your data.", startupHelp: "Check the file or write permissions below, then retry. Existing files have not been overwritten.",
  calcError: "Calculation failed.", night: "Night", twilight: "Twilight", day: "Day",
  footnote: "Calculated for a standard horizon. Terrain, elevation and weather are not included.",
  storage: "Data & settings", storageHint: "Edit cities.json in this folder and restart to apply changes. Select Save changes to write settings.toml.",
  baseline: "Startup date", tzdb: "Time zone database", dst: "Clock change: shown in elapsed time",
  offline: "Calculated offline", expand: "Show twilight times", collapse: "Hide twilight times",
  allDetails: "Show all twilight times", noDesktop: "Please launch the desktop application.",
};
export function strings(language: Language) { return language === "ja" ? ja : en; }
const eventNames: Record<EventKind, [string, string]> = {
  astronomical_dawn: ["天文薄明 開始", "Astronomical dawn"],
  nautical_dawn: ["航海薄明 開始", "Nautical dawn"],
  civil_dawn: ["市民薄明 開始", "Civil dawn"],
  sunrise: ["日の出", "Sunrise"], sunset: ["日の入り", "Sunset"],
  civil_dusk: ["市民薄明 終了", "Civil dusk"],
  nautical_dusk: ["航海薄明 終了", "Nautical dusk"],
  astronomical_dusk: ["天文薄明 終了", "Astronomical dusk"],
};
export function eventName(kind: EventKind, language: Language) {
  return eventNames[kind][language === "ja" ? 0 : 1];
}
