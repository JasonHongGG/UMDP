use crate::domain::analysis_models::{
    RuntimeQuaternionSnapshot, RuntimeSceneBuildSettingsEntry,
    RuntimeSceneCatalogSnapshot, RuntimeSceneChildrenPageSnapshot,
    RuntimeSceneChildrenSnapshot, RuntimeSceneComponentSummary,
    RuntimeSceneComponentsPageSnapshot, RuntimeSceneDescriptor,
    RuntimeSceneHierarchyPathEntry, RuntimeSceneKind,
    RuntimeSceneMutationOperation, RuntimeSceneMutationResult,
    RuntimeSceneNodeSummary, RuntimeSceneObjectInspectorHeaderSnapshot,
    RuntimeSceneObjectInspectorSnapshot, RuntimeSceneTransformSnapshot,
    RuntimeSceneSelectionHint, RuntimeSceneTransformUpdate,
    RuntimeVector3Snapshot,
};
use crate::infrastructure::clock::current_timestamp;
use crate::infrastructure::native::memory::{RemoteAllocation, RemoteMemory};
use crate::infrastructure::native::runtime_api::{
    NativeAddress, NativeFieldRecord, NativeMethodRecord, RuntimeApi,
};
use crate::kernel::runtime::session::RuntimeSession;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq)]
enum NodeSummaryFlavor {
    Catalog,
    Inspector,
    InspectorChild,
}

enum SceneInvokeArgument {
    Number(i32),
    Boolean(bool),
    String(String),
    Address(NativeAddress),
    Null,
    Bytes(Vec<u8>),
}

struct ScenePage<T> {
    items: Vec<T>,
    total_count: usize,
    next_offset: Option<usize>,
}

struct SceneQueryKernel<'a> {
    runtime_api: &'a dyn RuntimeApi,
    memory: RemoteMemory,
    class_cache: HashMap<String, NativeAddress>,
    method_cache: HashMap<String, Option<NativeMethodRecord>>,
    field_cache: HashMap<String, Option<NativeFieldRecord>>,
    type_name_cache: HashMap<NativeAddress, String>,
    hierarchy_cache: HashMap<NativeAddress, Vec<RuntimeSceneHierarchyPathEntry>>,
}

pub fn load_scene_catalog(
    runtime_session: &RuntimeSession,
) -> Result<RuntimeSceneCatalogSnapshot, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.load_scene_catalog()
}

pub fn load_scene_children(
    runtime_session: &RuntimeSession,
    object_address: &str,
) -> Result<RuntimeSceneChildrenSnapshot, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    let object_address = parse_address(object_address)?;
    kernel.load_scene_children(object_address)
}

pub fn load_scene_children_page(
    runtime_session: &RuntimeSession,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneChildrenPageSnapshot, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    let object_address = parse_address(object_address)?;
    kernel.load_scene_children_page(object_address, offset, limit)
}

pub fn load_scene_inspector(
    runtime_session: &RuntimeSession,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    let object_address = parse_address(object_address)?;
    kernel.load_scene_inspector(object_address)
}

pub fn load_scene_inspector_header(
    runtime_session: &RuntimeSession,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorHeaderSnapshot, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    let object_address = parse_address(object_address)?;
    kernel.load_scene_inspector_header(object_address)
}

pub fn load_scene_inspector_children_page(
    runtime_session: &RuntimeSession,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneChildrenPageSnapshot, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    let object_address = parse_address(object_address)?;
    kernel.load_scene_inspector_children_page(object_address, offset, limit)
}

pub fn load_scene_inspector_components_page(
    runtime_session: &RuntimeSession,
    object_address: &str,
    offset: usize,
    limit: usize,
) -> Result<RuntimeSceneComponentsPageSnapshot, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    let object_address = parse_address(object_address)?;
    kernel.load_scene_inspector_components_page(object_address, offset, limit)
}

pub fn create_scene_child(
    runtime_session: &RuntimeSession,
    parent_object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.create_scene_child(parse_address(parent_object_address)?, name)
}

pub fn create_scene_root(
    runtime_session: &RuntimeSession,
    scene_handle: i32,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.create_scene_root(scene_handle, name)
}

pub fn duplicate_scene_object(
    runtime_session: &RuntimeSession,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.duplicate_scene_object(parse_address(object_address)?)
}

pub fn delete_scene_object(
    runtime_session: &RuntimeSession,
    object_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.delete_scene_object(parse_address(object_address)?)
}

pub fn rename_scene_object(
    runtime_session: &RuntimeSession,
    object_address: &str,
    name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.rename_scene_object(parse_address(object_address)?, name)
}

pub fn set_scene_object_tag(
    runtime_session: &RuntimeSession,
    object_address: &str,
    tag: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.set_scene_object_tag(parse_address(object_address)?, tag)
}

pub fn set_scene_object_layer(
    runtime_session: &RuntimeSession,
    object_address: &str,
    layer: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.set_scene_object_layer(parse_address(object_address)?, layer)
}

pub fn set_scene_object_hide_flags(
    runtime_session: &RuntimeSession,
    object_address: &str,
    hide_flags: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.set_scene_object_hide_flags(parse_address(object_address)?, hide_flags)
}

pub fn reparent_scene_object(
    runtime_session: &RuntimeSession,
    object_address: &str,
    parent_object_address: Option<&str>,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.reparent_scene_object(
        parse_address(object_address)?,
        parent_object_address.map(parse_address).transpose()?,
    )
}

pub fn set_scene_object_active(
    runtime_session: &RuntimeSession,
    object_address: &str,
    active_self: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.set_scene_object_active(parse_address(object_address)?, active_self)
}

pub fn set_scene_object_transform(
    runtime_session: &RuntimeSession,
    object_address: &str,
    transform_update: &RuntimeSceneTransformUpdate,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.set_scene_object_transform(parse_address(object_address)?, transform_update)
}

pub fn set_scene_behaviour_enabled(
    runtime_session: &RuntimeSession,
    component_address: &str,
    enabled: bool,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.set_scene_behaviour_enabled(parse_address(component_address)?, enabled)
}

pub fn create_scene_component(
    runtime_session: &RuntimeSession,
    object_address: &str,
    component_type_name: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.create_scene_component(parse_address(object_address)?, component_type_name)
}

pub fn delete_scene_component(
    runtime_session: &RuntimeSession,
    component_address: &str,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.delete_scene_component(parse_address(component_address)?)
}

pub fn load_scene_by_build_index(
    runtime_session: &RuntimeSession,
    build_index: i32,
) -> Result<RuntimeSceneMutationResult, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.load_scene_by_build_index(build_index)
}

impl<'a> SceneQueryKernel<'a> {
    fn new(runtime_session: &'a RuntimeSession) -> Result<Self, String> {
        let runtime_api = runtime_session
            .runtime_api()
            .ok_or_else(|| "Native runtime session is missing its runtime API".to_string())?;

        Ok(Self {
            runtime_api,
            memory: RemoteMemory::open(runtime_session.pid())?,
            class_cache: HashMap::new(),
            method_cache: HashMap::new(),
            field_cache: HashMap::new(),
            type_name_cache: HashMap::new(),
            hierarchy_cache: HashMap::new(),
        })
    }

    fn load_scene_catalog(&mut self) -> Result<RuntimeSceneCatalogSnapshot, String> {
        let scene_manager_class = self.resolve_unity_class(
            "UnityEngine.SceneManagement",
            "SceneManager",
        )?;
        let scene_class = self.resolve_unity_class("UnityEngine.SceneManagement", "Scene")?;
        let scene_utility_class = self
            .resolve_unity_class("UnityEngine.SceneManagement", "SceneUtility")
            .ok();

        let get_scene_count = self.require_method(scene_manager_class, "get_sceneCount", 0)?;
        let get_scene_at = self.require_method(scene_manager_class, "GetSceneAt", 1)?;
        let get_root_game_objects = self.require_method(scene_class, "GetRootGameObjects", 0)?;
        let is_valid = self.try_find_method(scene_class, "IsValid", 0)?;
        let get_is_loaded = self.try_find_method(scene_class, "get_isLoaded", 0)?;
        let get_build_index = self.try_find_method(scene_class, "get_buildIndex", 0)?;
        let get_path = self.try_find_method(scene_class, "get_path", 0)?;
        let get_scene_count_in_build_settings = match scene_utility_class {
            Some(class) => self.try_find_method(class, "get_sceneCountInBuildSettings", 0)?,
            None => None,
        };
        let get_scene_path_by_build_index = match scene_utility_class {
            Some(class) => self.try_find_method(class, "GetScenePathByBuildIndex", 1)?,
            None => None,
        };

        let scene_count = self.invoke_int(&get_scene_count, None, &[])?;
        let mut scenes = Vec::new();
        for index in 0..scene_count {
            let scene_boxed = self.invoke_object(
                &get_scene_at,
                None,
                &[SceneInvokeArgument::Number(index)],
            )?;
            if scene_boxed == 0 {
                continue;
            }

            let raw_scene = self.require_unboxed(scene_boxed, "SceneManager.GetSceneAt result")?;
            if let Some(method) = &is_valid {
                if !self.invoke_bool(method, Some(raw_scene), &[])? {
                    continue;
                }
            }
            if let Some(method) = &get_is_loaded {
                if !self.invoke_bool(method, Some(raw_scene), &[])? {
                    continue;
                }
            }

            let (scene_handle, scene_name) = self.read_scene_identity(scene_boxed)?;
            let Some(scene_handle) = scene_handle else {
                continue;
            };

            let root_array = match self.invoke_object(&get_root_game_objects, Some(raw_scene), &[]) {
                Ok(root_array) => root_array,
                Err(error) => {
                    if error.contains("scene is invalid") {
                        continue;
                    }
                    return Err(format!(
                        "scene refresh failed at scene index {index} handle {scene_handle}: {error}"
                    ));
                }
            };

            let build_index = match &get_build_index {
                Some(method) => Some(self.invoke_int(method, Some(raw_scene), &[])?),
                None => None,
            };
            let path = match &get_path {
                Some(method) => self
                    .try_invoke_string(method, Some(raw_scene), &[])?
                    .filter(|value| !value.is_empty()),
                None => None,
            };

            let mut roots = Vec::new();
            let root_count = self.runtime_api.get_array_length(root_array)?;
            for root_index in 0..root_count {
                let root_object = self
                    .runtime_api
                    .get_array_element_address(root_array, root_index)?;
                if root_object != 0 {
                    roots.push(self.build_node_summary(
                        root_object,
                        NodeSummaryFlavor::Catalog,
                        None,
                    )?);
                }
            }

            let resolved_scene_name = scene_name
                .clone()
                .unwrap_or_else(|| format!("Scene {scene_handle}"));

            scenes.push(RuntimeSceneDescriptor {
                scene_handle,
                name: resolved_scene_name,
                is_loaded: true,
                kind: infer_scene_kind(build_index, path.clone(), scene_name),
                build_index,
                path,
                roots,
            });
        }

        let mut build_settings_scenes = Vec::new();
        if let (Some(scene_utility_class), Some(get_scene_count_in_build_settings), Some(get_scene_path_by_build_index)) = (
            scene_utility_class,
            get_scene_count_in_build_settings,
            get_scene_path_by_build_index,
        ) {
            let count = self.invoke_int(&get_scene_count_in_build_settings, None, &[])?;
            for build_index in 0..count {
                let path = self.try_invoke_string(
                    &get_scene_path_by_build_index,
                    None,
                    &[SceneInvokeArgument::Number(build_index)],
                )?;
                let Some(path) = path.filter(|value| !value.is_empty()) else {
                    continue;
                };

                build_settings_scenes.push(RuntimeSceneBuildSettingsEntry {
                    build_index,
                    name: scene_name_from_path(&path),
                    is_loaded: scenes.iter().any(|scene| scene.build_index == Some(build_index)),
                    path,
                });
            }
            let _ = scene_utility_class;
        }

        Ok(RuntimeSceneCatalogSnapshot {
            generated_at: current_timestamp(),
            scenes,
            build_settings_scenes,
        })
    }

