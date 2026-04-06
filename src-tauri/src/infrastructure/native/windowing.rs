use crate::domain::analysis_models::{
    ProcessWindowCandidate, RuntimeScreenPoint, RuntimeScreenRect,
};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_ESCAPE, VK_LBUTTON};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetClientRect, GetCursorPos, GetForegroundWindow,
    GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindow, IsWindowVisible,
};

struct EnumState {
    pid: u32,
    handles: Vec<HWND>,
}

pub fn enumerate_process_windows(pid: u32) -> Result<Vec<ProcessWindowCandidate>, String> {
    let mut state = EnumState {
        pid,
        handles: Vec::new(),
    };

    unsafe {
        let _ = EnumWindows(
            Some(enum_window_for_process),
            LPARAM(&mut state as *mut EnumState as isize),
        );
    }

    let foreground = unsafe { GetForegroundWindow() };
    let mut windows = state
        .handles
        .into_iter()
        .filter_map(|hwnd| build_process_window_candidate(hwnd, pid, foreground).ok().flatten())
        .collect::<Vec<_>>();

    windows.sort_by(|left, right| {
        right
            .is_foreground
            .cmp(&left.is_foreground)
            .then_with(|| left.is_minimized.cmp(&right.is_minimized))
            .then_with(|| {
                window_area(&right.client_rect).cmp(&window_area(&left.client_rect))
            })
            .then_with(|| left.title.to_ascii_lowercase().cmp(&right.title.to_ascii_lowercase()))
    });

    Ok(windows)
}

pub fn inspect_process_window(
    pid: u32,
    window_handle: usize,
) -> Result<Option<ProcessWindowCandidate>, String> {
    let hwnd = HWND(window_handle as *mut core::ffi::c_void);
    if !unsafe { IsWindow(hwnd).as_bool() } {
        return Ok(None);
    }

    let foreground = unsafe { GetForegroundWindow() };
    build_process_window_candidate(hwnd, pid, foreground)
}

pub fn get_cursor_screen_position() -> Result<RuntimeScreenPoint, String> {
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point) }
        .map_err(|error| format!("Failed to query cursor position: {}", error.message()))?;
    Ok(RuntimeScreenPoint {
        x: point.x,
        y: point.y,
    })
}

pub fn is_left_mouse_button_down() -> bool {
    unsafe { (GetAsyncKeyState(VK_LBUTTON.0.into()) as u16 & 0x8000) != 0 }
}

pub fn is_escape_key_down() -> bool {
    unsafe { (GetAsyncKeyState(VK_ESCAPE.0.into()) as u16 & 0x8000) != 0 }
}

unsafe extern "system" fn enum_window_for_process(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = &mut *(lparam.0 as *mut EnumState);
    let mut window_pid = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut window_pid));
    if window_pid == state.pid {
        state.handles.push(hwnd);
    }
    BOOL(1)
}

fn build_process_window_candidate(
    hwnd: HWND,
    pid: u32,
    foreground: HWND,
) -> Result<Option<ProcessWindowCandidate>, String> {
    if !unsafe { IsWindow(hwnd).as_bool() } {
        return Ok(None);
    }

    let is_visible = unsafe { IsWindowVisible(hwnd).as_bool() };
    if !is_visible {
        return Ok(None);
    }

    let mut window_pid = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut window_pid));
    }
    if window_pid != pid {
        return Ok(None);
    }

    let window_rect = read_window_rect(hwnd)?;
    let client_rect = read_client_rect(hwnd)?;
    if client_rect.width <= 0 || client_rect.height <= 0 {
        return Ok(None);
    }

    Ok(Some(ProcessWindowCandidate {
        pid,
        window_handle: format_window_handle(hwnd),
        title: read_window_text(hwnd),
        class_name: read_class_name(hwnd),
        window_rect,
        client_rect,
        is_visible,
        is_minimized: unsafe { IsIconic(hwnd).as_bool() },
        is_foreground: hwnd == foreground,
    }))
}

fn read_window_text(hwnd: HWND) -> String {
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return String::new();
    }

    let mut buffer = vec![0u16; length as usize + 1];
    let written = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    String::from_utf16_lossy(&buffer[..written as usize])
}

fn read_class_name(hwnd: HWND) -> String {
    let mut buffer = vec![0u16; 256];
    let written = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if written <= 0 {
        return String::new();
    }

    String::from_utf16_lossy(&buffer[..written as usize])
}

fn read_window_rect(hwnd: HWND) -> Result<RuntimeScreenRect, String> {
    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect) }
        .map_err(|error| format!("Failed to query window bounds: {}", error.message()))?;
    Ok(to_runtime_rect(rect))
}

fn read_client_rect(hwnd: HWND) -> Result<RuntimeScreenRect, String> {
    let mut rect = RECT::default();
    unsafe { GetClientRect(hwnd, &mut rect) }
        .map_err(|error| format!("Failed to query client bounds: {}", error.message()))?;

    let mut top_left = POINT { x: rect.left, y: rect.top };
    let mut bottom_right = POINT {
        x: rect.right,
        y: rect.bottom,
    };
    if !unsafe { ClientToScreen(hwnd, &mut top_left) }.as_bool() {
        return Err("Failed to map client origin to screen".to_string());
    }
    if !unsafe { ClientToScreen(hwnd, &mut bottom_right) }.as_bool() {
        return Err("Failed to map client extent to screen".to_string());
    }

    Ok(RuntimeScreenRect {
        left: top_left.x,
        top: top_left.y,
        right: bottom_right.x,
        bottom: bottom_right.y,
        width: bottom_right.x - top_left.x,
        height: bottom_right.y - top_left.y,
    })
}

fn to_runtime_rect(rect: RECT) -> RuntimeScreenRect {
    RuntimeScreenRect {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
    }
}

fn window_area(rect: &RuntimeScreenRect) -> i64 {
    i64::from(rect.width.max(0)) * i64::from(rect.height.max(0))
}

fn format_window_handle(hwnd: HWND) -> String {
    format!("0x{:x}", hwnd.0 as usize)
}