impl<'a> SceneQueryKernel<'a> {
    fn load_scene_catalog(&mut self) -> Result<RuntimeSceneCatalogSnapshot, String> {
        let scene_manager_class =
            self.resolve_unity_class("UnityEngine.SceneManagement", "SceneManager")?;
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
            let scene_boxed =
                self.invoke_object(&get_scene_at, None, &[SceneInvokeArgument::Number(index)])?;
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

            let root_array = match self.invoke_object(&get_root_game_objects, Some(raw_scene), &[])
            {
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
        if let (
            Some(scene_utility_class),
            Some(get_scene_count_in_build_settings),
            Some(get_scene_path_by_build_index),
        ) = (
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
                    is_loaded: scenes
                        .iter()
                        .any(|scene| scene.build_index == Some(build_index)),
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
                Some(method) => self.try_invoke_string(method, Some(raw_scene), &[])?,
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
}