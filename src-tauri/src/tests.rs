use crate::{
    model::{Catalog, Settings, SortOrder},
    solar, storage,
};
use chrono::{Datelike, NaiveDate, TimeZone};
use std::{error::Error, fs};

type TestResult = Result<(), Box<dyn Error>>;

fn catalog() -> Result<Vec<crate::model::City>, Box<dyn Error>> {
    Ok(serde_json::from_str::<Catalog>(storage::BUNDLED_CITIES)?.validate()?)
}
fn city(id: &str) -> Result<crate::model::City, Box<dyn Error>> {
    catalog()?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| format!("Missing {id}").into())
}
fn date(value: &str) -> Result<NaiveDate, chrono::ParseError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
}

#[test]
fn maximum_altitude_tracks_seasons_and_polar_night() -> TestResult {
    let tokyo = city("jp-tokyo")?;
    let summer = solar::calculate(date("2026-06-21")?, &tokyo)?;
    let winter = solar::calculate(date("2026-12-21")?, &tokyo)?;
    assert!((summer.maximum_altitude - 77.76).abs() < 0.2);
    assert!((winter.maximum_altitude - 30.88).abs() < 0.2);
    let polar = solar::calculate(date("2026-12-21")?, &city("no-tromso")?)?;
    assert!(polar.maximum_altitude < 0.0);
    Ok(())
}

#[test]
fn bundled_catalog_is_valid_and_complete() -> TestResult {
    assert_eq!(catalog()?.len(), 266);
    Ok(())
}

#[test]
fn invalid_city_data_is_rejected() -> TestResult {
    for corruption in 0..5 {
        let mut data: Catalog = serde_json::from_str(storage::BUNDLED_CITIES)?;
        match corruption {
            0 => data.cities[1].id = data.cities[0].id.clone(),
            1 => data.cities[0].latitude = 91.0,
            2 => data.cities[0].longitude = f64::NAN,
            3 => data.cities[0].timezone = "Not/AZone".into(),
            _ => data.cities[0].name.ja = " ".into(),
        }
        assert!(data.validate().is_err());
    }
    Ok(())
}

#[test]
fn tokyo_matches_independent_usno_reference_within_two_minutes() -> TestResult {
    // USNO API v4.0.1, retrieved 2026-10-03:
    // https://aa.usno.navy.mil/api/rstt/oneday?date=2026-06-21&coords=35.682,139.759&tz=9
    // These are reference observations of the API output, not this algorithm's output.
    let day = solar::calculate(date("2026-06-21")?, &city("jp-tokyo")?)?;
    for (kind, expected) in [
        ("civil_dawn", 235),
        ("sunrise", 265),
        ("sunset", 1140),
        ("civil_dusk", 1170),
    ] {
        let event = day
            .events
            .iter()
            .find(|e| e.kind == kind)
            .ok_or("Missing event")?;
        let parts: Vec<i32> = event
            .time
            .split(':')
            .map(str::parse)
            .collect::<Result<_, _>>()?;
        assert!(
            (parts[0] * 60 + parts[1] - expected).abs() <= 2,
            "{kind}: {}",
            event.time
        );
        assert_eq!(event.offset, "+09:00");
    }
    assert_eq!(day.events.len(), 8);
    assert_eq!(day.status, "normal");
    Ok(())
}

#[test]
fn dst_changes_local_day_length_and_event_offsets() -> TestResult {
    let ny = city("us-new-york")?;
    for (value, hours, offset) in [
        ("2026-03-08", 23.0, "-04:00"),
        ("2026-11-01", 25.0, "-05:00"),
    ] {
        let day = solar::calculate(date(value)?, &ny)?;
        assert_eq!(day.hours, hours);
        assert!(day.events.iter().all(|event| event.offset == offset));
        assert_ne!(day.ticks[0].offset, day.ticks[4].offset);
    }
    Ok(())
}

#[test]
fn polar_night_can_have_twilight_and_polar_day_has_no_sunrise() -> TestResult {
    let tromso = city("no-tromso")?;
    let summer = solar::calculate(date("2026-06-21")?, &tromso)?;
    assert_eq!(summer.status, "polar_day");
    assert!(summer.events.is_empty());
    let winter = solar::calculate(date("2026-12-21")?, &tromso)?;
    assert_eq!(winter.status, "polar_night");
    assert!(!winter
        .events
        .iter()
        .any(|e| e.kind == "sunrise" || e.kind == "sunset"));
    assert!(winter.events.iter().any(|e| e.kind == "civil_dawn"));
    assert!(winter.samples.iter().any(|s| s.altitude > -6.0));
    Ok(())
}

#[test]
fn polar_transition_preserves_single_events() -> TestResult {
    let tromso = city("no-tromso")?;
    let mut found = false;
    for ordinal in 1..=365 {
        let target = NaiveDate::from_yo_opt(2026, ordinal).ok_or("Invalid ordinal")?;
        let day = solar::calculate(target, &tromso)?;
        let count = day
            .events
            .iter()
            .filter(|e| e.kind == "sunrise" || e.kind == "sunset")
            .count();
        if count == 1 {
            assert_eq!(day.status, "normal");
            found = true;
        }
    }
    assert!(found, "Expected at least one single-event polar transition");
    Ok(())
}

