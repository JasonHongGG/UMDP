use super::{infer_scene_kind, normalize_scene_type_name, scene_name_from_path};
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