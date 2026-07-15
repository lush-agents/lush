use serde::Serialize;
use std::{
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};
use tauri::{Manager, State, WindowEvent};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeSidecarConnection {
    base_url: String,
    token: String,
}

struct CodeSidecarState {
    connection: Result<CodeSidecarConnection, String>,
    child: Mutex<Option<Child>>,
}

#[tauri::command]
fn code_sidecar_connection(
    state: State<'_, CodeSidecarState>,
) -> Result<CodeSidecarConnection, String> {
    state.connection.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let (connection, child) = match start_code_sidecar() {
                Ok((connection, child)) => (Ok(connection), Some(child)),
                Err(error) => (Err(error), None),
            };
            app.manage(CodeSidecarState {
                connection,
                child: Mutex::new(child),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![code_sidecar_connection])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Lush");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = event
        {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }

        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<CodeSidecarState>() {
                if let Ok(mut child) = state.child.lock() {
                    if let Some(mut process) = child.take() {
                        #[cfg(unix)]
                        unsafe {
                            libc::kill(process.id() as i32, libc::SIGTERM);
                        }
                        #[cfg(not(unix))]
                        let _ = process.kill();
                        let _ = process.wait();
                    }
                }
            }
        }
    });
}

fn start_code_sidecar() -> Result<(CodeSidecarConnection, Child), String> {
    let token = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let (executable, arguments, working_directory) = sidecar_command()?;
    let mut child = Command::new(executable)
        .args(arguments)
        .arg("--port=0")
        .current_dir(working_directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("Unable to launch the Lush Code sidecar: {error}"))?;
    child
        .stdin
        .take()
        .ok_or("The Lush Code sidecar did not expose stdin")?
        .write_all(token.as_bytes())
        .map_err(|error| format!("Unable to authenticate the Lush Code sidecar: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("The Lush Code sidecar did not expose stdout")?;
    let mut ready_line = String::new();
    BufReader::new(stdout)
        .read_line(&mut ready_line)
        .map_err(|error| format!("Unable to read Lush Code sidecar startup: {error}"))?;
    let ready: serde_json::Value = serde_json::from_str(ready_line.trim())
        .map_err(|error| format!("Invalid Lush Code sidecar startup response: {error}"))?;
    let base_url = ready
        .get("baseUrl")
        .and_then(serde_json::Value::as_str)
        .ok_or("The Lush Code sidecar startup response omitted baseUrl")?
        .to_owned();

    Ok((CodeSidecarConnection { base_url, token }, child))
}

#[cfg(debug_assertions)]
fn sidecar_command() -> Result<(PathBuf, Vec<String>, PathBuf), String> {
    let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .map_err(|error| format!("Unable to resolve the Lush repository: {error}"))?;
    let bun = ["/opt/homebrew/bin/bun", "/usr/local/bin/bun"]
        .iter()
        .map(PathBuf::from)
        .find(|candidate| candidate.exists())
        .ok_or("Bun was not found in a supported installation location")?;
    Ok((
        bun,
        vec![
            "run".to_owned(),
            repository
                .join("services/agent/src/code/sidecar.ts")
                .to_string_lossy()
                .into_owned(),
        ],
        repository,
    ))
}

#[cfg(not(debug_assertions))]
fn sidecar_command() -> Result<(PathBuf, Vec<String>, PathBuf), String> {
    let executable_directory = std::env::current_exe()
        .map_err(|error| format!("Unable to locate the Lush application: {error}"))?
        .parent()
        .ok_or("The Lush application has no executable directory")?
        .to_owned();
    Ok((
        executable_directory.join("lush-agent"),
        Vec::new(),
        executable_directory,
    ))
}
