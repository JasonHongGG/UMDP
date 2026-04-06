use crate::domain::analysis_models::{ProcessSession, RuntimeFlavor};
use crate::domain::operation::{OperationError, OperationResult};
use crate::domain::workspace::{
    RuntimeCapability, RuntimeSceneObjectComponentsCapabilityState,
    RuntimeSceneObjectComponentsCapabilityStatus, RuntimeSceneObjectComponentsStrategy,
};
use crate::infrastructure::clock::current_timestamp;
use crate::infrastructure::native::il2cpp_runtime_api::Il2CppRuntimeApi;
use crate::infrastructure::native::memory::RemoteMemory;
use crate::infrastructure::native::mono_runtime_api::MonoRuntimeApi;
use crate::infrastructure::native::process;
use crate::infrastructure::native::runtime_api::{NativeAddress, NativeMethodRecord, RuntimeApi};
use std::collections::HashMap;

pub struct RuntimeSession {
    pid: u32,
    runtime: RuntimeFlavor,
    runtime_api: Option<Box<dyn RuntimeApi>>,
    capabilities: Vec<RuntimeCapability>,
    scene_object_components: RuntimeSceneObjectComponentsCapabilityState,
}

impl RuntimeSession {
    pub fn create(process_session: &ProcessSession) -> Result<Self, String> {
        let detected_runtime = process::detect_runtime_flavor(process_session.pid)?;
        let runtime = prefer_detected_runtime(&process_session.runtime, detected_runtime);

        let runtime_api = match runtime {
            RuntimeFlavor::Mono => {
                let memory = RemoteMemory::open(process_session.pid)?;
                Some(Box::new(MonoRuntimeApi::new(memory)?) as Box<dyn RuntimeApi>)
            }
            RuntimeFlavor::Il2cpp => {
                let memory = RemoteMemory::open(process_session.pid)?;
                Some(Box::new(Il2CppRuntimeApi::new(memory)?) as Box<dyn RuntimeApi>)
            }
            RuntimeFlavor::Unknown => None,
        };

        let (capabilities, scene_object_components) =
            build_runtime_capability_profile(&runtime, runtime_api.as_deref());

        Ok(Self {
            pid: process_session.pid,
            runtime,
            runtime_api,
            capabilities,
            scene_object_components,
        })
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub fn runtime(&self) -> &RuntimeFlavor {
        &self.runtime
    }

    pub fn runtime_api(&self) -> Option<&dyn RuntimeApi> {
        self.runtime_api.as_deref()
    }

    pub fn capabilities(&self) -> &[RuntimeCapability] {
        &self.capabilities
    }

    pub fn scene_object_components(&self) -> &RuntimeSceneObjectComponentsCapabilityState {
        &self.scene_object_components
    }

    pub fn require_runtime_api(&self) -> OperationResult<&dyn RuntimeApi> {
        self.runtime_api()
            .ok_or_else(OperationError::runtime_api_unavailable)
    }

    #[cfg(test)]
    pub fn for_tests(pid: u32) -> Self {
        Self {
            pid,
            runtime: RuntimeFlavor::Unknown,
            runtime_api: None,
            capabilities: vec![RuntimeCapability::Metadata],
            scene_object_components: RuntimeSceneObjectComponentsCapabilityState::default(),
        }
    }
}

fn prefer_detected_runtime(existing: &RuntimeFlavor, detected: RuntimeFlavor) -> RuntimeFlavor {
    match detected {
        RuntimeFlavor::Unknown => existing.clone(),
        other => other,
    }
}

fn build_runtime_capability_profile(
    runtime: &RuntimeFlavor,
    runtime_api: Option<&dyn RuntimeApi>,
) -> (
    Vec<RuntimeCapability>,
    RuntimeSceneObjectComponentsCapabilityState,
) {
    let mut capabilities = base_runtime_capabilities(runtime);
    let scene_object_components = match runtime_api {
        Some(runtime_api) => probe_scene_object_components_capability(runtime_api),
        None => RuntimeSceneObjectComponentsCapabilityState::default(),
    };

    if scene_object_components.status == RuntimeSceneObjectComponentsCapabilityStatus::Supported {
        capabilities.push(RuntimeCapability::SceneObjectComponentsRead);
    }

    (capabilities, scene_object_components)
}

fn base_runtime_capabilities(runtime: &RuntimeFlavor) -> Vec<RuntimeCapability> {
    match runtime {
        RuntimeFlavor::Mono | RuntimeFlavor::Il2cpp => vec![
            RuntimeCapability::Metadata,
            RuntimeCapability::PreviewQuery,
            RuntimeCapability::Execution,
            RuntimeCapability::FieldRead,
            RuntimeCapability::FieldWrite,
            RuntimeCapability::MethodInvoke,
            RuntimeCapability::SceneCatalogRead,
            RuntimeCapability::SceneObjectHeaderRead,
            RuntimeCapability::SceneObjectChildrenRead,
        ],
        RuntimeFlavor::Unknown => vec![RuntimeCapability::Metadata],
    }
}

fn probe_scene_object_components_capability(
    runtime_api: &dyn RuntimeApi,
) -> RuntimeSceneObjectComponentsCapabilityState {
    let checked_at = Some(current_timestamp());
    let mut probe = RuntimeSceneComponentsCapabilityProbe::new(runtime_api);

    match probe.probe_indexed_strategy() {
        Ok(()) => RuntimeSceneObjectComponentsCapabilityState {
            status: RuntimeSceneObjectComponentsCapabilityStatus::Supported,
            strategy: Some(RuntimeSceneObjectComponentsStrategy::IndexedGameObjectApi),
            reason: None,
            checked_at,
        },
        Err(indexed_error) => match probe.probe_get_components_by_type_strategy() {
            Ok(()) => RuntimeSceneObjectComponentsCapabilityState {
                status: RuntimeSceneObjectComponentsCapabilityStatus::Supported,
                strategy: Some(RuntimeSceneObjectComponentsStrategy::GetComponentsByType),
                reason: None,
                checked_at,
            },
            Err(type_error) => RuntimeSceneObjectComponentsCapabilityState {
                status: RuntimeSceneObjectComponentsCapabilityStatus::Unsupported,
                strategy: None,
                reason: Some(format!(
                    "Scene object component materialization is unavailable for this runtime session. {indexed_error} {type_error}"
                )),
                checked_at,
            },
        },
    }
}

struct RuntimeSceneComponentsCapabilityProbe<'a> {
    runtime_api: &'a dyn RuntimeApi,
    class_cache: HashMap<String, NativeAddress>,
    method_cache: HashMap<String, Option<NativeMethodRecord>>,
}

