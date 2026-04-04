fn trim(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_scene_type_name(value: &str) -> String {
    let mut value = trim(value);
    if value.is_empty() {
        return value;
    }

    let mut suffix = String::new();
    loop {
        if value.ends_with("[]") {
            suffix = format!("[]{}", suffix);
            value.truncate(value.len() - 2);
            value = trim(&value);
            continue;
        }

        if let Some(last) = value.chars().last() {
            if last == '&' || last == '*' {
                suffix.insert(0, last);
                value.pop();
                value = trim(&value);
                continue;
            }
        }

        break;
    }

    let normalized = match value.as_str() {
        "void" => "System.Void",
        "bool" => "System.Boolean",
        "byte" => "System.Byte",
        "sbyte" => "System.SByte",
        "short" => "System.Int16",
        "ushort" => "System.UInt16",
        "int" => "System.Int32",
        "uint" => "System.UInt32",
        "long" => "System.Int64",
        "ulong" => "System.UInt64",
        "float" => "System.Single",
        "double" => "System.Double",
        "string" => "System.String",
        "object" => "System.Object",
        other => other,
    };

    format!("{normalized}{suffix}")
}

fn trim_assembly_name(value: &str) -> String {
    let trimmed = trim(value);
    trimmed
        .strip_suffix(".dll")
        .unwrap_or(trimmed.as_str())
        .to_string()
}

fn assembly_name_matches(image_name: &str, assembly_hint: Option<&str>) -> bool {
    match assembly_hint {
        Some(assembly_hint) => trim_assembly_name(image_name) == trim_assembly_name(assembly_hint),
        None => true,
    }
}

fn split_assembly_qualified_type(value: &str) -> (String, Option<String>) {
    match value.find(',') {
        Some(comma) => (
            trim(&value[..comma]),
            Some(trim_assembly_name(&value[comma + 1..])),
        ),
        None => (trim(value), None),
    }
}

fn build_type_name_candidates(type_name: &str) -> Vec<(String, String)> {
    match type_name.rfind('.') {
        Some(last_dot) => vec![(
            type_name[..last_dot].to_string(),
            type_name[last_dot + 1..].to_string(),
        )],
        None => vec![
            ("UnityEngine".to_string(), type_name.to_string()),
            (String::new(), type_name.to_string()),
        ],
    }
}

fn pack_vector3(value: &RuntimeVector3Snapshot) -> [u8; 12] {
    let mut bytes = [0u8; 12];
    bytes[0..4].copy_from_slice(&value.x.to_ne_bytes());
    bytes[4..8].copy_from_slice(&value.y.to_ne_bytes());
    bytes[8..12].copy_from_slice(&value.z.to_ne_bytes());
    bytes
}

fn pack_quaternion(value: &RuntimeQuaternionSnapshot) -> [u8; 16] {
    let mut bytes = [0u8; 16];
    bytes[0..4].copy_from_slice(&value.x.to_ne_bytes());
    bytes[4..8].copy_from_slice(&value.y.to_ne_bytes());
    bytes[8..12].copy_from_slice(&value.z.to_ne_bytes());
    bytes[12..16].copy_from_slice(&value.w.to_ne_bytes());
    bytes
}

fn format_address(address: NativeAddress) -> String {
    format!("0x{address:x}")
}

fn parse_address(value: &str) -> Result<NativeAddress, String> {
    let trimmed = value.trim();
    let normalized = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    usize::from_str_radix(normalized, if trimmed.starts_with("0x") { 16 } else { 10 })
        .map_err(|error| format!("Invalid address '{value}': {error}"))
}

fn scene_name_from_path(path: &str) -> String {
    let file_name = path.rsplit(['\\', '/']).next().unwrap_or(path);
    match file_name.rsplit_once('.') {
        Some((name, _)) => name.to_string(),
        None => file_name.to_string(),
    }
}

fn infer_scene_kind(
    build_index: Option<i32>,
    path: Option<String>,
    name: Option<String>,
) -> RuntimeSceneKind {
    if name.as_deref() == Some("DontDestroyOnLoad") {
        return RuntimeSceneKind::DontDestroyOnLoad;
    }

    if build_index.unwrap_or(-1) < 0 && path.as_deref().unwrap_or_default().is_empty() {
        return RuntimeSceneKind::HideAndDontSave;
    }

    RuntimeSceneKind::Loaded
}