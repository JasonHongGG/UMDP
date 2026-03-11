use crate::models::RuntimeClassOverlayResponse;
use crate::state::AppState;
use serde::Deserialize;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

#[derive(Debug, Deserialize)]
struct HelperRuntimeStaticFields {
    static_fields: Vec<crate::models::StaticFieldInfo>,
    fields: Vec<crate::models::FieldInfo>,
}

pub fn get_runtime_static_fields(
    state: State<'_, AppState>,
    image_id: &str,
    class_namespace: &str,
    class_name: &str,
) -> Result<RuntimeClassOverlayResponse, String> {
    let attached = state
        .attached_process
        .lock()
        .clone()
        .ok_or_else(|| "No process attached".to_string())?;

    if attached.runtime != "Mono" {
        return Err("Runtime static field resolution currently supports Mono targets only".to_string());
    }

    let helper_exe = ensure_helper_built()?;
    let output = Command::new(&helper_exe)
        .arg("--pid")
        .arg(attached.pid.to_string())
        .arg("--image")
        .arg(image_id)
        .arg("--namespace")
        .arg(class_namespace)
        .arg("--class")
        .arg(class_name)
        .output()
        .map_err(|error| format!("Failed to launch runtime bridge: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Runtime bridge failed: {}", stderr.trim()));
    }

    let response: HelperRuntimeStaticFields = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse runtime bridge response: {error}"))?;

    Ok(RuntimeClassOverlayResponse {
        static_fields: response.static_fields,
        fields: response.fields,
    })
}

fn ensure_helper_built() -> Result<PathBuf, String> {
    let project_path = helper_project_path()?;
    let exe_path = helper_executable_path()?;

    if exe_path.is_file() {
        return Ok(exe_path);
    }

    let msbuild = locate_msbuild()?;
    let output = Command::new(msbuild)
        .arg(&project_path)
        .arg("-target:Build")
        .arg("-property:Configuration=Debug")
        .arg("-property:Platform=x64")
        .output()
        .map_err(|error| format!("Failed to build runtime bridge: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Runtime bridge build failed: {} {}",
            stdout.trim(),
            stderr.trim()
        ));
    }

    if exe_path.is_file() {
        Ok(exe_path)
    } else {
        Err(format!("Runtime bridge executable not found after build: {}", exe_path.display()))
    }
}

fn helper_project_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root = manifest_dir.parent().ok_or_else(|| "Failed to resolve project root".to_string())?;
    let project = root.join("tools").join("UnityMonoBridge").join("UnityMonoBridge.vcxproj");
    if Path::new(&project).is_file() {
        Ok(project)
    } else {
        Err(format!("Runtime bridge project not found: {}", project.display()))
    }
}

fn helper_executable_path() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root = manifest_dir.parent().ok_or_else(|| "Failed to resolve project root".to_string())?;
    Ok(root
        .join("tools")
        .join("UnityMonoBridge")
        .join("build")
        .join("x64")
        .join("Debug")
        .join("UnityMonoBridge.exe"))
}

fn locate_msbuild() -> Result<PathBuf, String> {
    if let Ok(program_files) = env::var("ProgramFiles") {
        let root = PathBuf::from(program_files).join("Microsoft Visual Studio");
        for version in ["18", "17"] {
            for edition in ["Community", "Professional", "Enterprise", "BuildTools"] {
                let candidate = root
                    .join(version)
                    .join(edition)
                    .join("MSBuild")
                    .join("Current")
                    .join("Bin")
                    .join("MSBuild.exe");

                if candidate.is_file() {
                    return Ok(candidate);
                }
            }
        }
    }

    Err("Visual Studio MSBuild.exe not found. Install Visual Studio C++ build tools or build UnityMonoBridge manually first.".to_string())
}