//! Meeus / NOAAの太陽位置計算式を使い、太陽高度と各イベントの時刻を求める。
//! 計算式の参考: https://gml.noaa.gov/grad/solcalc/calcdetails.html
//! 日の出・日の入りでは太陽の視半径と標準大気差を考慮し、薄明では幾何学的高度を使う。
use crate::model::{AppResult, City};
use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use serde::Serialize;

/// 太陽中心高度がこの角度を通過する時刻を、日の出・日の入りとする。
/// 太陽の視半径約16分角と地平線付近の標準大気差約34分角の合計に相当する。
const HORIZON: f64 = -0.8333;
/// (太陽高度、朝側のイベント名、夕方側のイベント名)。高度が低い順に評価する。
const THRESHOLDS: [(f64, &str, &str); 4] = [
    (-18.0, "astronomical_dawn", "astronomical_dusk"),
    (-12.0, "nautical_dawn", "nautical_dusk"),
    (-6.0, "civil_dawn", "civil_dusk"),
    (HORIZON, "sunrise", "sunset"),
];

#[derive(Debug, Serialize)]
pub struct Event {
    pub kind: String,
    pub time: String,
    pub offset: String,
    pub position: f64,
    pub timestamp: i64,
}

#[derive(Debug, Serialize)]
pub struct Sample {
    pub position: f64,
    pub altitude: f64,
}

#[derive(Debug, Serialize)]
pub struct Tick {
    pub position: f64,
    pub time: String,
    pub offset: String,
}

#[derive(Debug, Serialize)]
pub struct SolarDay {
    pub city_id: String,
    pub status: &'static str,
    pub hours: f64,
    pub maximum_altitude: f64,
    pub events: Vec<Event>,
    pub samples: Vec<Sample>,
    pub ticks: Vec<Tick>,
}

/// 度で指定した角度を、三角関数に渡す前にラジアンへ変換する。
fn sin(degrees: f64) -> f64 {
    degrees.to_radians().sin()
}
/// 度で指定した角度を、三角関数に渡す前にラジアンへ変換する。
fn cos(degrees: f64) -> f64 {
    degrees.to_radians().cos()
}

/// 指定したUTC時刻・観測地点での、地平線から見た太陽中心高度を返す。
pub(crate) fn altitude(timestamp: f64, latitude: f64, longitude: f64) -> f64 {
    // UNIX時刻を天体計算に使うユリウス日に変換し、J2000からの経過をユリウス世紀で表す。
    // 1日は86,400秒、UNIX時刻のユリウス日は2,440,587.5日。
    let jd = timestamp / 86400.0 + 2440587.5;
    let t = (jd - 2451545.0) / 36525.0;
    // 地球軌道が楕円であることによるずれを扱うため、太陽の平均黄経と平均近点角を求める。
    let mean_long = (280.46646 + t * (36000.76983 + t * 0.0003032)).rem_euclid(360.0);
    let anomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    // 軌道離心率と、平均位置から真の太陽位置までの補正角（中心差）を近似する。
    let eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    let center = sin(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t))
        + sin(2.0 * anomaly) * (0.019993 - 0.000101 * t)
        + sin(3.0 * anomaly) * 0.000289;
    // 月の軌道を表す角度 omega を用い、歳差等の短周期項を加えて太陽の視黄経を求める。
    let omega = 125.04 - 1934.136 * t;
    let apparent_long = mean_long + center - 0.00569 - 0.00478 * sin(omega);
    // 黄道と天の赤道の傾き（黄道傾斜角）にも短周期の補正を加える。
    let obliquity = 23.0
        + (26.0 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60.0) / 60.0
        + 0.00256 * cos(omega);
    // 黄道座標の視黄経を赤道座標系へ投影し、太陽の赤緯を得る。
    let declination = (sin(obliquity) * sin(apparent_long)).asin();
    // 均時差の補助量 y を求める。以下の三角関数は度単位の角度を sin / cos に渡す。
    let y = (obliquity.to_radians() / 2.0).tan().powi(2);
    // Meeus / NOAA式で、平均太陽時と真太陽時の差（均時差）を分単位で求める。
    let equation = 4.0
        * (y * sin(2.0 * mean_long) - 2.0 * eccentricity * sin(anomaly)
            + 4.0 * eccentricity * y * sin(anomaly) * cos(2.0 * mean_long)
            - 0.5 * y * y * sin(4.0 * mean_long)
            - 1.25 * eccentricity * eccentricity * sin(2.0 * anomaly))
        .to_degrees();
    // UTC時刻の分に均時差と「経度1度あたり4分」を加え、地方真太陽時へ換算する。
    // rem_euclid により、日付をまたいだ時刻も0～1,440分の範囲に正規化する。
    let solar_minutes =
        (timestamp.rem_euclid(86400.0) / 60.0 + equation + 4.0 * longitude).rem_euclid(1440.0);
    // 地方真太陽時から時角を求め、緯度・赤緯と合わせて球面三角法で太陽高度を算出する。
    // 浮動小数点誤差で逆正弦の定義域をわずかに外れないよう、計算前に値を制限する。
    let hour_angle = solar_minutes / 4.0 - 180.0;
    (sin(latitude) * declination.sin() + cos(latitude) * declination.cos() * cos(hour_angle))
        .clamp(-1.0, 1.0)
        .asin()
        .to_degrees()
}

