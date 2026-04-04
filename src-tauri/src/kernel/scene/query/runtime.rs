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
            let actual_without_extension = actual_name.strip_suffix(".dll").unwrap_or(&actual_name);
            if actual_name == expected || actual_without_extension == expected_without_extension {
                return Ok(image);
            }
        }

        Err(format!("image not found: {image_name}"))
    }

    fn resolve_cached_type_name(&mut self, class_handle: NativeAddress) -> Result<String, String> {
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
            let argument_pointer =
                self.marshal_argument(parameter_type, argument, &mut _argument_storage)?;
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
        self.memory
            .write_value(exception_storage.address, &0usize)?;

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
            bytes
                .try_into()
                .map_err(|_| "invalid integer payload".to_string())?,
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
        let value = bytes.first().copied().ok_or_else(|| {
            format!("{} [{}]: invalid bool payload", method.name, method.signature)
        })?;
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
        let Some(field) = self.try_find_instance_field(class_handle, field_name, "System.Int32")?
        else {
            return Ok(None);
        };
        let Some(bytes) = self.runtime_api.try_read_instance_field_bytes(
            instance_address,
            &field,
            std::mem::size_of::<i32>(),
        )?
        else {
            return Ok(None);
        };
        if bytes.len() != std::mem::size_of::<i32>() {
            return Err(format!("invalid Int32 field payload for {field_name}"));
        }
        Ok(Some(i32::from_ne_bytes(
            bytes
                .try_into()
                .map_err(|_| "invalid Int32 field payload".to_string())?,
        )))
    }

    fn read_float_field(
        &mut self,
        class_handle: NativeAddress,
        instance_address: NativeAddress,
        field_name: &str,
    ) -> Result<Option<f32>, String> {
        let Some(field) = self.try_find_instance_field(class_handle, field_name, "System.Single")?
        else {
            return Ok(None);
        };
        let Some(bytes) = self.runtime_api.try_read_instance_field_bytes(
            instance_address,
            &field,
            std::mem::size_of::<f32>(),
        )?
        else {
            return Ok(None);
        };
        if bytes.len() != std::mem::size_of::<f32>() {
            return Err(format!("invalid Single field payload for {field_name}"));
        }
        Ok(Some(f32::from_ne_bytes(bytes.try_into().map_err(
            |_| "invalid Single field payload".to_string(),
        )?)))
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
        let scene_manager_class =
            self.resolve_unity_class("UnityEngine.SceneManagement", "SceneManager")?;
        let scene_class = self.resolve_unity_class("UnityEngine.SceneManagement", "Scene")?;
        let get_scene_count = self.require_method(scene_manager_class, "get_sceneCount", 0)?;
        let get_scene_at = self.require_method(scene_manager_class, "GetSceneAt", 1)?;
        let is_valid = self.try_find_method(scene_class, "IsValid", 0)?;

        let scene_count = self.invoke_int(&get_scene_count, None, &[])?;
        for index in 0..scene_count {
            let scene_boxed =
                self.invoke_object(&get_scene_at, None, &[SceneInvokeArgument::Number(index)])?;
            if scene_boxed == 0 {
                continue;
            }

            let raw_scene =
                self.require_unboxed(scene_boxed, "UnityEngine.SceneManagement.Scene")?;
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

        let get_type = self.require_method_by_parameter_types(type_class, "GetType", &["System.String"])?;
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

    fn require_unboxed(
        &self,
        boxed_object_address: NativeAddress,
        context: &str,
    ) -> Result<NativeAddress, String> {
        let raw_value = self.runtime_api.unbox_object(boxed_object_address)?;
        if raw_value == 0 {
            return Err(format!("{context}: failed to unbox value-type instance"));
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