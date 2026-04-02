use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    build_managed_metadata_reader();
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
    println!("cargo:rerun-if-changed={}", project_dir.join("MetadataSource.cs").display());

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