// 0時が夏時間への切替で存在しない場合は、その日で最初に存在する現地時刻を使う。
// 夏時間の終了で0時が重複する場合は早い方を選ぶ。丸一日存在しない暦日はエラーにする。
pub(crate) fn day_start(date: NaiveDate, timezone: Tz) -> AppResult<DateTime<Utc>> {
    let midnight = date.and_hms_opt(0, 0, 0).ok_or("Invalid date")?;
    for minute in 0..1440 {
        let local = midnight + Duration::minutes(minute);
        // 0時から1分ずつ調べることで、0時の欠落・重複をタイムゾーン規則に従って扱う。
        if let Some(time) = timezone.from_local_datetime(&local).earliest() {
            // 計算軸と他都市との時差比較にはUTCを用い、表示時にのみ現地時刻へ戻す。
            return Ok(time.with_timezone(&Utc));
        }
    }
    Err(format!("{date} does not exist in {timezone}"))
}

/// 浮動小数の秒を整数秒に切り捨て、範囲外の日時は計算エラーとして返す。
fn utc(timestamp: f64) -> AppResult<DateTime<Utc>> {
    DateTime::from_timestamp(timestamp.floor() as i64, 0)
        .ok_or_else(|| "Timestamp out of range".into())
}

// 2点の太陽高度を三分探索し、サンプリング点の間にある局所的な極大・極小の時刻を絞り込む。
// 極夜・白夜の切替期に出没時間が5分より短くても、閾値との交差を検出しやすくする。
fn extremum(mut left: f64, mut right: f64, city: &City, maximum: bool) -> f64 {
    for _ in 0..40 {
        // 探索区間を約3分の1ずつ縮め、区間内にある単峰の最大値・最小値に近づく。
        let a = left + (right - left) / 3.0;
        let b = right - (right - left) / 3.0;
        let increasing =
            altitude(a, city.latitude, city.longitude) < altitude(b, city.latitude, city.longitude);
        // 最高点を探す場合は高度が上がる側、最低点では高度が下がる側を残す。
        if increasing == maximum {
            left = a;
        } else {
            right = b;
        }
    }
    (left + right) / 2.0
}

/// 閾値をまたぐUTC時刻を二分探索し、通過時刻を秒単位で絞り込む。
fn crossing(mut left: f64, mut right: f64, level: f64, city: &City) -> f64 {
    // 区間の左端が閾値より下なら朝の上昇、上なら夕方の下降として判定する。
    let rising = altitude(left, city.latitude, city.longitude) < level;
    for _ in 0..32 {
        let mid = (left + right) / 2.0;
        // 中点が左端と同じ側にあるかで、閾値を含む半区間だけを次の探索対象にする。
        if (altitude(mid, city.latitude, city.longitude) < level) == rising {
            left = mid;
        } else {
            right = mid;
        }
    }
    (left + right) / 2.0
}

