mod model;
mod solar;
mod storage;

#[cfg(test)]
mod tests;

use chrono::{Datelike, Local, NaiveDate};
use model::{AppResult, City, Settings};
use serde::Serialize;
use std::{path::PathBuf, sync::Mutex};

struct AppState {
    root: PathBuf,
    today: NaiveDate,
    cities: Mutex<Vec<City>>,
    storage_lock: Mutex<()>,
}

#[derive(Serialize)]
struct Bootstrap {
    today: NaiveDate,
    directory: String,
    tzdb_version: &'static str,
    cities: Vec<City>,
    settings: Settings,
}

#[tauri::command]
fn bootstrap(state: tauri::State<'_, AppState>) -> AppResult<Bootstrap> {
    let _guard = state.storage_lock.lock().map_err(|e| e.to_string())?;
    let cities = storage::load_cities(&state.root)?;
    let settings = storage::load_settings(&state.root, &cities)?;
    *state.cities.lock().map_err(|e| e.to_string())? = cities.clone();
    Ok(Bootstrap {
        today: state.today,
        directory: state.root.display().to_string(),
        tzdb_version: chrono_tz::IANA_TZDB_VERSION,
        cities,
        settings,
    })
}

#[tauri::command]
fn save_settings(settings: Settings, state: tauri::State<'_, AppState>) -> AppResult<()> {
    let _guard = state.storage_lock.lock().map_err(|e| e.to_string())?;
    let cities = state.cities.lock().map_err(|e| e.to_string())?;
    storage::save_settings(&state.root, &settings, &cities)
}

#[derive(Serialize)]
struct CityResult {
    city_id: String,
    day: Option<solar::SolarDay>,
    error: Option<String>,
}

#[tauri::command]
async fn calculate_days(
    date: String,
    city_ids: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<CityResult>> {
    let date = NaiveDate::parse_from_str(&date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    if date.year() != state.today.year() && date.year() != state.today.year() + 1 {
        return Err("Date must be in this year or next year".into());
    }
    let selected = {
        let catalog = state.cities.lock().map_err(|e| e.to_string())?;
        if city_ids.len() > catalog.len() {
            return Err("Too many requested cities".into());
        }
        let mut selected = Vec::new();
        for id in city_ids {
            let city = catalog
                .iter()
                .find(|c| c.id == id)
                .ok_or_else(|| format!("Unknown city: {id}"))?;
            selected.push(city.clone());
        }
        selected
    };
    tauri::async_runtime::spawn_blocking(move || {
        selected
            .iter()
            .map(|city| match solar::calculate(date, city) {
                Ok(day) => CityResult {
                    city_id: city.id.clone(),
                    day: Some(day),
                    error: None,
                },
                Err(error) => CityResult {
                    city_id: city.id.clone(),
                    day: None,
                    error: Some(error),
                },
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let state = AppState {
        root: std::env::current_dir()?,
        today: Local::now().date_naive(),
        cities: Mutex::new(Vec::new()),
        storage_lock: Mutex::new(()),
    };
    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            save_settings,
            calculate_days
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}
