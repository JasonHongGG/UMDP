impl<'a> SceneQueryKernel<'a> {
    fn create_scene_child(
        &mut self,
        parent_object_address: NativeAddress,
        name: &str,
    ) -> Result<RuntimeSceneMutationResult, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let get_transform = self.require_method(game_object_class, "get_transform", 0)?;

        let child_object =
            self.create_managed_object(game_object_class, "UnityEngine.GameObject")?;
        if let Some(ctor_with_name) =
            self.try_find_method_by_parameter_types(game_object_class, ".ctor", &["System.String"])?
        {
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
        let scene_manager_class =
            self.resolve_unity_class("UnityEngine.SceneManagement", "SceneManager")?;

        let root_object = self.create_managed_object(game_object_class, "UnityEngine.GameObject")?;
        if let Some(ctor_with_name) =
            self.try_find_method_by_parameter_types(game_object_class, ".ctor", &["System.String"])?
        {
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
                &[
                    "UnityEngine.GameObject",
                    "UnityEngine.SceneManagement.Scene",
                ],
            )?;
            if let (Some(scene_boxed), Some(move_to_scene)) = (scene_boxed, move_to_scene) {
                let raw_scene =
                    self.require_unboxed(scene_boxed, "UnityEngine.SceneManagement.Scene")?;
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
        let enum_type =
            self.resolve_managed_type_object("UnityEngine.HideFlags", "UnityEngine.CoreModule")?;
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
            let resolved_parent_transform =
                self.invoke_object(&get_transform, Some(parent_object_address), &[])?;
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
        let (resolved_type_name, assembly_name) = self.resolve_component_class(component_type_name)?;
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let type_object = self.resolve_managed_type_object(&resolved_type_name, &assembly_name)?;

        let add_component = self
            .try_find_method_by_parameter_types(game_object_class, "AddComponent", &["System.Type"])?
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
            add_component
                .parameter_types
                .first()
                .map(String::as_str)
                .unwrap_or_default(),
        ) == "System.Type"
        {
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
        let scene_manager_class =
            self.resolve_unity_class("UnityEngine.SceneManagement", "SceneManager")?;
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
            let scene_boxed =
                self.invoke_object(&get_scene_at, None, &[SceneInvokeArgument::Number(index)])?;
            if scene_boxed == 0 {
                continue;
            }

            if let Some(method) = &get_build_index {
                let raw_scene =
                    self.require_unboxed(scene_boxed, "UnityEngine.SceneManagement.Scene")?;
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
}