pub type NativeAddress = usize;

#[derive(Debug, Clone)]
pub struct NativeFieldRecord {
    pub handle: Option<NativeAddress>,
    pub name: String,
    pub type_name: String,
    pub is_static: bool,
    pub static_address: Option<NativeAddress>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone)]
pub struct NativeMethodRecord {
    pub handle: NativeAddress,
    pub name: String,
    pub signature: String,
    pub return_type: String,
    pub is_static: bool,
    pub parameter_types: Vec<String>,
}

pub trait RuntimeApi: Send + Sync {
    fn enumerate_assemblies(&self) -> Result<Vec<NativeAddress>, String>;
    fn get_assembly_image(&self, assembly: NativeAddress) -> Result<NativeAddress, String>;
    fn get_image_name(&self, image: NativeAddress) -> Result<String, String>;
    fn resolve_class(
        &self,
        image: NativeAddress,
        namespace: &str,
        class_name: &str,
    ) -> Result<NativeAddress, String>;
    fn get_parent_class(&self, class: NativeAddress) -> Result<NativeAddress, String>;
    fn enumerate_fields(&self, class: NativeAddress) -> Result<Vec<NativeFieldRecord>, String>;
    fn enumerate_methods(&self, class: NativeAddress) -> Result<Vec<NativeMethodRecord>, String>;
    fn get_object_class(&self, object: NativeAddress) -> Result<NativeAddress, String>;
    fn get_class_type_name(&self, class: NativeAddress) -> Result<String, String>;
    fn get_array_length(&self, array_object: NativeAddress) -> Result<usize, String>;
    fn get_array_element_address(
        &self,
        array_object: NativeAddress,
        index: usize,
    ) -> Result<NativeAddress, String>;
    fn unbox_object(&self, object: NativeAddress) -> Result<NativeAddress, String>;
    fn create_managed_object(&self, class: NativeAddress) -> Result<NativeAddress, String>;
    fn create_managed_string(&self, value: &str) -> Result<NativeAddress, String>;
    fn invoke_method(
        &self,
        method: NativeAddress,
        instance: NativeAddress,
        parameters: NativeAddress,
        exception: NativeAddress,
    ) -> Result<NativeAddress, String>;
    fn read_managed_string(&self, object: NativeAddress) -> Result<Option<String>, String>;
    fn try_read_unboxed_bytes(
        &self,
        object: NativeAddress,
        size: usize,
    ) -> Result<Option<Vec<u8>>, String>;
    fn describe_exception(&self, exception: NativeAddress) -> Result<Option<String>, String>;
    fn try_read_static_field_bytes(
        &self,
        field: &NativeFieldRecord,
        size: usize,
    ) -> Result<Option<Vec<u8>>, String>;
    fn try_read_instance_field_bytes(
        &self,
        instance: NativeAddress,
        field: &NativeFieldRecord,
        size: usize,
    ) -> Result<Option<Vec<u8>>, String>;
}