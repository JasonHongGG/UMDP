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

pub fn load_scene_inspector_header(
    runtime_session: &RuntimeSession,
    object_address: &str,
) -> Result<RuntimeSceneObjectInspectorHeaderSnapshot, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    let object_address = parse_address(object_address)?;
    kernel.load_scene_inspector_header(object_address)
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

pub fn pick_scene_object_at(
    runtime_session: &RuntimeSession,
    client_position: RuntimeScreenPoint,
    screen_position: RuntimeScreenPoint,
    client_height: i32,
) -> Result<Option<RuntimeSceneMouseTargetHit>, String> {
    let mut kernel = SceneQueryKernel::new(runtime_session)?;
    kernel.pick_scene_object_at(client_position, screen_position, client_height)
}