#[test]
fn fractional_offset_and_date_line_keep_events_on_requested_local_date() -> TestResult {
    for id in ["np-kathmandu", "fj-suva", "us-honolulu", "nz-auckland"] {
        let city = city(id)?;
        let tz: chrono_tz::Tz = city.timezone.parse()?;
        for value in ["2026-01-01", "2026-12-31", "2028-02-29"] {
            let target = date(value)?;
            let day = solar::calculate(target, &city)?;
            for event in &day.events {
                let local = tz
                    .timestamp_opt(event.timestamp, 0)
                    .single()
                    .ok_or("Invalid timestamp")?;
                assert_eq!(local.date_naive(), target);
                if id == "np-kathmandu" {
                    assert_eq!(event.offset, "+05:45");
                }
            }
        }
    }
    Ok(())
}

#[test]
fn midnight_gap_and_skipped_date_are_explicit() -> TestResult {
    let santiago = chrono_tz::America::Santiago;
    let start = solar::day_start(date("2026-09-06")?, santiago)?;
    assert_eq!(
        start.with_timezone(&santiago).format("%H:%M").to_string(),
        "01:00"
    );
    assert!(solar::day_start(date("2011-12-30")?, chrono_tz::Pacific::Apia).is_err());
    Ok(())
}

#[test]
fn seasonal_results_are_finite_and_ordered_for_all_cities() -> TestResult {
    for city in catalog()? {
        for value in ["2026-03-20", "2026-06-21", "2026-09-23", "2026-12-21"] {
            let day = solar::calculate(date(value)?, &city)?;
            assert!(day
                .events
                .windows(2)
                .all(|p| p[0].timestamp <= p[1].timestamp));
            assert!(day.events.iter().all(|e| (0.0..1.0).contains(&e.position)));
            assert!(day
                .samples
                .iter()
                .all(|s| s.altitude.is_finite() && (0.0..=1.0).contains(&s.position)));
        }
    }
    Ok(())
}

#[test]
fn settings_round_trip_empty_selection_and_atomic_replacement() -> TestResult {
    let root = tempfile::tempdir()?;
    let cities = storage::load_cities(root.path())?;
    let mut settings = storage::load_settings(root.path(), &cities)?;
    settings.visible_cities.clear();
    storage::save_settings(root.path(), &settings, &cities)?;
    assert_eq!(storage::load_settings(root.path(), &cities)?, settings);
    settings.sort = SortOrder::South;
    storage::save_settings(root.path(), &settings, &cities)?;
    assert_eq!(storage::load_settings(root.path(), &cities)?, settings);
    assert_eq!(fs::read_dir(root.path())?.count(), 2);
    Ok(())
}

#[test]
fn malformed_user_files_are_preserved() -> TestResult {
    let root = tempfile::tempdir()?;
    let cities = catalog()?;
    for name in ["cities.json", "settings.toml"] {
        fs::write(root.path().join(name), "broken [")?;
    }
    assert!(storage::load_cities(root.path()).is_err());
    assert!(storage::load_settings(root.path(), &cities).is_err());
    for name in ["cities.json", "settings.toml"] {
        assert_eq!(fs::read_to_string(root.path().join(name))?, "broken [");
    }
    Ok(())
}

#[test]
fn windows_utf8_bom_files_can_be_edited_manually() -> TestResult {
    let root = tempfile::tempdir()?;
    fs::write(
        root.path().join("cities.json"),
        format!("\u{feff}{}", storage::BUNDLED_CITIES),
    )?;
    let cities = storage::load_cities(root.path())?;
    let initial = Settings::initial(&cities);
    fs::write(
        root.path().join("settings.toml"),
        format!("\u{feff}{}", toml::to_string(&initial)?),
    )?;
    assert_eq!(storage::load_settings(root.path(), &cities)?, initial);
    Ok(())
}

#[test]
fn write_failures_and_unknown_settings_ids_are_reported() -> TestResult {
    let root = tempfile::tempdir()?;
    let cities = catalog()?;
    let mut settings = Settings::initial(&cities);
    settings.visible_cities.push("unknown-city".into());
    assert!(storage::save_settings(root.path(), &settings, &cities).is_err());
    settings.visible_cities.clear();
    fs::create_dir(root.path().join("settings.toml"))?;
    let result = storage::save_settings(root.path(), &settings, &cities);
    assert!(result.is_err_and(|message| message.contains("settings.toml")));
    Ok(())
}

#[test]
#[ignore = "Writes computed fixtures for browser integration tests"]
fn export_ui_fixture() -> TestResult {
    let cities = catalog()?;
    let target = date("2026-06-21")?;
    let settings = Settings::initial(&cities);
    let bootstrap = crate::Bootstrap {
        today: target,
        directory: "D:\\SunriseSet".into(),
        tzdb_version: chrono_tz::IANA_TZDB_VERSION,
        settings,
        cities: cities.clone(),
    };
    let rows = cities
        .iter()
        .map(|city| {
            Ok(crate::CityResult {
                city_id: city.id.clone(),
                day: Some(solar::calculate(target, city)?),
                error: None,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-artifacts");
    fs::create_dir_all(&path)?;
    fs::write(
        path.join("fixture.json"),
        serde_json::to_vec(&serde_json::json!({"bootstrap": bootstrap, "rows": rows}))?,
    )?;
    assert_eq!(target.year(), 2026);
    Ok(())
}
