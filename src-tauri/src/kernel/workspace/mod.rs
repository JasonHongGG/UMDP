use crate::state::AppState;

pub fn reset_for_new_attachment(state: &AppState) {
    state.runtime_kernel.runtime.reset();
    state.scene_module.workspace.reset();
    state.scene_module.children.reset();
    state.scene_module.inspector.reset();
}