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
        scene::get_scene_object_children,
        scene::get_scene_object_inspector,
        scene::create_scene_child,
        scene::duplicate_scene_object,
        scene::delete_scene_object,
        scene::set_scene_object_active,
        invocation::invoke_runtime_method,
        field_setting::set_runtime_field_value,
    ]
}
