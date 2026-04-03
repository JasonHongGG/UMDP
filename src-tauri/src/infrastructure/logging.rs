use std::env;
use std::fmt::Write as _;
use std::sync::OnceLock;
use std::time::Instant;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum DiagnosticsLevel {
    Debug,
    Info,
    Warn,
    Error,
}

pub type DiagnosticsField = (&'static str, String);

pub trait DiagnosticsSink: Send + Sync {
    fn emit(&self, line: &str);
}

#[derive(Debug)]
struct StderrDiagnosticsSink;

impl DiagnosticsSink for StderrDiagnosticsSink {
    fn emit(&self, line: &str) {
        eprintln!("{line}");
    }
}

#[derive(Clone, Debug)]
struct DiagnosticsPolicy {
    enabled: bool,
    minimum_level: DiagnosticsLevel,
    channels: Option<Vec<String>>,
    origins: Option<Vec<String>>,
}

static DIAGNOSTICS_POLICY: OnceLock<DiagnosticsPolicy> = OnceLock::new();
static DIAGNOSTICS_SINKS: OnceLock<Vec<Box<dyn DiagnosticsSink>>> = OnceLock::new();

impl DiagnosticsLevel {
    fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "debug" => Some(Self::Debug),
            "info" => Some(Self::Info),
            "warn" => Some(Self::Warn),
            "error" => Some(Self::Error),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }
}

impl DiagnosticsPolicy {
    fn from_environment() -> Self {
        let enabled = env::var("UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS")
            .ok()
            .and_then(|value| parse_bool(&value))
            .unwrap_or(false);
        let minimum_level = env::var("UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_LEVEL")
            .ok()
            .and_then(|value| DiagnosticsLevel::parse(&value))
            .unwrap_or(DiagnosticsLevel::Debug);

        Self {
            enabled,
            minimum_level,
            channels: parse_list_env("UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_CHANNELS"),
            origins: parse_list_env("UNITY_MONO_STUDIO_DEBUG_DIAGNOSTICS_ORIGINS"),
        }
    }

    fn allows(&self, level: DiagnosticsLevel, channel: &str, origin: &str) -> bool {
        if !self.enabled || level < self.minimum_level {
            return false;
        }

        if let Some(channels) = &self.channels {
            if !channels.iter().any(|entry| entry == channel) {
                return false;
            }
        }

        if let Some(origins) = &self.origins {
            if !origins.iter().any(|entry| entry == origin) {
                return false;
            }
        }

        true
    }
}

pub fn init() {
    let _ = dotenvy::dotenv();
    let _ = policy();
    let _ = sinks();
}

pub fn debug(channel: &str, origin: &str, message: &str, fields: Vec<DiagnosticsField>) {
    emit(DiagnosticsLevel::Debug, channel, origin, message, fields);
}

pub fn error(channel: &str, origin: &str, message: &str, fields: Vec<DiagnosticsField>) {
    emit(DiagnosticsLevel::Error, channel, origin, message, fields);
}

pub fn log_timed_result<T, E, F>(
    channel: &str,
    origin: &str,
    operation: &str,
    started_at: Instant,
    result: &Result<T, E>,
    base_fields: Vec<DiagnosticsField>,
    on_success: F,
) where
    E: std::fmt::Display,
    F: FnOnce(&T) -> Vec<DiagnosticsField>,
{
    match result {
        Ok(value) => {
            let mut fields = base_fields;
            fields.push(("durationMs", started_at.elapsed().as_millis().to_string()));
            fields.extend(on_success(value));
            debug(channel, origin, &format!("{operation} completed."), fields);
        }
        Err(error_value) => {
            let mut fields = base_fields;
            fields.push(("durationMs", started_at.elapsed().as_millis().to_string()));
            fields.push(("error", error_value.to_string()));
            error(channel, origin, &format!("{operation} failed."), fields);
        }
    }
}

fn emit(
    level: DiagnosticsLevel,
    channel: &str,
    origin: &str,
    message: &str,
    fields: Vec<DiagnosticsField>,
) {
    let active_policy = policy();
    if !active_policy.allows(level, channel, origin) {
        return;
    }

    let mut line = format!(
        "[diag][{}][{}][{}] {}",
        level.as_str(),
        channel,
        origin,
        message
    );
    for (key, value) in fields {
        if value.is_empty() {
            continue;
        }

        let _ = write!(line, " {}={}", key, sanitize_field_value(&value));
    }

    for sink in sinks() {
        sink.emit(&line);
    }
}

fn policy() -> &'static DiagnosticsPolicy {
    DIAGNOSTICS_POLICY.get_or_init(DiagnosticsPolicy::from_environment)
}

fn sinks() -> &'static Vec<Box<dyn DiagnosticsSink>> {
    DIAGNOSTICS_SINKS.get_or_init(|| vec![Box::new(StderrDiagnosticsSink)])
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" | "enabled" => Some(true),
        "0" | "false" | "no" | "off" | "disabled" => Some(false),
        _ => None,
    }
}

fn parse_list_env(name: &str) -> Option<Vec<String>> {
    let raw = env::var(name).ok()?;
    let values = raw
        .split(',')
        .map(|entry| entry.trim())
        .filter(|entry| !entry.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();

    (!values.is_empty()).then_some(values)
}

fn sanitize_field_value(value: &str) -> String {
    let normalized = value.replace('\n', "\\n");
    if normalized.chars().any(char::is_whitespace) || normalized.contains('"') {
        format!("{normalized:?}")
    } else {
        normalized
    }
}
