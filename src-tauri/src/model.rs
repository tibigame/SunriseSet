use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub type AppResult<T> = Result<T, String>;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Localized {
    pub ja: String,
    pub en: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Region {
    pub code: String,
    pub ja: String,
    pub en: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct City {
    pub id: String,
    pub name: Localized,
    pub country_region: Region,
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: String,
    #[serde(default)]
    pub geographic_region: Option<GeographicRegion>,
    pub representative_point: Option<Localized>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GeographicRegion {
    Asia,
    Europe,
    Atlantic,
    NorthAmerica,
    SouthAmerica,
    Africa,
    Oceania,
}

#[derive(Deserialize)]
pub struct Catalog {
    pub schema_version: u32,
    pub cities: Vec<City>,
}

impl Catalog {
    pub fn validate(self) -> AppResult<Vec<City>> {
        if self.schema_version != 1 {
            return Err("Unsupported cities.json schema_version (expected 1)".into());
        }
        if self.cities.len() > 1000 {
            return Err("cities.json: maximum 1000 cities".into());
        }
        let mut ids = HashSet::new();
        for city in &self.cities {
            if city.id.is_empty()
                || !city
                    .id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
                || !ids.insert(&city.id)
            {
                return Err(format!("Invalid or duplicate city ID: {}", city.id));
            }
            if !city.latitude.is_finite()
                || !(-90.0..=90.0).contains(&city.latitude)
                || !city.longitude.is_finite()
                || !(-180.0..=180.0).contains(&city.longitude)
            {
                return Err(format!("Invalid coordinates: {}", city.id));
            }
            for name in [
                &city.name.ja,
                &city.name.en,
                &city.country_region.ja,
                &city.country_region.en,
            ] {
                if name.trim().is_empty() {
                    return Err(format!("Missing localized name: {}", city.id));
                }
            }
            if city.country_region.code.len() != 2
                || !city
                    .country_region
                    .code
                    .bytes()
                    .all(|b| b.is_ascii_uppercase())
            {
                return Err(format!("Invalid country/region code: {}", city.id));
            }
            city.timezone
                .parse::<Tz>()
                .map_err(|_| format!("Invalid timezone for {}: {}", city.id, city.timezone))?;
        }
        Ok(self.cities)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Language {
    Ja,
    En,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum YearChoice {
    ThisYear,
    NextYear,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SortOrder {
    North,
    South,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub schema_version: u32,
    pub language: Language,
    pub year: YearChoice,
    pub sort: SortOrder,
    pub visible_cities: Vec<String>,
}

impl Settings {
    pub fn initial(cities: &[City]) -> Self {
        let defaults = [
            "jp-tokyo",
            "jp-sapporo",
            "no-tromso",
            "gb-london",
            "us-new-york",
            "sg-singapore",
            "au-sydney",
            "ar-ushuaia",
        ];
        Self {
            schema_version: 1,
            language: Language::Ja,
            year: YearChoice::ThisYear,
            sort: SortOrder::North,
            visible_cities: cities
                .iter()
                .filter(|c| defaults.contains(&c.id.as_str()))
                .map(|c| c.id.clone())
                .collect(),
        }
    }

    pub fn validate(&self, cities: &[City]) -> AppResult<()> {
        if self.schema_version != 1 {
            return Err("Unsupported settings schema_version (expected 1)".into());
        }
        let known: HashSet<_> = cities.iter().map(|c| &c.id).collect();
        let mut seen = HashSet::new();
        for id in &self.visible_cities {
            if !known.contains(id) || !seen.insert(id) {
                return Err(format!("Unknown or duplicate city in settings: {id}"));
            }
        }
        Ok(())
    }
}