/// 都市の現地暦日について、イベント時刻・状態・バー描画用データを計算する。
pub fn calculate(date: NaiveDate, city: &City) -> AppResult<SolarDay> {
    // 指定日に有効なIANA規則を解析する。ここから日の開始・終了と表示時刻に夏時間も適用される。
    let timezone = city.timezone.parse::<Tz>().map_err(|e| e.to_string())?;
    let start = day_start(date, timezone)?.timestamp() as f64;
    let next = date.succ_opt().ok_or("Date out of range")?;
    let end = day_start(next, timezone)?.timestamp() as f64;
    // UTC上の差を使うため、夏時間切替日はこの長さが23時間または25時間になる。
    let span = end - start;
    if span <= 0.0 {
        return Err("Empty local calendar day".into());
    }
    // およそ5分ごとに高度を標本化する。端数があっても必ず日の終端を含める。
    let count = (span / 300.0).ceil() as usize;
    let mut points: Vec<(f64, f64)> = (0..=count)
        .map(|i| {
            let time = start + span * i as f64 / count as f64;
            (time, altitude(time, city.latitude, city.longitude))
        })
        .collect();
    let mut extrema = Vec::new();
    for triple in points.windows(3) {
        // 隣り合う標本より高い・低い点を見つけ、出没がごく短い日の極値を追加する。
        let maximum = triple[1].1 > triple[0].1 && triple[1].1 > triple[2].1;
        let minimum = triple[1].1 < triple[0].1 && triple[1].1 < triple[2].1;
        if maximum || minimum {
            let time = extremum(triple[0].0, triple[2].0, city, maximum);
            extrema.push((time, altitude(time, city.latitude, city.longitude)));
        }
    }
    points.extend(extrema);
    // 後続の探索で標本時刻を前から順に処理できるよう並べ直す。
    points.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut events = Vec::new();
    // 日の出・日の入りは地平線の定義高度、薄明は太陽中心の幾何学的高度を閾値とする。
    for &(level, dawn, dusk) in &THRESHOLDS {
        for pair in points.windows(2) {
            // 区間の両端が閾値の同じ側なら、その区間に境界はない。
            if (pair[0].1 < level) == (pair[1].1 < level) {
                continue;
            }
            // 各イベントは、現地時刻への変換や丸めの前に秒単位で境界を探索する。
            let time = crossing(pair[0].0, pair[1].0, level, city);
            // 次の日の開始時刻と一致する境界は、翌日のイベントとして扱う。
            if time >= end - 0.001 {
                continue;
            }
            let instant = utc(time)?;
            // 秒を切り捨て、分への四捨五入で現地の日付や夏時間区分が変わらないようにする。
            let local = instant.with_timezone(&timezone);
            // 高度が下から上へ通過した境界を朝、上から下なら夕方のイベントとする。
            let kind = if pair[0].1 < level { dawn } else { dusk };
            events.push(Event {
                kind: kind.into(),
                time: local.format("%H:%M").to_string(),
                offset: local.format("%:z").to_string(),
                position: (time - start) / span,
                timestamp: instant.timestamp(),
            });
        }
    }
    events.sort_by_key(|event| event.timestamp);
    // 標本と極値を調べ、標準の日の出・日の入り高度を一度も越えない状態を判定する。
    let minimum = points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
    let maximum = points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);
    let status = if minimum >= HORIZON {
        // 一日中太陽が地平線上にある。
        "polar_day"
    } else if maximum < HORIZON {
        // 一日中太陽が地平線の下にある。ただし、薄明のイベントは別に存在し得る。
        "polar_night"
    } else {
        "normal"
    };
    // どの計算イベントでも線が描画できるよう、その正確な時刻をバー標本にも追加する。
    for event in &events {
        let time = start + event.position * span;
        points.push((time, altitude(time, city.latitude, city.longitude)));
    }
    points.sort_by(|a, b| a.0.total_cmp(&b.0));
    // 1日の実経過時間を0～1に正規化し、太陽高度を添えてグラデーション用標本を作る。
    let samples = points
        .iter()
        .map(|&(time, height)| Sample {
            position: (time - start) / span,
            altitude: height,
        })
        .collect();
    // 現地日の開始から終了までを4分割する目盛。各目盛には適用中のUTC時差も添える。
    let ticks = (0..=4)
        .map(|i| {
            let position = i as f64 / 4.0;
            let local = utc(start + position * span)?.with_timezone(&timezone);
            Ok(Tick {
                position,
                time: if i == 4 {
                    "24:00".into()
                } else {
                    local.format("%H:%M").to_string()
                },
                offset: local.format("%:z").to_string(),
            })
        })
        .collect::<AppResult<Vec<_>>>()?;
    Ok(SolarDay {
        city_id: city.id.clone(),
        status,
        hours: span / 3600.0,
        // 現地暦日の標本と三分探索で求めた極大から、最高高度を返す。
        maximum_altitude: maximum,
        events,
        samples,
        ticks,
    })
}
