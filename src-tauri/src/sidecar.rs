//! Helpers for spawning the bundled Node/Hono UI process from the packaged desktop shell.
#![cfg_attr(debug_assertions, allow(dead_code))]

use std::{
  io::{BufRead, BufReader},
  path::{Path, PathBuf},
  process::{Command, Stdio},
};

/// Target-specific folder under `bundle-resources/nodejs/`.
pub fn bundled_node_subdirectory() -> &'static str {
  if cfg!(target_os = "macos") {
    if cfg!(target_arch = "aarch64") {
      "darwin-arm64"
    } else {
      "darwin-x64"
    }
  } else if cfg!(target_os = "linux") {
    "linux-x64"
  } else if cfg!(target_os = "windows") {
    "win-x64"
  } else {
    unreachable!("unsupported build target OS")
  }
}

pub fn bundled_node_exe(resources_root: &Path) -> PathBuf {
  resources_root
    .join("bundle-resources")
    .join("nodejs")
    .join(bundled_node_subdirectory())
    .join(if cfg!(target_os = "windows") {
      "node.exe"
    } else {
      "node"
    })
}

pub fn bundled_server_root(resources_root: &Path) -> PathBuf {
  resources_root.join("bundle-resources").join("server")
}

pub fn spawn_ui_sidecar(resources_root: &Path) -> Result<std::process::Child, String> {
  let node = bundled_node_exe(resources_root);
  let root = bundled_server_root(resources_root);
  let entry = root.join("dist").join("index.js");

  if !node.exists() {
    return Err(format!("Bundled Node missing ({})", node.display()));
  }
  if !entry.exists() {
    return Err(format!(
      "Bundled UI entry missing: {} — run `npm run tauri:build`.",
      entry.display()
    ));
  }

  Command::new(&node)
    .current_dir(&root)
    .env("TTT_TAURI_HOST", "1")
    .stdin(Stdio::null())
    .stderr(Stdio::inherit())
    .stdout(Stdio::piped())
    .arg(&entry)
    .args(["start", "--no-open", "--host", "127.0.0.1", "--port", "0"])
    .spawn()
    .map_err(|e| format!("spawn sidecar: {e}"))
}

/// Reads stdout until `TTT_READY <url>` is emitted by `src/ui/cli.ts`.
pub fn read_ready_url(child: &mut std::process::Child) -> Result<tauri::Url, String> {
  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "sidecar stdout is not piped".to_string())?;
  let reader = BufReader::new(stdout);

  for line in reader.lines() {
    let line = line.map_err(|e| format!("sidecar stdout: {e}"))?;
    let trimmed = line.trim();
    let Some(rest) = trimmed.strip_prefix("TTT_READY ") else {
      continue;
    };
    let url_str = rest.trim();
    let url =
      url_str
        .parse::<tauri::Url>()
        .map_err(|e| format!("invalid TTT_READY url {url_str:?}: {e}"))?;
    return Ok(url);
  }

  Err("sidecar exited before emitting TTT_READY".into())
}