    fn load_scene_children(
        &mut self,
        object_address: NativeAddress,
    ) -> Result<RuntimeSceneChildrenSnapshot, String> {
        Ok(RuntimeSceneChildrenSnapshot {
            parent_object_address: format_address(object_address),
            children: self
                .load_children_for_object(object_address, NodeSummaryFlavor::Catalog, 0, None)?
                .items,
        })
    }

    fn load_scene_children_page(
        &mut self,
        object_address: NativeAddress,
        offset: usize,
        limit: usize,
    ) -> Result<RuntimeSceneChildrenPageSnapshot, String> {
        let page = self.load_children_for_object(
            object_address,
            NodeSummaryFlavor::Catalog,
            offset,
            Some(limit),
        )?;
        Ok(RuntimeSceneChildrenPageSnapshot {
            generated_at: current_timestamp(),
            parent_object_address: format_address(object_address),
            offset,
            total_count: page.total_count,
            next_offset: page.next_offset,
            children: page.items,
        })
    }

    fn load_scene_inspector(
        &mut self,
        object_address: NativeAddress,
    ) -> Result<RuntimeSceneObjectInspectorSnapshot, String> {
        let header = self.load_scene_inspector_header(object_address)?;
        let children = self
            .load_children_for_object(object_address, NodeSummaryFlavor::InspectorChild, 0, None)?
            .items;
        let components = self.load_components_for_object(object_address, 0, None)?.items;

        Ok(RuntimeSceneObjectInspectorSnapshot {
            generated_at: header.generated_at,
            scene_handle: header.scene_handle,
            scene_name: header.scene_name,
            scene_kind: header.scene_kind,
            object: header.object,
            parent: header.parent,
            hierarchy_path: header.hierarchy_path,
            children,
            components,
            transform: header.transform,
        })
    }

    fn load_scene_inspector_header(
        &mut self,
        object_address: NativeAddress,
    ) -> Result<RuntimeSceneObjectInspectorHeaderSnapshot, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let scene_class = self.resolve_unity_class("UnityEngine.SceneManagement", "Scene")?;
        let get_scene = self.require_method(game_object_class, "get_scene", 0)?;
        let get_transform = self.require_method(game_object_class, "get_transform", 0)?;

        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        let scene_object = self.invoke_object(&get_scene, Some(object_address), &[])?;
        let (scene_handle, scene_name) = self.read_scene_identity(scene_object)?;
        let scene_kind = if scene_handle.is_some() {
            let raw_scene = self.require_unboxed(scene_object, "UnityEngine.SceneManagement.Scene")?;
            let get_build_index = self.try_find_method(scene_class, "get_buildIndex", 0)?;
            let get_path = self.try_find_method(scene_class, "get_path", 0)?;
            let build_index = match &get_build_index {
                Some(method) => Some(self.invoke_int(method, Some(raw_scene), &[])?),
                None => None,
            };
            let path = match &get_path {
                Some(method) => self.try_invoke_string(method, Some(raw_scene), &[] )?,
                None => None,
            };
            Some(infer_scene_kind(build_index, path, scene_name.clone()))
        } else {
            None
        };

        let transform_address = self.invoke_object(&get_transform, Some(object_address), &[])?;
        let transform = self.build_transform_snapshot(transform_address)?;
        let hierarchy_path = self.build_hierarchy_path(object_address)?;
        let parent = if let Some(transform) = &transform {
            match &transform.parent_object_address {
                Some(parent_object_address) => {
                    let parent_object = parse_address(parent_object_address)?;
                    if parent_object == 0 {
                        None
                    } else {
                        let parent_transform = transform
                            .parent_transform_address
                            .as_deref()
                            .map(parse_address)
                            .transpose()?;
                        Some(self.build_node_summary(
                            parent_object,
                            NodeSummaryFlavor::Inspector,
                            parent_transform,
                        )?)
                    }
                }
                None => None,
            }
        } else {
            None
        };

