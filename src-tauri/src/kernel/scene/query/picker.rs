use windows::Win32::System::Memory::PAGE_READWRITE;

const RAYCAST_HIT_SCRATCH_BYTES: usize = 128;

impl<'a> SceneQueryKernel<'a> {
    fn pick_scene_object_at(
        &mut self,
        client_position: RuntimeScreenPoint,
        screen_position: RuntimeScreenPoint,
        client_height: i32,
    ) -> Result<Option<RuntimeSceneMouseTargetHit>, String> {
        let camera_class = self.resolve_unity_class("UnityEngine", "Camera")?;
        let physics_class = self.resolve_unity_class("UnityEngine", "Physics")?;
        let component_class = self.resolve_unity_class("UnityEngine", "Component")?;
        let transform_class = self.resolve_unity_class("UnityEngine", "Transform")?;
        let raycast_hit_class = self.resolve_unity_class("UnityEngine", "RaycastHit")?;

        let get_main_camera = self.require_method(camera_class, "get_main", 0)?;
        let screen_point_to_ray = self.require_method(camera_class, "ScreenPointToRay", 1)?;
        let raycast_two_params = self.try_find_method_by_parameter_types(
            physics_class,
            "Raycast",
            &["UnityEngine.Ray", "UnityEngine.RaycastHit&"],
        )?;
        let raycast_three_params = self.try_find_method_by_parameter_types(
            physics_class,
            "Raycast",
            &["UnityEngine.Ray", "UnityEngine.RaycastHit&", "System.Single"],
        )?;
        let get_transform = self.try_find_method(raycast_hit_class, "get_transform", 0)?;
        let get_collider = self.try_find_method(raycast_hit_class, "get_collider", 0)?;
        let get_distance = self.try_find_method(raycast_hit_class, "get_distance", 0)?;
        let get_game_object_from_transform = self.require_method(transform_class, "get_gameObject", 0)?;
        let get_game_object_from_component = self.require_method(component_class, "get_gameObject", 0)?;

        let main_camera = self.invoke_object(&get_main_camera, None, &[])?;
        if main_camera == 0 {
            return Err("No MainCamera found for scene picking".to_string());
        }

        let unity_screen_position = RuntimeVector3Snapshot {
            x: client_position.x as f32,
            y: (client_height - client_position.y) as f32,
            z: 0.0,
        };
        let ray_boxed = self.invoke_object(
            &screen_point_to_ray,
            Some(main_camera),
            &[SceneInvokeArgument::Bytes(pack_vector3(&unity_screen_position).to_vec())],
        )?;
        if ray_boxed == 0 {
            return Ok(None);
        }

        let ray_value = self.require_unboxed(ray_boxed, "UnityEngine.Ray")?;
        let hit_storage = self.memory.allocate(RAYCAST_HIT_SCRATCH_BYTES, PAGE_READWRITE.0)?;
        self.memory
            .write_bytes(hit_storage.address, &[0u8; RAYCAST_HIT_SCRATCH_BYTES])?;

        let did_hit = if let Some(method) = raycast_two_params {
            self.invoke_bool(
                &method,
                None,
                &[
                    SceneInvokeArgument::Address(ray_value),
                    SceneInvokeArgument::Address(hit_storage.address),
                ],
            )?
        } else {
            let method = raycast_three_params.ok_or_else(|| {
                "UnityEngine.Physics.Raycast overload was not found for scene picking".to_string()
            })?;
            self.invoke_bool(
                &method,
                None,
                &[
                    SceneInvokeArgument::Address(ray_value),
                    SceneInvokeArgument::Address(hit_storage.address),
                    SceneInvokeArgument::Bytes(1000.0f32.to_ne_bytes().to_vec()),
                ],
            )?
        };

        if !did_hit {
            return Ok(None);
        }

        let transform_address = match &get_transform {
            Some(method) => self.invoke_object(method, Some(hit_storage.address), &[] )?,
            None => 0,
        };
        let game_object_address = if transform_address != 0 {
            self.invoke_object(
                &get_game_object_from_transform,
                Some(transform_address),
                &[],
            )?
        } else {
            let Some(get_collider) = get_collider else {
                return Ok(None);
            };
            let collider_address = self.invoke_object(&get_collider, Some(hit_storage.address), &[])?;
            if collider_address == 0 {
                return Ok(None);
            }
            self.invoke_object(
                &get_game_object_from_component,
                Some(collider_address),
                &[],
            )?
        };
        if game_object_address == 0 {
            return Ok(None);
        }

        let distance = match &get_distance {
            Some(method) => Some(self.invoke_float(method, Some(hit_storage.address), &[])?),
            None => None,
        };

        Ok(Some(self.build_scene_mouse_target_hit(
            game_object_address,
            transform_address,
            distance,
            screen_position,
            client_position,
        )?))
    }

    fn build_scene_mouse_target_hit(
        &mut self,
        game_object_address: NativeAddress,
        transform_address: NativeAddress,
        distance: Option<f32>,
        screen_position: RuntimeScreenPoint,
        client_position: RuntimeScreenPoint,
    ) -> Result<RuntimeSceneMouseTargetHit, String> {
        let game_object_class = self.resolve_unity_class("UnityEngine", "GameObject")?;
        let get_scene = self.require_method(game_object_class, "get_scene", 0)?;
        let object = self.build_node_summary(
            game_object_address,
            NodeSummaryFlavor::Catalog,
            if transform_address == 0 {
                None
            } else {
                Some(transform_address)
            },
        )?;

        let scene_object = self.invoke_object(&get_scene, Some(game_object_address), &[])?;
        let (scene_handle, scene_name) = self.read_scene_identity(scene_object)?;
        let scene_kind = if scene_handle.is_some() && scene_object != 0 {
            let scene_class = self.resolve_unity_class("UnityEngine.SceneManagement", "Scene")?;
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

        Ok(RuntimeSceneMouseTargetHit {
            observed_at: current_timestamp(),
            object_address: object.object_address,
            object_name: object.name,
            transform_address: object.transform_address.or_else(|| {
                if transform_address == 0 {
                    None
                } else {
                    Some(format_address(transform_address))
                }
            }),
            scene_handle,
            scene_name,
            scene_kind,
            hierarchy_path: self.build_hierarchy_path(game_object_address)?,
            distance,
            screen_position,
            client_position,
        })
    }
}