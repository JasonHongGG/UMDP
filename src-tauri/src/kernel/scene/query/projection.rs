impl<'a> SceneQueryKernel<'a> {
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
                    let parent_object = self.invoke_object(&get_game_object, Some(parent_transform), &[])?;
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
                    self.invoke_int(&method, Some(game_object_address), &[])?.max(0) as usize,
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
                children.push(self.build_node_summary(child_object, flavor, Some(child_transform))?);
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
        let Some(get_component_count) = self.try_find_method(game_object_class, "GetComponentCount", 0)?
        else {
            return Err("Scene object component enumeration is unavailable: GameObject.GetComponentCount is missing.".to_string());
        };

        let query_component = match self.try_find_method(game_object_class, "QueryComponentAtIndex", 1)? {
            Some(method) => Some(method),
            None => self.try_find_method(game_object_class, "GetComponentAtIndex", 1)?,
        };
        let Some(query_component) = query_component else {
            return Err("Scene object component enumeration is unavailable: neither QueryComponentAtIndex nor GetComponentAtIndex exists.".to_string());
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

        if total_count > 0 && components.is_empty() {
            return Err(format!(
                "Scene object component enumeration returned no materialized components for {total_count} reported entries."
            ));
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
        let get_local_euler_angles_raw =
            self.try_find_method(transform_class, "get_localEulerAnglesRaw", 0)?;
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
            Some(method) => self.read_vector3(self.invoke_object(method, Some(transform_address), &[])?)?,
            None => None,
        };
        let local_position = self.read_vector3(self.invoke_object(
            &get_local_position,
            Some(transform_address),
            &[],
        )?)?;
        let local_rotation = self.read_quaternion(self.invoke_object(
            &get_local_rotation,
            Some(transform_address),
            &[],
        )?)?;
        let local_euler_angles = match &get_local_euler_angles_raw {
            Some(method) => self.read_vector3(self.invoke_object(method, Some(transform_address), &[])?)?,
            None => match &get_local_euler_angles {
                Some(method) => self.read_vector3(self.invoke_object(method, Some(transform_address), &[])?)?,
                None => None,
            },
        };
        let local_scale = self.read_vector3(self.invoke_object(
            &get_local_scale,
            Some(transform_address),
            &[],
        )?)?;

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
            Some(method) => self.try_invoke_string(&method, Some(raw_scene), &[])?,
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
}