        Ok(RuntimeSceneObjectInspectorHeaderSnapshot {
            generated_at: current_timestamp(),
            scene_handle,
            scene_name,
            scene_kind,
            object,
            parent,
            hierarchy_path,
            transform,
        })
    }

    fn load_scene_inspector_children_page(
        &mut self,
        object_address: NativeAddress,
        offset: usize,
        limit: usize,
    ) -> Result<RuntimeSceneChildrenPageSnapshot, String> {
        let page = self.load_children_for_object(
            object_address,
            NodeSummaryFlavor::InspectorChild,
            offset,
            Some(limit),
        )?;
        Ok(RuntimeSceneChildrenPageSnapshot {
            generated_at: current_timestamp(),
            parent_object_address: format_address(object_address),
            offset,
            total_count: page.total_count,
            next_offset: page.next_offset,
            children: page.items,
        })
    }

    fn load_scene_inspector_components_page(
        &mut self,
        object_address: NativeAddress,
        offset: usize,
        limit: usize,
    ) -> Result<RuntimeSceneComponentsPageSnapshot, String> {
        let page = self.load_components_for_object(object_address, offset, Some(limit))?;
        Ok(RuntimeSceneComponentsPageSnapshot {
            generated_at: current_timestamp(),
            object_address: format_address(object_address),
            offset,
            total_count: page.total_count,
            next_offset: page.next_offset,
            components: page.items,
        })
    }

    fn create_scene_child(
        &mut self,
        parent_object_address: NativeAddress,
        name: &str,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let get_transform = self.require_method(game_object_class, "get_transform", 0)?;

        let child_object = self.create_managed_object(game_object_class, "UnityEngine.GameObject")?;
        if let Some(ctor_with_name) = self.try_find_method_by_parameter_types(
            game_object_class,
            ".ctor",
            &["System.String"],
        )? {
            self.invoke_void(
                &ctor_with_name,
                Some(child_object),
                &[SceneInvokeArgument::String(name.to_string())],
            )?;
        } else {
            let ctor_without_name = self.require_method(game_object_class, ".ctor", 0)?;
            self.invoke_void(&ctor_without_name, Some(child_object), &[])?;
            if let Some(set_name) = self.try_find_method_by_parameter_types(
                game_object_class,
                "set_name",
                &["System.String"],
            )? {
                self.invoke_void(
                    &set_name,
                    Some(child_object),
                    &[SceneInvokeArgument::String(name.to_string())],
                )?;
            }
        }

        let parent_transform = self.invoke_object(&get_transform, Some(parent_object_address), &[])?;
        let child_transform = self.invoke_object(&get_transform, Some(child_object), &[])?;
        if parent_transform != 0 && child_transform != 0 {
            if let Some(set_parent) = self.try_find_method_by_parameter_types(
                transform_class,
                "SetParent",
                &["UnityEngine.Transform"],
            )? {
                self.invoke_void(
                    &set_parent,
                    Some(child_transform),
                    &[SceneInvokeArgument::Address(parent_transform)],
                )?;
            } else {
                let set_parent_world = self.require_method_by_parameter_types(
                    transform_class,
                    "SetParent",
                    &["UnityEngine.Transform", "System.Boolean"],
                )?;
                self.invoke_void(
                    &set_parent_world,
                    Some(child_transform),
                    &[
                        SceneInvokeArgument::Address(parent_transform),
                        SceneInvokeArgument::Boolean(false),
                    ],
                )?;
            }
        }

        let object = self.build_node_summary(child_object, NodeSummaryFlavor::Inspector, None)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::CreateChild,
            scene_handle: self.read_scene_handle_for_object(child_object)?,
            target_object_address: Some(format_address(child_object)),
            parent_object_address: Some(format_address(parent_object_address)),
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(child_object)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path: Vec::new(),
            transform: None,
        })
    }

    fn create_scene_root(
        &mut self,
        scene_handle: i32,
        name: &str,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let scene_manager_class = self.resolve_unity_class(
            "UnityEngine.SceneManagement",
            "SceneManager",
        )?;

        let root_object = self.create_managed_object(game_object_class, "UnityEngine.GameObject")?;
        if let Some(ctor_with_name) = self.try_find_method_by_parameter_types(
            game_object_class,
            ".ctor",
            &["System.String"],
        )? {
            self.invoke_void(
                &ctor_with_name,
                Some(root_object),
                &[SceneInvokeArgument::String(name.to_string())],
            )?;
        } else {
            let ctor_without_name = self.require_method(game_object_class, ".ctor", 0)?;
            self.invoke_void(&ctor_without_name, Some(root_object), &[])?;
            if let Some(set_name) = self.try_find_method_by_parameter_types(
                game_object_class,
                "set_name",
                &["System.String"],
            )? {
                self.invoke_void(
                    &set_name,
                    Some(root_object),
                    &[SceneInvokeArgument::String(name.to_string())],
                )?;
            }
        }

        if scene_handle > 0 {
            let scene_boxed = self.try_resolve_loaded_scene_boxed_address(scene_handle)?;
            let move_to_scene = self.try_find_method_by_parameter_types(
                scene_manager_class,
                "MoveGameObjectToScene",
                &["UnityEngine.GameObject", "UnityEngine.SceneManagement.Scene"],
            )?;
            if let (Some(scene_boxed), Some(move_to_scene)) = (scene_boxed, move_to_scene) {
                let raw_scene = self.require_unboxed(
                    scene_boxed,
                    "UnityEngine.SceneManagement.Scene",
                )?;
                self.invoke_void(
                    &move_to_scene,
                    None,
                    &[
                        SceneInvokeArgument::Address(root_object),
                        SceneInvokeArgument::Address(raw_scene),
                    ],
                )?;
            }
        }

        let object = self.build_node_summary(root_object, NodeSummaryFlavor::Inspector, None)?;
        let hierarchy_path = self.build_hierarchy_path(root_object)?;
        let selection_hint = Some(RuntimeSceneSelectionHint {
            scene_handle: self.read_scene_handle_for_object(root_object)?,
            object_address: format_address(root_object),
            ancestor_object_addresses: Vec::new(),
        });
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::CreateRoot,
            scene_handle: self.read_scene_handle_for_object(root_object)?,
            target_object_address: Some(format_address(root_object)),
            parent_object_address: None,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(root_object)),
            preferred_selection_hint: selection_hint,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path,
            transform: None,
        })
    }

    fn duplicate_scene_object(
        &mut self,
        object_address: NativeAddress,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let object_class = self.resolve_unity_class("UnityEngine", "Object")?;
        let instantiate = self.require_method_by_parameter_types(
            object_class,
            "Instantiate",
            &["UnityEngine.Object"],
        )?;
        let duplicated_object = self.invoke_object(
            &instantiate,
            None,
            &[SceneInvokeArgument::Address(object_address)],
        )?;
        let parent_object_address = self
            .try_read_parent_object_address(duplicated_object)?
            .map(format_address);
        let object = self.build_node_summary(duplicated_object, NodeSummaryFlavor::Inspector, None)?;

        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::Duplicate,
            scene_handle: self.read_scene_handle_for_object(duplicated_object)?,
            target_object_address: Some(format_address(duplicated_object)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(duplicated_object)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path: Vec::new(),
            transform: None,
        })
    }

    fn delete_scene_object(
        &mut self,
        object_address: NativeAddress,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let object_class = self.resolve_unity_class("UnityEngine", "Object")?;
        let parent_object_address = self
            .try_read_parent_object_address(object_address)?
            .map(format_address);
        let scene_handle = self.read_scene_handle_for_object(object_address)?;
        if let Some(destroy_immediate) = self.try_find_method_by_parameter_types(
            object_class,
            "DestroyImmediate",
            &["UnityEngine.Object"],
        )? {
            self.invoke_void(
                &destroy_immediate,
                None,
                &[SceneInvokeArgument::Address(object_address)],
            )?;
        } else {
            let destroy = self.require_method_by_parameter_types(
                object_class,
                "Destroy",
                &["UnityEngine.Object"],
            )?;
            self.invoke_void(
                &destroy,
                None,
                &[SceneInvokeArgument::Address(object_address)],
            )?;
        }

        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::Delete,
            scene_handle,
            target_object_address: Some(format_address(object_address)),
            parent_object_address: parent_object_address.clone(),
            object: None,
            deleted_object_address: Some(format_address(object_address)),
            preferred_selection_address: parent_object_address,
            preferred_selection_hint: None,
            active_self: None,
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path: Vec::new(),
            transform: None,
        })
    }

    fn rename_scene_object(
        &mut self,
        object_address: NativeAddress,
        name: &str,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let set_name = self.require_method_by_parameter_types(
            game_object_class,
            "set_name",
            &["System.String"],
        )?;
        self.invoke_void(
            &set_name,
            Some(object_address),
            &[SceneInvokeArgument::String(name.to_string())],
        )?;

        let parent_object_address = self
            .try_read_parent_object_address(object_address)?
            .map(format_address);
        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        let hierarchy_path = self.build_hierarchy_path(object_address)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::Rename,
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            target_object_address: Some(format_address(object_address)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(object_address)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path,
            transform: None,
        })
    }

    fn set_scene_object_tag(
        &mut self,
        object_address: NativeAddress,
        tag: &str,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let set_tag = self.require_method_by_parameter_types(
            game_object_class,
            "set_tag",
            &["System.String"],
        )?;
        self.invoke_void(
            &set_tag,
            Some(object_address),
            &[SceneInvokeArgument::String(tag.to_string())],
        )?;

        let parent_object_address = self
            .try_read_parent_object_address(object_address)?
            .map(format_address);
        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        let hierarchy_path = self.build_hierarchy_path(object_address)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::SetTag,
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            target_object_address: Some(format_address(object_address)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(object_address)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: object.tag.clone(),
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path,
            transform: None,
        })
    }

    fn set_scene_object_layer(
        &mut self,
        object_address: NativeAddress,
        layer: i32,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let set_layer = self.require_method_by_parameter_types(
            game_object_class,
            "set_layer",
            &["System.Int32"],
        )?;
        self.invoke_void(
            &set_layer,
            Some(object_address),
            &[SceneInvokeArgument::Number(layer)],
        )?;

        let parent_object_address = self
            .try_read_parent_object_address(object_address)?
            .map(format_address);
        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        let hierarchy_path = self.build_hierarchy_path(object_address)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::SetLayer,
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            target_object_address: Some(format_address(object_address)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(object_address)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: object.layer,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path,
            transform: None,
        })
    }

    fn set_scene_object_hide_flags(
        &mut self,
        object_address: NativeAddress,
        hide_flags: &str,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let object_class = self.resolve_unity_class("UnityEngine", "Object")?;
        let enum_type = self.resolve_managed_type_object(
            "UnityEngine.HideFlags",
            "UnityEngine.CoreModule",
        )?;
        let enum_class = self.resolve_managed_class_any_image("System", "Enum")?;
        let parse_enum = self.require_method_by_parameter_types(
            enum_class,
            "Parse",
            &["System.Type", "System.String", "System.Boolean"],
        )?;
        let boxed_enum = self.invoke_object(
            &parse_enum,
            None,
            &[
                SceneInvokeArgument::Address(enum_type),
                SceneInvokeArgument::String(hide_flags.to_string()),
                SceneInvokeArgument::Boolean(true),
            ],
        )?;
        if boxed_enum == 0 {
            return Err("failed to parse UnityEngine.HideFlags value".to_string());
        }

        let set_hide_flags = self.require_method_by_parameter_types(
            object_class,
            "set_hideFlags",
            &["UnityEngine.HideFlags"],
        )?;
        let raw_hide_flags = self.require_unboxed(boxed_enum, "UnityEngine.HideFlags")?;
        let hide_flags_value: i32 = self.memory.read_value(raw_hide_flags)?;
        self.invoke_void(
            &set_hide_flags,
            Some(object_address),
            &[SceneInvokeArgument::Bytes(hide_flags_value.to_ne_bytes().to_vec())],
        )?;

        let parent_object_address = self
            .try_read_parent_object_address(object_address)?
            .map(format_address);
        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        let hierarchy_path = self.build_hierarchy_path(object_address)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::SetHideFlags,
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            target_object_address: Some(format_address(object_address)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(object_address)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: object.hide_flags.clone(),
            behaviour_enabled: None,
            hierarchy_path,
            transform: None,
        })
    }

    fn reparent_scene_object(
        &mut self,
        object_address: NativeAddress,
        parent_object_address: Option<NativeAddress>,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let get_transform = self.require_method(game_object_class, "get_transform", 0)?;

        let transform_address = self.invoke_object(&get_transform, Some(object_address), &[])?;
        if transform_address == 0 {
            return Err("failed to resolve object transform".to_string());
        }

        let parent_transform = if let Some(parent_object_address) = parent_object_address {
            let resolved_parent_transform = self.invoke_object(
                &get_transform,
                Some(parent_object_address),
                &[],
            )?;
            if resolved_parent_transform == 0 {
                return Err("failed to resolve target parent transform".to_string());
            }
            Some(resolved_parent_transform)
        } else {
            None
        };

        if let Some(set_parent_with_world) = self.try_find_method_by_parameter_types(
            transform_class,
            "SetParent",
            &["UnityEngine.Transform", "System.Boolean"],
        )? {
            self.invoke_void(
                &set_parent_with_world,
                Some(transform_address),
                &[
                    parent_transform
                        .map(SceneInvokeArgument::Address)
                        .unwrap_or(SceneInvokeArgument::Null),
                    SceneInvokeArgument::Boolean(false),
                ],
            )?;
        } else {
            let set_parent = self.require_method_by_parameter_types(
                transform_class,
                "SetParent",
                &["UnityEngine.Transform"],
            )?;
            self.invoke_void(
                &set_parent,
                Some(transform_address),
                &[parent_transform
                    .map(SceneInvokeArgument::Address)
                    .unwrap_or(SceneInvokeArgument::Null)],
            )?;
        }

        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        let hierarchy_path = self.build_hierarchy_path(object_address)?;
        let selection_hint = Some(RuntimeSceneSelectionHint {
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            object_address: format_address(object_address),
            ancestor_object_addresses: hierarchy_path
                .iter()
                .filter(|entry| entry.object_address != format_address(object_address))
                .map(|entry| entry.object_address.clone())
                .collect(),
        });

        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::Reparent,
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            target_object_address: Some(format_address(object_address)),
            parent_object_address: parent_object_address.map(format_address),
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(object_address)),
            preferred_selection_hint: selection_hint,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path,
            transform: None,
        })
    }

    fn set_scene_object_active(
        &mut self,
        object_address: NativeAddress,
        active_self: bool,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let set_active = self.require_method_by_parameter_types(
            game_object_class,
            "SetActive",
            &["System.Boolean"],
        )?;
        self.invoke_void(
            &set_active,
            Some(object_address),
            &[SceneInvokeArgument::Boolean(active_self)],
        )?;

        let parent_object_address = self
            .try_read_parent_object_address(object_address)?
            .map(format_address);
        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::SetActive,
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            target_object_address: Some(format_address(object_address)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(object_address)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path: Vec::new(),
            transform: None,
        })
    }

    fn set_scene_object_transform(
        &mut self,
        object_address: NativeAddress,
        transform_update: &RuntimeSceneTransformUpdate,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let get_transform = self.require_method(game_object_class, "get_transform", 0)?;
        let transform_address = self.invoke_object(&get_transform, Some(object_address), &[])?;
        if transform_address == 0 {
            return Err("failed to resolve object transform".to_string());
        }

        if let Some(world_position) = &transform_update.world_position {
            let set_position = self.require_method_by_parameter_types(
                transform_class,
                "set_position",
                &["UnityEngine.Vector3"],
            )?;
            self.invoke_void(
                &set_position,
                Some(transform_address),
                &[SceneInvokeArgument::Bytes(pack_vector3(world_position).to_vec())],
            )?;
        }
        if let Some(local_position) = &transform_update.local_position {
            let set_local_position = self.require_method_by_parameter_types(
                transform_class,
                "set_localPosition",
                &["UnityEngine.Vector3"],
            )?;
            self.invoke_void(
                &set_local_position,
                Some(transform_address),
                &[SceneInvokeArgument::Bytes(pack_vector3(local_position).to_vec())],
            )?;
        }
        if let Some(local_rotation) = &transform_update.local_rotation {
            let set_local_rotation = self.require_method_by_parameter_types(
                transform_class,
                "set_localRotation",
                &["UnityEngine.Quaternion"],
            )?;
            self.invoke_void(
                &set_local_rotation,
                Some(transform_address),
                &[SceneInvokeArgument::Bytes(pack_quaternion(local_rotation).to_vec())],
            )?;
        }
        if let Some(local_euler_angles) = &transform_update.local_euler_angles {
            let set_local_euler = self
                .try_find_method_by_parameter_types(
                    transform_class,
                    "set_localEulerAnglesRaw",
                    &["UnityEngine.Vector3"],
                )?
                .unwrap_or(self.require_method_by_parameter_types(
                    transform_class,
                    "set_localEulerAngles",
                    &["UnityEngine.Vector3"],
                )?);
            self.invoke_void(
                &set_local_euler,
                Some(transform_address),
                &[SceneInvokeArgument::Bytes(pack_vector3(local_euler_angles).to_vec())],
            )?;
        }
        if let Some(local_scale) = &transform_update.local_scale {
            let set_local_scale = self.require_method_by_parameter_types(
                transform_class,
                "set_localScale",
                &["UnityEngine.Vector3"],
            )?;
            self.invoke_void(
                &set_local_scale,
                Some(transform_address),
                &[SceneInvokeArgument::Bytes(pack_vector3(local_scale).to_vec())],
            )?;
        }

        let parent_object_address = self
            .try_read_parent_object_address(object_address)?
            .map(format_address);
        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        let transform = self.build_transform_snapshot(transform_address)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::SetTransform,
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            target_object_address: Some(format_address(object_address)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(object_address)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path: Vec::new(),
            transform,
        })
    }

    fn set_scene_behaviour_enabled(
        &mut self,
        component_address: NativeAddress,
        enabled: bool,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let owner_object = self
            .try_read_owning_object_address_for_component(component_address)?
            .ok_or_else(|| "failed to resolve component owner".to_string())?;
        let behaviour_class = self.resolve_unity_class("UnityEngine", "Behaviour")?;
        let set_enabled = self.require_method_by_parameter_types(
            behaviour_class,
            "set_enabled",
            &["System.Boolean"],
        )?;
        self.invoke_void(
            &set_enabled,
            Some(component_address),
            &[SceneInvokeArgument::Boolean(enabled)],
        )?;

        let parent_object_address = self
            .try_read_parent_object_address(owner_object)?
            .map(format_address);
        let object = self.build_node_summary(owner_object, NodeSummaryFlavor::Inspector, None)?;
        let hierarchy_path = self.build_hierarchy_path(owner_object)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::SetBehaviourEnabled,
            scene_handle: self.read_scene_handle_for_object(owner_object)?,
            target_object_address: Some(format_address(owner_object)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(owner_object)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: Some(enabled),
            hierarchy_path,
            transform: None,
        })
    }

    fn create_scene_component(
        &mut self,
        object_address: NativeAddress,
        component_type_name: &str,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let (resolved_type_name, assembly_name) =
            self.resolve_component_class(component_type_name)?;
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let type_object = self.resolve_managed_type_object(&resolved_type_name, &assembly_name)?;

        let add_component = self
            .try_find_method_by_parameter_types(
                game_object_class,
                "AddComponent",
                &["System.Type"],
            )?
            .or(self.try_find_method_by_parameter_types(
                game_object_class,
                "Internal_AddComponentWithType",
                &["System.Type"],
            )?)
            .unwrap_or(self.require_method_by_parameter_types(
                game_object_class,
                "AddComponent",
                &["System.String"],
            )?);

        let component_address = if normalize_scene_type_name(
            add_component.parameter_types.first().map(String::as_str).unwrap_or_default(),
        ) == "System.Type" {
            self.invoke_object(
                &add_component,
                Some(object_address),
                &[SceneInvokeArgument::Address(type_object)],
            )?
        } else {
            self.invoke_object(
                &add_component,
                Some(object_address),
                &[SceneInvokeArgument::String(resolved_type_name.clone())],
            )?
        };
        if component_address == 0 {
            return Err("AddComponent returned null".to_string());
        }

        let parent_object_address = self
            .try_read_parent_object_address(object_address)?
            .map(format_address);
        let object = self.build_node_summary(object_address, NodeSummaryFlavor::Inspector, None)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::AddComponent,
            scene_handle: self.read_scene_handle_for_object(object_address)?,
            target_object_address: Some(format_address(object_address)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(object_address)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path: Vec::new(),
            transform: None,
        })
    }

    fn delete_scene_component(
        &mut self,
        component_address: NativeAddress,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let object_class = self.resolve_unity_class("UnityEngine", "Object")?;
        let owner_object = self
            .try_read_owning_object_address_for_component(component_address)?
            .ok_or_else(|| "failed to resolve component owner".to_string())?;

        let component_class = self.runtime_api.get_object_class(component_address)?;
        let component_type_name = self.resolve_cached_type_name(component_class)?;
        if component_type_name == "UnityEngine.Transform" {
            return Err("cannot delete Transform component".to_string());
        }

        if let Some(destroy_immediate) = self.try_find_method_by_parameter_types(
            object_class,
            "DestroyImmediate",
            &["UnityEngine.Object"],
        )? {
            self.invoke_void(
                &destroy_immediate,
                None,
                &[SceneInvokeArgument::Address(component_address)],
            )?;
        } else {
            let destroy = self.require_method_by_parameter_types(
                object_class,
                "Destroy",
                &["UnityEngine.Object"],
            )?;
            self.invoke_void(
                &destroy,
                None,
                &[SceneInvokeArgument::Address(component_address)],
            )?;
        }

        let parent_object_address = self
            .try_read_parent_object_address(owner_object)?
            .map(format_address);
        let object = self.build_node_summary(owner_object, NodeSummaryFlavor::Inspector, None)?;
        Ok(RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::RemoveComponent,
            scene_handle: self.read_scene_handle_for_object(owner_object)?,
            target_object_address: Some(format_address(owner_object)),
            parent_object_address,
            object: Some(object.clone()),
            deleted_object_address: None,
            preferred_selection_address: Some(format_address(owner_object)),
            preferred_selection_hint: None,
            active_self: Some(object.active_self),
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path: Vec::new(),
            transform: None,
        })
    }

    fn load_scene_by_build_index(
        &mut self,
        build_index: i32,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let scene_manager_class = self.resolve_unity_class(
            "UnityEngine.SceneManagement",
            "SceneManager",
        )?;
        let scene_class = self.resolve_unity_class("UnityEngine.SceneManagement", "Scene")?;
        let load_scene = self.require_method_by_parameter_types(
            scene_manager_class,
            "LoadScene",
            &["System.Int32"],
        )?;
        let get_scene_count = self.require_method(scene_manager_class, "get_sceneCount", 0)?;
        let get_scene_at = self.require_method(scene_manager_class, "GetSceneAt", 1)?;
        let get_build_index = self.try_find_method(scene_class, "get_buildIndex", 0)?;

        self.invoke_void(&load_scene, None, &[SceneInvokeArgument::Number(build_index)])?;

        let mut result = RuntimeSceneMutationResult {
            operation: RuntimeSceneMutationOperation::LoadScene,
            scene_handle: None,
            target_object_address: None,
            parent_object_address: None,
            object: None,
            deleted_object_address: None,
            preferred_selection_address: None,
            preferred_selection_hint: None,
            active_self: None,
            tag: None,
            layer: None,
            hide_flags: None,
            behaviour_enabled: None,
            hierarchy_path: Vec::new(),
            transform: None,
        };

        let scene_count = self.invoke_int(&get_scene_count, None, &[])?;
        for index in 0..scene_count {
            let scene_boxed = self.invoke_object(
                &get_scene_at,
                None,
                &[SceneInvokeArgument::Number(index)],
            )?;
            if scene_boxed == 0 {
                continue;
            }

            if let Some(method) = &get_build_index {
                let raw_scene = self.require_unboxed(
                    scene_boxed,
                    "UnityEngine.SceneManagement.Scene",
                )?;
                if self.invoke_int(method, Some(raw_scene), &[])? != build_index {
                    continue;
                }
            }

            let (scene_handle, _) = self.read_scene_identity(scene_boxed)?;
            result.scene_handle = scene_handle;
            break;
        }

        Ok(result)
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
            "unity class not found: {class_namespace}.{class_name}"
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
            let actual_without_extension = actual_name
                .strip_suffix(".dll")
                .unwrap_or(&actual_name);
            if actual_name == expected || actual_without_extension == expected_without_extension {
                return Ok(image);
            }
        }

        Err(format!("image not found: {image_name}"))
    }

    fn resolve_cached_type_name(
        &mut self,
        class_handle: NativeAddress,
    ) -> Result<String, String> {
        if let Some(type_name) = self.type_name_cache.get(&class_handle) {
            return Ok(type_name.clone());
        }

        let type_name = self.runtime_api.get_class_type_name(class_handle)?;
        self.type_name_cache.insert(class_handle, type_name.clone());
        Ok(type_name)
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

    fn require_method(
        &mut self,
        class_handle: NativeAddress,
        method_name: &str,
        parameter_count: usize,
    ) -> Result<NativeMethodRecord, String> {
        self.try_find_method(class_handle, method_name, parameter_count)?
            .ok_or_else(|| {
                let type_name = self
                    .resolve_cached_type_name(class_handle)
                    .unwrap_or_else(|_| format!("0x{class_handle:x}"));
                format!(
                    "scene method not found on {type_name} (searched parent hierarchy): {method_name}/{parameter_count}"
                )
            })
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

    fn require_method_by_parameter_types(
        &mut self,
        class_handle: NativeAddress,
        method_name: &str,
        parameter_types: &[&str],
    ) -> Result<NativeMethodRecord, String> {
        self.try_find_method_by_parameter_types(class_handle, method_name, parameter_types)?
            .ok_or_else(|| {
                let type_name = self
                    .resolve_cached_type_name(class_handle)
                    .unwrap_or_else(|_| format!("0x{class_handle:x}"));
                format!("scene method not found on {type_name}: {method_name}")
            })
    }

    fn try_find_instance_field(
        &mut self,
        class_handle: NativeAddress,
        field_name: &str,
        field_type: &str,
    ) -> Result<Option<NativeFieldRecord>, String> {
        let normalized_field_type = normalize_scene_type_name(field_type);
        let cache_key = format!("{class_handle}::{field_name}::{normalized_field_type}");
        if let Some(found) = self.field_cache.get(&cache_key) {
            return Ok(found.clone());
        }

        let mut hierarchy = Vec::new();
        let mut current_class = class_handle;
        while current_class != 0 {
            hierarchy.push(current_class);
            current_class = self.runtime_api.get_parent_class(current_class)?;
        }
        hierarchy.reverse();

        for class in hierarchy {
            for field in self.runtime_api.enumerate_fields(class)? {
                if !field.is_static
                    && field.name == field_name
                    && normalize_scene_type_name(&field.type_name) == normalized_field_type
                {
                    self.field_cache.insert(cache_key, Some(field.clone()));
                    return Ok(Some(field));
                }
            }
        }

        self.field_cache.insert(cache_key, None);
        Ok(None)
    }

    fn invoke_raw(
        &self,
        method: &NativeMethodRecord,
        instance_address: Option<NativeAddress>,
        arguments: &[SceneInvokeArgument],
    ) -> Result<NativeAddress, String> {
        if method.parameter_types.len() != arguments.len() {
            return Err(format!(
                "{} [{}]: expected {} arguments, received {}",
                method.name,
                method.signature,
                method.parameter_types.len(),
                arguments.len()
            ));
        }

        let mut argument_pointers = Vec::with_capacity(arguments.len());
        let mut _argument_storage: Vec<RemoteAllocation> = Vec::new();

        for (parameter_type, argument) in method.parameter_types.iter().zip(arguments.iter()) {
            let argument_pointer = self.marshal_argument(
                parameter_type,
                argument,
                &mut _argument_storage,
            )?;
            argument_pointers.push(argument_pointer);
        }

        let parameter_array = if argument_pointers.is_empty() {
            None
        } else {
            let allocation = self.memory.allocate(
                argument_pointers.len() * std::mem::size_of::<NativeAddress>(),
                windows::Win32::System::Memory::PAGE_READWRITE.0,
            )?;
            let bytes = unsafe {
                std::slice::from_raw_parts(
                    argument_pointers.as_ptr() as *const u8,
                    argument_pointers.len() * std::mem::size_of::<NativeAddress>(),
                )
            };
            self.memory.write_bytes(allocation.address, bytes)?;
            Some(allocation)
        };

        let exception_storage = self.memory.allocate(
            std::mem::size_of::<NativeAddress>(),
            windows::Win32::System::Memory::PAGE_READWRITE.0,
        )?;
        self.memory.write_value(exception_storage.address, &0usize)?;

        let result = self.runtime_api.invoke_method(
            method.handle,
            if method.is_static {
                0
            } else {
                instance_address.unwrap_or(0)
            },
            parameter_array
                .as_ref()
                .map(|allocation| allocation.address)
                .unwrap_or(0),
            exception_storage.address,
        )?;

        let exception_object: NativeAddress = self.memory.read_value(exception_storage.address)?;
        if exception_object != 0 {
            let exception = self
                .runtime_api
                .describe_exception(exception_object)?
                .unwrap_or_else(|| "runtime exception".to_string());
            return Err(format!("{} [{}]: {exception}", method.name, method.signature));
        }

        Ok(result)
    }

    fn invoke_void(
        &self,
        method: &NativeMethodRecord,
        instance_address: Option<NativeAddress>,
        arguments: &[SceneInvokeArgument],
    ) -> Result<(), String> {
        let _ = self.invoke_raw(method, instance_address, arguments)?;
        Ok(())
    }

    fn marshal_argument(
        &self,
        parameter_type: &str,
        argument: &SceneInvokeArgument,
        argument_storage: &mut Vec<RemoteAllocation>,
    ) -> Result<NativeAddress, String> {
        let normalized_parameter_type = normalize_scene_type_name(parameter_type);

        match argument {
            SceneInvokeArgument::Number(value) => {
                if normalized_parameter_type != "System.Int32" {
                    return Err(format!(
                        "unsupported scene numeric argument parameter type: {parameter_type}"
                    ));
                }
                let allocation = self.memory.allocate(
                    std::mem::size_of::<i32>(),
                    windows::Win32::System::Memory::PAGE_READWRITE.0,
                )?;
                self.memory.write_value(allocation.address, value)?;
                let address = allocation.address;
                argument_storage.push(allocation);
                Ok(address)
            }
            SceneInvokeArgument::Boolean(value) => {
                if normalized_parameter_type != "System.Boolean" {
                    return Err(format!(
                        "unsupported scene bool argument parameter type: {parameter_type}"
                    ));
                }
                let allocation = self.memory.allocate(
                    std::mem::size_of::<u8>(),
                    windows::Win32::System::Memory::PAGE_READWRITE.0,
                )?;
                self.memory
                    .write_value(allocation.address, &u8::from(*value))?;
                let address = allocation.address;
                argument_storage.push(allocation);
                Ok(address)
            }
            SceneInvokeArgument::String(value) => {
                if normalized_parameter_type != "System.String" {
                    return Err(format!(
                        "unsupported scene string argument parameter type: {parameter_type}"
                    ));
                }
                self.runtime_api.create_managed_string(value)
            }
            SceneInvokeArgument::Address(value) => {
                if normalized_parameter_type == "System.String" {
                    return Err(format!(
                        "unsupported scene address argument parameter type: {parameter_type}"
                    ));
                }
                Ok(*value)
            }
            SceneInvokeArgument::Null => Ok(0),
            SceneInvokeArgument::Bytes(bytes) => {
                let allocation = self.memory.allocate(
                    bytes.len(),
                    windows::Win32::System::Memory::PAGE_READWRITE.0,
                )?;
                self.memory.write_bytes(allocation.address, bytes)?;
                let address = allocation.address;
                argument_storage.push(allocation);
                Ok(address)
            }
        }
    }

    fn invoke_int(
        &self,
        method: &NativeMethodRecord,
        instance_address: Option<NativeAddress>,
        arguments: &[SceneInvokeArgument],
    ) -> Result<i32, String> {
        let result_object = self.invoke_raw(method, instance_address, arguments)?;
        let bytes = self
            .runtime_api
            .try_read_unboxed_bytes(result_object, std::mem::size_of::<i32>())?
            .ok_or_else(|| {
                format!(
                    "{} [{}]: scene integer invoke returned no value",
                    method.name, method.signature
                )
            })?;
        if bytes.len() != std::mem::size_of::<i32>() {
            return Err(format!(
                "{} [{}]: invalid integer result payload",
                method.name, method.signature
            ));
        }
        Ok(i32::from_ne_bytes(
            bytes.try_into().map_err(|_| "invalid integer payload".to_string())?,
        ))
    }

    fn invoke_bool(
        &self,
        method: &NativeMethodRecord,
        instance_address: Option<NativeAddress>,
        arguments: &[SceneInvokeArgument],
    ) -> Result<bool, String> {
        let result_object = self.invoke_raw(method, instance_address, arguments)?;
        let bytes = self
            .runtime_api
            .try_read_unboxed_bytes(result_object, std::mem::size_of::<u8>())?
            .ok_or_else(|| {
                format!(
                    "{} [{}]: scene bool invoke returned no value",
                    method.name, method.signature
                )
            })?;
        let value = bytes
            .first()
            .copied()
            .ok_or_else(|| format!("{} [{}]: invalid bool payload", method.name, method.signature))?;
        Ok(value != 0)
    }

    fn try_invoke_string(
        &self,
        method: &NativeMethodRecord,
        instance_address: Option<NativeAddress>,
        arguments: &[SceneInvokeArgument],
    ) -> Result<Option<String>, String> {
        let result_object = self.invoke_raw(method, instance_address, arguments)?;
        if result_object == 0 {
            return Ok(None);
        }
        self.runtime_api.read_managed_string(result_object)
    }

    fn invoke_object(
        &self,
        method: &NativeMethodRecord,
        instance_address: Option<NativeAddress>,
        arguments: &[SceneInvokeArgument],
    ) -> Result<NativeAddress, String> {
        self.invoke_raw(method, instance_address, arguments)
    }

    fn read_int_field(
        &mut self,
        class_handle: NativeAddress,
        instance_address: NativeAddress,
        field_name: &str,
    ) -> Result<Option<i32>, String> {
        let Some(field) = self.try_find_instance_field(class_handle, field_name, "System.Int32")? else {
            return Ok(None);
        };
        let Some(bytes) = self.runtime_api.try_read_instance_field_bytes(
            instance_address,
            &field,
            std::mem::size_of::<i32>(),
        )? else {
            return Ok(None);
        };
        if bytes.len() != std::mem::size_of::<i32>() {
            return Err(format!("invalid Int32 field payload for {field_name}"));
        }
        Ok(Some(i32::from_ne_bytes(
            bytes.try_into().map_err(|_| "invalid Int32 field payload".to_string())?,
        )))
    }

    fn read_float_field(
        &mut self,
        class_handle: NativeAddress,
        instance_address: NativeAddress,
        field_name: &str,
    ) -> Result<Option<f32>, String> {
        let Some(field) = self.try_find_instance_field(class_handle, field_name, "System.Single")? else {
            return Ok(None);
        };
        let Some(bytes) = self.runtime_api.try_read_instance_field_bytes(
            instance_address,
            &field,
            std::mem::size_of::<f32>(),
        )? else {
            return Ok(None);
        };
        if bytes.len() != std::mem::size_of::<f32>() {
            return Err(format!("invalid Single field payload for {field_name}"));
        }
        Ok(Some(f32::from_ne_bytes(
            bytes.try_into().map_err(|_| "invalid Single field payload".to_string())?,
        )))
    }

    fn try_read_parent_object_address(
        &mut self,
        game_object_address: NativeAddress,
    ) -> Result<Option<NativeAddress>, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let get_transform = self.require_method(game_object_class, "get_transform", 0)?;
        let get_parent = self.require_method(transform_class, "get_parent", 0)?;
        let get_game_object = self.require_method(transform_class, "get_gameObject", 0)?;

        let transform_address = self.invoke_object(&get_transform, Some(game_object_address), &[])?;
        if transform_address == 0 {
            return Ok(None);
        }

        let parent_transform = self.invoke_object(&get_parent, Some(transform_address), &[])?;
        if parent_transform == 0 {
            return Ok(None);
        }

        let parent_object = self.invoke_object(&get_game_object, Some(parent_transform), &[])?;
        if parent_object == 0 {
            Ok(None)
        } else {
            Ok(Some(parent_object))
        }
    }

    fn try_read_owning_object_address_for_component(
        &mut self,
        component_address: NativeAddress,
    ) -> Result<Option<NativeAddress>, String> {
        let component_class = self.resolve_unity_class("UnityEngine", "Component")?;
        let get_game_object = self.require_method(component_class, "get_gameObject", 0)?;
        let game_object = self.invoke_object(&get_game_object, Some(component_address), &[])?;
        if game_object == 0 {
            Ok(None)
        } else {
            Ok(Some(game_object))
        }
    }

    fn read_scene_handle_for_object(
        &mut self,
        game_object_address: NativeAddress,
    ) -> Result<Option<i32>, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let get_scene = self.require_method(game_object_class, "get_scene", 0)?;
        let scene_object = self.invoke_object(&get_scene, Some(game_object_address), &[])?;
        Ok(self.read_scene_identity(scene_object)?.0)
    }

    fn try_resolve_loaded_scene_boxed_address(
        &mut self,
        scene_handle: i32,
    ) -> Result<Option<NativeAddress>, String> {
        let scene_manager_class = self.resolve_unity_class(
            "UnityEngine.SceneManagement",
            "SceneManager",
        )?;
        let scene_class = self.resolve_unity_class("UnityEngine.SceneManagement", "Scene")?;
        let get_scene_count = self.require_method(scene_manager_class, "get_sceneCount", 0)?;
        let get_scene_at = self.require_method(scene_manager_class, "GetSceneAt", 1)?;
        let is_valid = self.try_find_method(scene_class, "IsValid", 0)?;

        let scene_count = self.invoke_int(&get_scene_count, None, &[])?;
        for index in 0..scene_count {
            let scene_boxed = self.invoke_object(
                &get_scene_at,
                None,
                &[SceneInvokeArgument::Number(index)],
            )?;
            if scene_boxed == 0 {
                continue;
            }

            let raw_scene = self.require_unboxed(
                scene_boxed,
                "UnityEngine.SceneManagement.Scene",
            )?;
            if let Some(method) = &is_valid {
                if !self.invoke_bool(method, Some(raw_scene), &[])? {
                    continue;
                }
            }

            let current_handle = self.read_scene_identity(scene_boxed)?.0;
            if current_handle == Some(scene_handle) {
                return Ok(Some(scene_boxed));
            }
        }

        Ok(None)
    }

    fn read_vector3(
        &mut self,
        boxed_value_address: NativeAddress,
    ) -> Result<Option<RuntimeVector3Snapshot>, String> {
        if boxed_value_address == 0 {
            return Ok(None);
        }

        let vector3_class = self.resolve_unity_class("UnityEngine", "Vector3")?;
        let raw_value = self.require_unboxed(boxed_value_address, "UnityEngine.Vector3")?;
        let Some(x) = self.read_float_field(vector3_class, raw_value, "x")? else {
            return Ok(None);
        };
        let Some(y) = self.read_float_field(vector3_class, raw_value, "y")? else {
            return Ok(None);
        };
        let Some(z) = self.read_float_field(vector3_class, raw_value, "z")? else {
            return Ok(None);
        };

        Ok(Some(RuntimeVector3Snapshot { x, y, z }))
    }

    fn read_quaternion(
        &mut self,
        boxed_value_address: NativeAddress,
    ) -> Result<Option<RuntimeQuaternionSnapshot>, String> {
        if boxed_value_address == 0 {
            return Ok(None);
        }

        let quaternion_class = self.resolve_unity_class("UnityEngine", "Quaternion")?;
        let raw_value = self.require_unboxed(boxed_value_address, "UnityEngine.Quaternion")?;
        let Some(x) = self.read_float_field(quaternion_class, raw_value, "x")? else {
            return Ok(None);
        };
        let Some(y) = self.read_float_field(quaternion_class, raw_value, "y")? else {
            return Ok(None);
        };
        let Some(z) = self.read_float_field(quaternion_class, raw_value, "z")? else {
            return Ok(None);
        };
        let Some(w) = self.read_float_field(quaternion_class, raw_value, "w")? else {
            return Ok(None);
        };

        Ok(Some(RuntimeQuaternionSnapshot { x, y, z, w }))
    }

    fn read_enum_string(
        &mut self,
        boxed_value_address: NativeAddress,
    ) -> Result<Option<String>, String> {
        if boxed_value_address == 0 {
            return Ok(None);
        }

        let enum_class = self.resolve_managed_class_any_image("System", "Enum")?;
        let to_string = self.require_method(enum_class, "ToString", 0)?;
        self.try_invoke_string(&to_string, Some(boxed_value_address), &[])
    }

    fn create_managed_object(
        &self,
        class_handle: NativeAddress,
        context: &str,
    ) -> Result<NativeAddress, String> {
        let object = self.runtime_api.create_managed_object(class_handle)?;
        if object == 0 {
            return Err(format!("failed to create managed object: {context}"));
        }
        Ok(object)
    }

    fn resolve_component_class(
        &self,
        component_type_name: &str,
    ) -> Result<(String, String), String> {
        let (raw_type_name, assembly_hint) = split_assembly_qualified_type(component_type_name);
        if raw_type_name.is_empty() {
            return Err("component type name is required".to_string());
        }

        let candidates = build_type_name_candidates(&raw_type_name);
        for assembly in self.runtime_api.enumerate_assemblies()? {
            let image = self.runtime_api.get_assembly_image(assembly)?;
            let image_name = self.runtime_api.get_image_name(image)?;
            if !assembly_name_matches(&image_name, assembly_hint.as_deref()) {
                continue;
            }

            for (class_namespace, class_name) in &candidates {
                if let Ok(class_handle) = self
                    .runtime_api
                    .resolve_class(image, class_namespace, class_name)
                {
                    if class_handle != 0 {
                        let resolved_type_name = if class_namespace.is_empty() {
                            class_name.clone()
                        } else {
                            format!("{class_namespace}.{class_name}")
                        };
                        return Ok((resolved_type_name, trim_assembly_name(&image_name)));
                    }
                }
            }
        }

        Err(format!("component type not found: {component_type_name}"))
    }

    fn resolve_managed_type_object(
        &mut self,
        type_name: &str,
        assembly_name: &str,
    ) -> Result<NativeAddress, String> {
        let type_class = self.resolve_managed_class_any_image("System", "Type")?;
        let assembly_qualified_name = if assembly_name.is_empty() {
            type_name.to_string()
        } else {
            format!("{type_name}, {assembly_name}")
        };

        if let Some(get_type) = self.try_find_method_by_parameter_types(
            type_class,
            "GetType",
            &["System.String", "System.Boolean"],
        )? {
            let type_object = self.invoke_object(
                &get_type,
                None,
                &[
                    SceneInvokeArgument::String(assembly_qualified_name.clone()),
                    SceneInvokeArgument::Boolean(true),
                ],
            )?;
            if type_object != 0 {
                return Ok(type_object);
            }
        }

        let get_type = self.require_method_by_parameter_types(
            type_class,
            "GetType",
            &["System.String"],
        )?;
        let type_object = self.invoke_object(
            &get_type,
            None,
            &[SceneInvokeArgument::String(assembly_qualified_name.clone())],
        )?;
        if type_object == 0 {
            return Err(format!(
                "failed to resolve managed type object: {assembly_qualified_name}"
            ));
        }

        Ok(type_object)
    }

    fn try_read_hide_flags(
        &mut self,
        object_address: NativeAddress,
    ) -> Result<Option<String>, String> {
        let object_class = self.resolve_unity_class("UnityEngine", "Object")?;
        let Some(get_hide_flags) = self.try_find_method(object_class, "get_hideFlags", 0)? else {
            return Ok(None);
        };
        let hide_flags = self.invoke_object(&get_hide_flags, Some(object_address), &[])?;
        self.read_enum_string(hide_flags)
    }

    fn build_node_summary(
        &mut self,
        game_object_address: NativeAddress,
        flavor: NodeSummaryFlavor,
        known_transform_address: Option<NativeAddress>,
    ) -> Result<RuntimeSceneNodeSummary, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let get_name = self.try_find_method(game_object_class, "get_name", 0)?;
        let get_transform = self.try_find_method(game_object_class, "get_transform", 0)?;
        let get_game_object = self.require_method(transform_class, "get_gameObject", 0)?;
        let get_parent = self.try_find_method(transform_class, "get_parent", 0)?;

        let mut node = RuntimeSceneNodeSummary {
            object_address: format_address(game_object_address),
            transform_address: None,
            parent_object_address: None,
            name: match get_name {
                Some(ref method) => self
                    .try_invoke_string(method, Some(game_object_address), &[])?
                    .unwrap_or_else(|| "<unnamed>".to_string()),
                None => "<unnamed>".to_string(),
            },
            active_self: false,
            is_static: None,
            child_count: 0,
            has_children: false,
            component_count: None,
            layer: None,
            tag: None,
            hide_flags: None,
            path: None,
        };

        let mut transform_address = known_transform_address.unwrap_or(0);
        if transform_address == 0 {
            if let Some(method) = &get_transform {
                transform_address = self.invoke_object(method, Some(game_object_address), &[])?;
            }
        }
        if transform_address != 0 {
            node.transform_address = Some(format_address(transform_address));
            let get_child_count = self.require_method(transform_class, "get_childCount", 0)?;
            let child_count = self.invoke_int(&get_child_count, Some(transform_address), &[])?;
            node.child_count = child_count.max(0) as usize;
            node.has_children = node.child_count > 0;
            if let Some(method) = &get_parent {
                let parent_transform = self.invoke_object(method, Some(transform_address), &[])?;
                if parent_transform != 0 {
                    let parent_object = self.invoke_object(
                        &get_game_object,
                        Some(parent_transform),
                        &[],
                    )?;
                    if parent_object != 0 {
                        node.parent_object_address = Some(format_address(parent_object));
                    }
                }
            }
        }

        if flavor != NodeSummaryFlavor::Catalog {
            let get_active_self = self.require_method(game_object_class, "get_activeSelf", 0)?;
            let get_layer = self.require_method(game_object_class, "get_layer", 0)?;
            node.active_self = self.invoke_bool(&get_active_self, Some(game_object_address), &[])?;
            node.layer = Some(self.invoke_int(&get_layer, Some(game_object_address), &[])?);

            if let Some(method) = self.try_find_method(game_object_class, "get_isStatic", 0)? {
                node.is_static = Some(self.invoke_bool(&method, Some(game_object_address), &[])?);
            }

            if let Some(method) = self.try_find_method(game_object_class, "get_tag", 0)? {
                node.tag = self.try_invoke_string(&method, Some(game_object_address), &[])?;
            }

            if let Some(method) = self.try_find_method(game_object_class, "GetComponentCount", 0)? {
                node.component_count = Some(
                    self.invoke_int(&method, Some(game_object_address), &[])?
                        .max(0) as usize,
                );
            }

            node.hide_flags = self.try_read_hide_flags(game_object_address)?;
            let hierarchy_path = self.build_hierarchy_path(game_object_address)?;
            if !hierarchy_path.is_empty() {
                node.path = Some(
                    hierarchy_path
                        .iter()
                        .map(|entry| entry.name.clone())
                        .collect::<Vec<_>>()
                        .join("/"),
                );
            }
        }

        Ok(node)
    }

    fn load_children_for_object(
        &mut self,
        game_object_address: NativeAddress,
        flavor: NodeSummaryFlavor,
        offset: usize,
        limit: Option<usize>,
    ) -> Result<ScenePage<RuntimeSceneNodeSummary>, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let get_transform = self.require_method(game_object_class, "get_transform", 0)?;
        let get_child_count = self.require_method(transform_class, "get_childCount", 0)?;
        let get_child = self.require_method(transform_class, "GetChild", 1)?;
        let get_game_object = self.require_method(transform_class, "get_gameObject", 0)?;

        let transform_address = self.invoke_object(&get_transform, Some(game_object_address), &[])?;
        if transform_address == 0 {
            return Ok(ScenePage {
                items: Vec::new(),
                total_count: 0,
                next_offset: None,
            });
        }

        let child_count = self.invoke_int(&get_child_count, Some(transform_address), &[])?;
        let total_count = child_count.max(0) as usize;
        let start_index = offset.min(total_count);
        let end_index = match limit {
            Some(limit) => total_count.min(start_index + limit),
            None => total_count,
        };
        let next_offset = if end_index < total_count {
            Some(end_index)
        } else {
            None
        };

        let mut children = Vec::with_capacity(end_index.saturating_sub(start_index));
        for index in start_index..end_index {
            let child_transform = self.invoke_object(
                &get_child,
                Some(transform_address),
                &[SceneInvokeArgument::Number(index as i32)],
            )?;
            if child_transform == 0 {
                continue;
            }
            let child_object = self.invoke_object(&get_game_object, Some(child_transform), &[])?;
            if child_object != 0 {
                children.push(self.build_node_summary(
                    child_object,
                    flavor,
                    Some(child_transform),
                )?);
            }
        }

        Ok(ScenePage {
            items: children,
            total_count,
            next_offset,
        })
    }

    fn load_components_for_object(
        &mut self,
        game_object_address: NativeAddress,
        offset: usize,
        limit: Option<usize>,
    ) -> Result<ScenePage<RuntimeSceneComponentSummary>, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let behaviour_class = self.resolve_unity_class("UnityEngine", "Behaviour")?;
        let Some(get_component_count) = self.try_find_method(game_object_class, "GetComponentCount", 0)? else {
            return Ok(ScenePage {
                items: Vec::new(),
                total_count: 0,
                next_offset: None,
            });
        };

        let query_component = match self.try_find_method(game_object_class, "QueryComponentAtIndex", 1)? {
            Some(method) => Some(method),
            None => self.try_find_method(game_object_class, "GetComponentAtIndex", 1)?,
        };
        let Some(query_component) = query_component else {
            return Ok(ScenePage {
                items: Vec::new(),
                total_count: 0,
                next_offset: None,
            });
        };

        let component_count = self.invoke_int(&get_component_count, Some(game_object_address), &[])?;
        let total_count = component_count.max(0) as usize;
        let start_index = offset.min(total_count);
        let end_index = match limit {
            Some(limit) => total_count.min(start_index + limit),
            None => total_count,
        };
        let next_offset = if end_index < total_count {
            Some(end_index)
        } else {
            None
        };

        let get_enabled = self.require_method(behaviour_class, "get_enabled", 0)?;
        let mut components = Vec::with_capacity(end_index.saturating_sub(start_index));
        for index in start_index..end_index {
            let component_address = self.invoke_object(
                &query_component,
                Some(game_object_address),
                &[SceneInvokeArgument::Number(index as i32)],
            )?;
            if component_address == 0 {
                continue;
            }

            let component_class = self.runtime_api.get_object_class(component_address)?;
            let type_name = self.resolve_cached_type_name(component_class)?;
            let mut is_behaviour = false;
            let mut current_class = component_class;
            while current_class != 0 {
                if current_class == behaviour_class {
                    is_behaviour = true;
                    break;
                }
                current_class = self.runtime_api.get_parent_class(current_class)?;
            }

            let behaviour_enabled = if is_behaviour {
                Some(self.invoke_bool(&get_enabled, Some(component_address), &[])? )
            } else {
                None
            };

            components.push(RuntimeSceneComponentSummary {
                component_address: format_address(component_address),
                type_name,
                is_behaviour,
                behaviour_enabled,
            });
        }

        Ok(ScenePage {
            items: components,
            total_count,
            next_offset,
        })
    }

    fn build_transform_snapshot(
        &mut self,
        transform_address: NativeAddress,
    ) -> Result<Option<RuntimeSceneTransformSnapshot>, String> {
        if transform_address == 0 {
            return Ok(None);
        }

        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let get_parent = self.require_method(transform_class, "get_parent", 0)?;
        let get_child_count = self.require_method(transform_class, "get_childCount", 0)?;
        let get_game_object = self.require_method(transform_class, "get_gameObject", 0)?;
        let get_position = self.try_find_method(transform_class, "get_position", 0)?;
        let get_local_position = self.require_method(transform_class, "get_localPosition", 0)?;
        let get_local_rotation = self.require_method(transform_class, "get_localRotation", 0)?;
        let get_local_euler_angles = self.try_find_method(transform_class, "get_localEulerAngles", 0)?;
        let get_local_euler_angles_raw = self.try_find_method(transform_class, "get_localEulerAnglesRaw", 0)?;
        let get_local_scale = self.require_method(transform_class, "get_localScale", 0)?;

        let child_count = self.invoke_int(&get_child_count, Some(transform_address), &[])?;
        let parent_transform = self.invoke_object(&get_parent, Some(transform_address), &[])?;
        let parent_transform_address = if parent_transform == 0 {
            None
        } else {
            Some(format_address(parent_transform))
        };
        let parent_object_address = if parent_transform == 0 {
            None
        } else {
            let parent_object = self.invoke_object(&get_game_object, Some(parent_transform), &[])?;
            if parent_object == 0 {
                None
            } else {
                Some(format_address(parent_object))
            }
        };

        let world_position = match &get_position {
            Some(method) => self.read_vector3(self.invoke_object(method, Some(transform_address), &[] )?)?,
            None => None,
        };
        let local_position = self.read_vector3(self.invoke_object(&get_local_position, Some(transform_address), &[] )?)?;
        let local_rotation = self.read_quaternion(self.invoke_object(&get_local_rotation, Some(transform_address), &[] )?)?;
        let local_euler_angles = match &get_local_euler_angles_raw {
            Some(method) => self.read_vector3(self.invoke_object(method, Some(transform_address), &[] )?)?,
            None => match &get_local_euler_angles {
                Some(method) => self.read_vector3(self.invoke_object(method, Some(transform_address), &[] )?)?,
                None => None,
            },
        };
        let local_scale = self.read_vector3(self.invoke_object(&get_local_scale, Some(transform_address), &[] )?)?;

        Ok(Some(RuntimeSceneTransformSnapshot {
            transform_address: format_address(transform_address),
            world_position,
            local_position,
            local_rotation,
            local_euler_angles,
            local_scale,
            parent_transform_address,
            parent_object_address,
            child_count: child_count.max(0) as usize,
        }))
    }

    fn read_scene_identity(
        &mut self,
        scene_boxed_address: NativeAddress,
    ) -> Result<(Option<i32>, Option<String>), String> {
        if scene_boxed_address == 0 {
            return Ok((None, None));
        }

        let scene_class = self.resolve_unity_class("UnityEngine.SceneManagement", "Scene")?;
        let raw_scene = self.require_unboxed(scene_boxed_address, "UnityEngine.SceneManagement.Scene")?;
        let scene_name = match self.try_find_method(scene_class, "get_name", 0)? {
            Some(method) => self.try_invoke_string(&method, Some(raw_scene), &[] )?,
            None => None,
        };
        let scene_handle = self.read_int_field(scene_class, raw_scene, "m_Handle")?;
        Ok((scene_handle, scene_name))
    }

    fn build_hierarchy_path(
        &mut self,
        game_object_address: NativeAddress,
    ) -> Result<Vec<RuntimeSceneHierarchyPathEntry>, String> {
        if let Some(path) = self.hierarchy_cache.get(&game_object_address) {
            return Ok(path.clone());
        }

        let mut path = Vec::new();
        let mut current = game_object_address;
        while current != 0 {
            let node = self.build_node_summary(current, NodeSummaryFlavor::Catalog, None)?;
            path.push(RuntimeSceneHierarchyPathEntry {
                object_address: format_address(current),
                name: node.name,
            });

            let Some(parent) = self.try_read_parent_object_address(current)? else {
                break;
            };
            current = parent;
        }

        path.reverse();
        self.hierarchy_cache.insert(game_object_address, path.clone());
        Ok(path)
    }

    fn require_unboxed(
        &self,
        boxed_object_address: NativeAddress,
        context: &str,
    ) -> Result<NativeAddress, String> {
        let raw_value = self.runtime_api.unbox_object(boxed_object_address)?;
        if raw_value == 0 {
            return Err(format!(
                "{context}: failed to unbox value-type instance"
            ));
        }
        Ok(raw_value)
    }

    fn resolve_managed_class_any_image(
        &self,
        class_namespace: &str,
        class_name: &str,
    ) -> Result<NativeAddress, String> {
        for assembly in self.runtime_api.enumerate_assemblies()? {
            let image = self.runtime_api.get_assembly_image(assembly)?;
            if image == 0 {
                continue;
            }
            if let Ok(class_handle) = self
                .runtime_api
                .resolve_class(image, class_namespace, class_name)
            {
                if class_handle != 0 {
                    return Ok(class_handle);
                }
            }
        }

        Err(format!(
            "managed class not found: {class_namespace}.{class_name}"
        ))
    }
}