impl<'a> RuntimeSceneComponentsCapabilityProbe<'a> {
    fn new(runtime_api: &'a dyn RuntimeApi) -> Self {
        Self {
            runtime_api,
            class_cache: HashMap::new(),
            method_cache: HashMap::new(),
        }
    }

    fn probe_indexed_strategy(&mut self) -> Result<(), String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        if self
            .try_find_method(game_object_class, "GetComponentCount", 0)?
            .is_none()
        {
            return Err(
                "Indexed GameObject component APIs are unavailable because GameObject.GetComponentCount is missing."
                    .to_string(),
            );
        }

        if self
            .try_find_method(game_object_class, "QueryComponentAtIndex", 1)?
            .or(self.try_find_method(game_object_class, "GetComponentAtIndex", 1)?)
            .is_none()
        {
            return Err(
                "Indexed GameObject component APIs are unavailable because QueryComponentAtIndex/GetComponentAtIndex is missing."
                    .to_string(),
            );
        }

        Ok(())
    }

    fn probe_get_components_by_type_strategy(&mut self) -> Result<(), String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        self.resolve_unity_class("UnityEngine", "Component")?;

        if self
            .try_find_method_by_parameter_types(game_object_class, "GetComponents", &["System.Type"])?
            .is_none()
        {
            return Err(
                "GetComponents(Type) component materialization is unavailable because GameObject.GetComponents(System.Type) is missing."
                    .to_string(),
            );
        }

        Ok(())
    }

    fn resolve_unity_class(
        &mut self,
        class_namespace: &str,
        class_name: &str,
    ) -> Result<NativeAddress, String> {
        let cache_key = format!("{class_namespace}.{class_name}");
        if let Some(class_handle) = self.class_cache.get(&cache_key).copied() {
            return Ok(class_handle);
        }

        for image_name in ["UnityEngine.CoreModule", "UnityEngine"] {
            if let Ok(image) = self.resolve_image(image_name) {
                if let Ok(class_handle) = self
                    .runtime_api
                    .resolve_class(image, class_namespace, class_name)
                {
                    self.class_cache.insert(cache_key, class_handle);
                    return Ok(class_handle);
                }
            }
        }

        Err(format!(
            "Unity class {class_namespace}.{class_name} could not be resolved."
        ))
    }

    fn resolve_image(&self, image_name: &str) -> Result<NativeAddress, String> {
        let expected = image_name.to_ascii_lowercase();
        let expected_without_extension = expected.strip_suffix(".dll").unwrap_or(&expected);
        for assembly in self.runtime_api.enumerate_assemblies()? {
            let image = self.runtime_api.get_assembly_image(assembly)?;
            if image == 0 {
                continue;
            }
            let actual_name = self.runtime_api.get_image_name(image)?.to_ascii_lowercase();
            let actual_without_extension = actual_name.strip_suffix(".dll").unwrap_or(&actual_name);
            if actual_name == expected || actual_without_extension == expected_without_extension {
                return Ok(image);
            }
        }

        Err(format!("Unity image {image_name} could not be resolved."))
    }

    fn try_find_method(
        &mut self,
        class_handle: NativeAddress,
        method_name: &str,
        parameter_count: usize,
    ) -> Result<Option<NativeMethodRecord>, String> {
        let cache_key = format!("{class_handle}::{method_name}/{parameter_count}");
        if let Some(found) = self.method_cache.get(&cache_key) {
            return Ok(found.clone());
        }

        let mut current_class = class_handle;
        while current_class != 0 {
            let methods = self.runtime_api.enumerate_methods(current_class)?;
            if let Some(found) = methods.into_iter().find(|method| {
                method.name == method_name && method.parameter_types.len() == parameter_count
            }) {
                self.method_cache.insert(cache_key, Some(found.clone()));
                return Ok(Some(found));
            }
            current_class = self.runtime_api.get_parent_class(current_class)?;
        }

        self.method_cache.insert(cache_key, None);
        Ok(None)
    }

    fn try_find_method_by_parameter_types(
        &mut self,
        class_handle: NativeAddress,
        method_name: &str,
        parameter_types: &[&str],
    ) -> Result<Option<NativeMethodRecord>, String> {
        let normalized_types = parameter_types
            .iter()
            .map(|value| normalize_scene_type_name(value))
            .collect::<Vec<_>>();
        let cache_key = format!(
            "{class_handle}::{method_name}[{}]",
            normalized_types.join(",")
        );
        if let Some(found) = self.method_cache.get(&cache_key) {
            return Ok(found.clone());
        }

        let mut current_class = class_handle;
        while current_class != 0 {
            let methods = self.runtime_api.enumerate_methods(current_class)?;
            if let Some(found) = methods.into_iter().find(|method| {
                method.name == method_name
                    && method.parameter_types.len() == normalized_types.len()
                    && method
                        .parameter_types
                        .iter()
                        .map(|value| normalize_scene_type_name(value))
                        .eq(normalized_types.iter().cloned())
            }) {
                self.method_cache.insert(cache_key, Some(found.clone()));
                return Ok(Some(found));
            }
            current_class = self.runtime_api.get_parent_class(current_class)?;
        }

        self.method_cache.insert(cache_key, None);
        Ok(None)
    }
}

fn normalize_scene_type_name(value: &str) -> String {
    value
        .trim()
        .trim_end_matches('&')
        .split(',')
        .next()
        .unwrap_or(value)
        .trim()
        .replace(' ', "")
}
