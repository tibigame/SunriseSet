use crate::model::{AppResult, Catalog, City, Settings};
use std::{fs, io::Write, path::Path};

pub const BUNDLED_CITIES: &str = include_str!("../../cities.json");

fn file_error(path: &Path, error: impl std::fmt::Display) -> String {
    format!("{}: {error}", path.display())
}

fn read(path: &Path) -> AppResult<String> {
    fs::read_to_string(path)
        .map(|text| text.trim_start_matches('\u{feff}').to_owned())
        .map_err(|e| file_error(path, e))
}

// A synced temporary file in the same directory prevents partial TOML/JSON writes.
// persist_noclobber also protects files created concurrently by another instance.
fn write_file(path: &Path, contents: &str, replace: bool) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| file_error(path, "No parent directory"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| file_error(path, e))?;
    temporary
        .write_all(contents.as_bytes())
        .map_err(|e| file_error(path, e))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|e| file_error(path, e))?;
    let result = if replace {
        temporary.persist(path)
    } else {
        temporary.persist_noclobber(path)
    };
    match result {
        Ok(_) => Ok(()),
        Err(e) if !replace && e.error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(file_error(path, e)),
    }
}

pub fn load_cities(root: &Path) -> AppResult<Vec<City>> {
    let path = root.join("cities.json");
    if !path.try_exists().map_err(|e| file_error(&path, e))? {
        write_file(&path, BUNDLED_CITIES, false)?;
    }
    let catalog: Catalog = serde_json::from_str(&read(&path)?).map_err(|e| file_error(&path, e))?;
    catalog.validate().map_err(|e| file_error(&path, e))
}

pub fn load_settings(root: &Path, cities: &[City]) -> AppResult<Settings> {
    let path = root.join("settings.toml");
    if !path.try_exists().map_err(|e| file_error(&path, e))? {
        let initial =
            toml::to_string_pretty(&Settings::initial(cities)).map_err(|e| e.to_string())?;
        write_file(&path, &initial, false)?;
    }
    let settings: Settings = toml::from_str(&read(&path)?).map_err(|e| file_error(&path, e))?;
    settings
        .validate(cities)
        .map_err(|e| file_error(&path, e))?;
    Ok(settings)
}

pub fn save_settings(root: &Path, settings: &Settings, cities: &[City]) -> AppResult<()> {
    settings.validate(cities)?;
    let contents = toml::to_string_pretty(settings).map_err(|e| e.to_string())?;
    write_file(&root.join("settings.toml"), &contents, true)
}