fn trim(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_scene_type_name(value: &str) -> String {
    let mut value = trim(value);
    if value.is_empty() {
        return value;
    }

    let mut suffix = String::new();
    loop {
        if value.ends_with("[]") {
            suffix = format!("[]{}", suffix);
            value.truncate(value.len() - 2);
            value = trim(&value);
            continue;
        }

        if let Some(last) = value.chars().last() {
            if last == '&' || last == '*' {
                suffix.insert(0, last);
                value.pop();
                value = trim(&value);
                continue;
            }
        }

        break;
    }

    let normalized = match value.as_str() {
        "void" => "System.Void",
        "bool" => "System.Boolean",
        "byte" => "System.Byte",
        "sbyte" => "System.SByte",
        "short" => "System.Int16",
        "ushort" => "System.UInt16",
        "int" => "System.Int32",
        "uint" => "System.UInt32",
        "long" => "System.Int64",
        "ulong" => "System.UInt64",
        "float" => "System.Single",
        "double" => "System.Double",
        "string" => "System.String",
        "object" => "System.Object",
        other => other,
    };

    format!("{normalized}{suffix}")
}

fn trim_assembly_name(value: &str) -> String {
    let trimmed = trim(value);
    trimmed
        .strip_suffix(".dll")
        .unwrap_or(trimmed.as_str())
        .to_string()
}

fn assembly_name_matches(image_name: &str, assembly_hint: Option<&str>) -> bool {
    match assembly_hint {
        Some(assembly_hint) => trim_assembly_name(image_name) == trim_assembly_name(assembly_hint),
        None => true,
    }
}

fn split_assembly_qualified_type(value: &str) -> (String, Option<String>) {
    match value.find(',') {
        Some(comma) => (
            trim(&value[..comma]),
            Some(trim_assembly_name(&value[comma + 1..])),
        ),
        None => (trim(value), None),
    }
}

fn build_type_name_candidates(type_name: &str) -> Vec<(String, String)> {
    match type_name.rfind('.') {
        Some(last_dot) => vec![(
            type_name[..last_dot].to_string(),
            type_name[last_dot + 1..].to_string(),
        )],
        None => vec![
            ("UnityEngine".to_string(), type_name.to_string()),
            (String::new(), type_name.to_string()),
        ],
    }
}

fn pack_vector3(value: &RuntimeVector3Snapshot) -> [u8; 12] {
    let mut bytes = [0u8; 12];
    bytes[0..4].copy_from_slice(&value.x.to_ne_bytes());
    bytes[4..8].copy_from_slice(&value.y.to_ne_bytes());
    bytes[8..12].copy_from_slice(&value.z.to_ne_bytes());
    bytes
}

fn pack_quaternion(value: &RuntimeQuaternionSnapshot) -> [u8; 16] {
    let mut bytes = [0u8; 16];
    bytes[0..4].copy_from_slice(&value.x.to_ne_bytes());
    bytes[4..8].copy_from_slice(&value.y.to_ne_bytes());
    bytes[8..12].copy_from_slice(&value.z.to_ne_bytes());
    bytes[12..16].copy_from_slice(&value.w.to_ne_bytes());
    bytes
}

fn format_address(address: NativeAddress) -> String {
    format!("0x{address:x}")
}

fn parse_address(value: &str) -> Result<NativeAddress, String> {
    let trimmed = value.trim();
    let normalized = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    usize::from_str_radix(normalized, if trimmed.starts_with("0x") { 16 } else { 10 })
        .map_err(|error| format!("Invalid address '{value}': {error}"))
}

fn scene_name_from_path(path: &str) -> String {
    let file_name = path
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(path);
    match file_name.rsplit_once('.') {
        Some((name, _)) => name.to_string(),
        None => file_name.to_string(),
    }
}

fn infer_scene_kind(
    build_index: Option<i32>,
    path: Option<String>,
    name: Option<String>,
) -> RuntimeSceneKind {
    if name.as_deref() == Some("DontDestroyOnLoad") {
        return RuntimeSceneKind::DontDestroyOnLoad;
    }

    if build_index.unwrap_or(-1) < 0 && path.as_deref().unwrap_or_default().is_empty() {
        return RuntimeSceneKind::HideAndDontSave;
    }

    RuntimeSceneKind::Loaded
}

#[cfg(test)]
mod tests {
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
}