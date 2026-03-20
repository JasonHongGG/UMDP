pub mod invocation;
pub mod metadata;
pub mod process;

pub fn get_handlers() -> impl Fn(tauri::ipc::Invoke) -> bool {
    tauri::generate_handler![
        process::fetch_system_processes,
        process::attach_to_process,
        metadata::load_all_metadata,
        metadata::get_runtime_static_fields,
        metadata::get_runtime_instance_fields,
        invocation::invoke_runtime_method,
    ]
}
