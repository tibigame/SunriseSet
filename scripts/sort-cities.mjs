import { readFile, writeFile } from "node:fs/promises";

// 国順は首都の位置を基にした暫定順。細かな分類・順序はここで調整できる。
const orders = {
  asia: "JP KR KP TL TW PH CN BN HK MO MN ID VN KH SG LA MY TH MM BT BD NP LK IN KG MV PK KZ UZ TJ OM TM AE QA IR BH AZ KW SA GE AM IQ YE IL JO LB TR RU".split(" "),
  europe: "PT IE ES GB FR BE NL CH MC NO IT MT SJ DK CZ DE HR AT SE HU RS PL GR BG FI RO UA CY RU".split(" "),
  atlantic: ["IS", "PT-AZORES", "PT-MADEIRA", "ES-CANARY", "CV", "BR-NORONHA"],
  north_america: "US-ALASKA CA US MX GT BZ HN SV NI CR PA BS CU JM HT DO PR SX AG KN DM LC VC BB GD AW CW TT".split(" "),
  south_america: "CO VE GY SR GF EC PE BR BO PY CL UY AR FK".split(" "),
  africa: "TN DZ MA EG SN ET NG GH KE SC TZ MU RE MG ZW ZA".split(" "),
  oceania: ["AU", "NZ", "US-HAWAII", "MP", "GU", "WS", "AS", "PF", "FJ", "NC", "CL-EASTER"],
};

function classify(city) {
  const code = city.country_region.code;
  if (city.timezone === "Pacific/Honolulu") return ["oceania", "US-HAWAII"];
  if (city.timezone === "America/Anchorage") return ["north_america", "US-ALASKA"];
  if (city.timezone === "Pacific/Easter") return ["oceania", "CL-EASTER"];
  if (city.timezone === "Atlantic/Azores") return ["atlantic", "PT-AZORES"];
  if (city.timezone === "Atlantic/Madeira") return ["atlantic", "PT-MADEIRA"];
  if (city.timezone === "Atlantic/Canary") return ["atlantic", "ES-CANARY"];
  if (city.timezone === "America/Noronha") return ["atlantic", "BR-NORONHA"];
  if (["IS", "CV"].includes(code)) return ["atlantic", code];
  if (code === "RU") return [city.timezone.startsWith("Asia/") ? "asia" : "europe", code];
  for (const [region, codes] of Object.entries(orders)) {
    if (codes.includes(code)) return [region, code];
  }
  throw new Error(`No geographic classification for ${city.id} (${code})`);
}

for (const file of process.argv.slice(2)) {
  const catalog = JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  const keys = new Map();
  for (const city of catalog.cities) {
    const [region, group] = classify(city);
    city.geographic_region = region;
    keys.set(city.id, [Object.keys(orders).indexOf(region), orders[region].indexOf(group)]);
  }
  catalog.cities.sort((a, b) => {
    const left = keys.get(a.id), right = keys.get(b.id);
    return left[0] - right[0] || left[1] - right[1] || b.latitude - a.latitude || a.id.localeCompare(b.id);
  });
  // 各地点を読みやすいまとまりで出力し、座標・ID等の既存データは保持する。
  const entries = catalog.cities.map(city => {
    const lines = Object.entries(city).map(([key, value]) => `      ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
    return `    {\n${lines.join(",\n")}\n    }`;
  });
  const header = Object.entries(catalog).filter(([key]) => key !== "cities")
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(",\n");
  await writeFile(file, `{\n${header},\n  "cities": [\n${entries.join(",\n")}\n  ]\n}\n`, "utf8");
  console.log(`${file}: ${catalog.cities.length} cities sorted`);
}
