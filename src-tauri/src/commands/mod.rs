pub mod metadata;
pub mod process;

pub fn get_handlers() -> impl Fn(tauri::ipc::Invoke) -> bool {
    tauri::generate_handler![
        process::fetch_system_processes,
        process::attach_to_process,
        metadata::get_image_catalog,
        metadata::get_image_classes,
        metadata::get_class_details,
        metadata::get_runtime_static_fields,
    ]
}
