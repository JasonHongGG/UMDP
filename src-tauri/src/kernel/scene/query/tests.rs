use super::{
    decode_quaternion_bytes, decode_vector3_bytes, infer_scene_kind,
    normalize_scene_type_name, scene_name_from_path,
};
use crate::domain::analysis_models::RuntimeSceneKind;

#[test]
fn scene_name_from_path_strips_directory_and_extension() {
    assert_eq!(scene_name_from_path("Assets/Scenes/Menu.unity"), "Menu");
    assert_eq!(scene_name_from_path("Level01"), "Level01");
}

#[test]
fn infer_scene_kind_detects_special_scene_types() {
    assert_eq!(
        infer_scene_kind(None, None, Some("DontDestroyOnLoad".to_string())),
        RuntimeSceneKind::DontDestroyOnLoad
    );
    assert_eq!(
        infer_scene_kind(Some(-1), None, Some("Temp".to_string())),
        RuntimeSceneKind::HideAndDontSave
    );
    assert_eq!(
        infer_scene_kind(
            Some(0),
            Some("Assets/Scenes/Main.unity".to_string()),
            Some("Main".to_string())
        ),
        RuntimeSceneKind::Loaded
    );
}

#[test]
fn normalize_scene_type_name_maps_runtime_aliases() {
    assert_eq!(normalize_scene_type_name("int"), "System.Int32");
    assert_eq!(normalize_scene_type_name("bool"), "System.Boolean");
    assert_eq!(normalize_scene_type_name("string"), "System.String");
    assert_eq!(normalize_scene_type_name("int[]"), "System.Int32[]");
    assert_eq!(normalize_scene_type_name("int &"), "System.Int32&");
}

#[test]
fn decode_vector3_bytes_reads_unboxed_payload_in_field_order() {
    let bytes = [
        1.25f32.to_ne_bytes(),
        (-3.5f32).to_ne_bytes(),
        9.0f32.to_ne_bytes(),
    ]
    .concat();

    let decoded = decode_vector3_bytes(&bytes).unwrap();

    assert_eq!(decoded.x, 1.25);
    assert_eq!(decoded.y, -3.5);
    assert_eq!(decoded.z, 9.0);
}

#[test]
fn decode_quaternion_bytes_reads_unboxed_payload_in_field_order() {
    let bytes = [
        0.0f32.to_ne_bytes(),
        0.25f32.to_ne_bytes(),
        (-0.5f32).to_ne_bytes(),
        1.0f32.to_ne_bytes(),
    ]
    .concat();

    let decoded = decode_quaternion_bytes(&bytes).unwrap();

    assert_eq!(decoded.x, 0.0);
    assert_eq!(decoded.y, 0.25);
    assert_eq!(decoded.z, -0.5);
    assert_eq!(decoded.w, 1.0);
}