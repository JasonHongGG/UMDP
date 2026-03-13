use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    build_managed_metadata_reader();
    build_unity_mono_bridge();
    tauri_build::build()
}

fn build_managed_metadata_reader() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_path = manifest_dir
        .parent()
        .expect("failed to resolve workspace root")
        .join("tools")
        .join("ManagedMetadataReader")
        .join("ManagedMetadataReader.csproj");
    let project_dir = project_path
        .parent()
        .expect("managed metadata reader directory missing");

    println!("cargo:rerun-if-changed={}", project_path.display());
    println!("cargo:rerun-if-changed={}", project_dir.join("Program.cs").display());
    println!("cargo:rerun-if-changed={}", project_dir.join("CommandLine.cs").display());
    println!("cargo:rerun-if-changed={}", project_dir.join("Contracts.cs").display());
    println!("cargo:rerun-if-changed={}", project_dir.join("ManagedMetadataCatalog.cs").display());

    if !cfg!(target_os = "windows") {
        println!("cargo:warning=Skipping ManagedMetadataReader publish because the current build host is not Windows.");
        return;
    }

    let output_dir = manifest_dir.join("bin");
    std::fs::create_dir_all(&output_dir).expect("failed to create src-tauri/bin for helper output");

    let status = Command::new("dotnet")
        .arg("publish")
        .arg(&project_path)
        .arg("-c")
        .arg("Release")
        .arg("-r")
        .arg("win-x64")
        .arg("--self-contained")
        .arg("true")
        .arg("-p:PublishSingleFile=true")
        .arg("-p:EnableCompressionInSingleFile=true")
        .arg("-p:DebugType=None")
        .arg("-p:DebugSymbols=false")
        .arg("-o")
        .arg(&output_dir)
        .status()
        .expect("failed to launch dotnet publish for ManagedMetadataReader");

    if !status.success() {
        panic!("dotnet publish for ManagedMetadataReader failed");
    }

    let published_exe = output_dir.join("ManagedMetadataReader.exe");
    if !Path::new(&published_exe).is_file() {
        panic!(
            "ManagedMetadataReader publish completed but executable was not found at {}",
            published_exe.display()
        );
    }
}

fn build_unity_mono_bridge() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root_dir = manifest_dir
        .parent()
        .expect("failed to resolve workspace root");
    let project_path = root_dir
        .join("tools")
        .join("UnityMonoBridge")
        .join("UnityMonoBridge.vcxproj");
    let project_dir = project_path
        .parent()
        .expect("UnityMonoBridge project directory missing");

    emit_rerun_for_path(&project_path);
    emit_rerun_for_path(&project_dir.join("UnityMonoBridge.cpp"));
    emit_rerun_for_dir(&project_dir.join("include"));
    emit_rerun_for_dir(&project_dir.join("src"));

    if !cfg!(target_os = "windows") {
        println!("cargo:warning=Skipping UnityMonoBridge build because the current build host is not Windows.");
        return;
    }

    let msbuild = locate_msbuild().expect("Visual Studio MSBuild.exe not found for UnityMonoBridge sidecar build");
    let status = Command::new(&msbuild)
        .arg(&project_path)
        .arg("-target:Build")
        .arg("-property:Configuration=Release")
        .arg("-property:Platform=x64")
        .status()
        .expect("failed to launch MSBuild for UnityMonoBridge");

    if !status.success() {
        panic!("MSBuild for UnityMonoBridge failed");
    }

    let built_executable = project_dir
        .join("build")
        .join("x64")
        .join("Release")
        .join("UnityMonoBridge.exe");
    if !built_executable.is_file() {
        panic!(
            "UnityMonoBridge build completed but executable was not found at {}",
            built_executable.display()
        );
    }

    let output_dir = manifest_dir.join("bin");
    std::fs::create_dir_all(&output_dir).expect("failed to create src-tauri/bin for UnityMonoBridge output");

    let bundled_executable = output_dir.join("UnityMonoBridge.exe");
    std::fs::copy(&built_executable, &bundled_executable).unwrap_or_else(|error| {
        panic!(
            "failed to copy UnityMonoBridge executable from {} to {}: {error}",
            built_executable.display(),
            bundled_executable.display()
        )
    });
}

fn emit_rerun_for_dir(directory: &Path) {
    if !directory.exists() {
        return;
    }

    let entries = std::fs::read_dir(directory).unwrap_or_else(|error| {
        panic!("failed to enumerate {} for cargo:rerun-if-changed: {error}", directory.display())
    });

    for entry in entries {
        let entry = entry.unwrap_or_else(|error| {
            panic!("failed to read entry under {}: {error}", directory.display())
        });
        let path = entry.path();
        if path.is_dir() {
            emit_rerun_for_dir(&path);
        } else {
            emit_rerun_for_path(&path);
        }
    }
}

fn emit_rerun_for_path(path: &Path) {
    println!("cargo:rerun-if-changed={}", path.display());
}

fn locate_msbuild() -> Option<PathBuf> {
    let program_files = std::env::var("ProgramFiles").ok()?;
    let root = PathBuf::from(program_files).join("Microsoft Visual Studio");
    let sub_paths: &[&[&str]] = &[
        &["MSBuild", "Current", "Bin", "MSBuild.exe"],
        &["MSBuild", "Current", "Bin", "amd64", "MSBuild.exe"],
    ];

    for version in ["18", "17"] {
        for edition in ["Community", "Professional", "Enterprise", "BuildTools"] {
            for sub_path in sub_paths {
                let candidate = sub_path
                    .iter()
                    .fold(root.join(version).join(edition), |acc, segment| acc.join(segment));

                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}
