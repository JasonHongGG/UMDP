pub mod field_setting;
pub mod invocation;
pub mod metadata;
pub mod process;
pub mod scene;

pub fn get_handlers() -> impl Fn(tauri::ipc::Invoke) -> bool {
    tauri::generate_handler![
        process::fetch_system_processes,
        process::get_contract_versions,
        process::attach_to_process,
        process::get_workspace_lifecycle,
        metadata::load_all_metadata,
        metadata::get_runtime_static_fields,
        metadata::get_runtime_instance_fields,
        scene::start_scene_refresh,
        scene::get_scene_workspace_state,
        scene::list_scene_picker_windows,
        scene::get_scene_mouse_picker_state,
        scene::set_scene_mouse_picker_target,
        scene::start_scene_mouse_picker,
        scene::stop_scene_mouse_picker,
        scene::start_scene_object_children_analysis,
        scene::get_scene_object_children_state,
        scene::cancel_scene_object_children_analysis,
        scene::start_scene_object_header_analysis,
        scene::get_scene_object_header_state,
        scene::cancel_scene_object_header_analysis,
        scene::start_scene_object_components_analysis,
        scene::get_scene_object_components_state,
        scene::cancel_scene_object_components_analysis,
        scene::get_scene_object_children,
        scene::create_scene_root,
        scene::create_scene_child,
        scene::duplicate_scene_object,
        scene::delete_scene_object,
        scene::rename_scene_object,
        scene::set_scene_object_tag,
        scene::set_scene_object_layer,
        scene::set_scene_object_hide_flags,
        scene::reparent_scene_object,
        scene::set_scene_object_active,
        scene::set_scene_object_transform,
        scene::set_scene_behaviour_enabled,
        scene::create_scene_component,
        scene::delete_scene_component,
        scene::load_scene_by_build_index,
        invocation::invoke_runtime_method,
        field_setting::set_runtime_field_value,
    ]
}
