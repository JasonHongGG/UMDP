use crate::models::{AttachedProcess, ClassCatalogCache, ClassDetailsCache, ImageInfo};
use parking_lot::Mutex;

#[derive(Default)]
pub struct AppState {
    pub attached_process: Mutex<Option<AttachedProcess>>,
    pub image_catalog: Mutex<Option<Vec<ImageInfo>>>,
    pub class_catalog: Mutex<ClassCatalogCache>,
    pub class_details: Mutex<ClassDetailsCache>,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }
}
