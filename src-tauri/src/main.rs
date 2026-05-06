#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use std::sync::Mutex;

#[cfg(debug_assertions)]
use std::{
  net::TcpStream,
  thread,
  time::Duration,
};

use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{
  menu::{Menu, MenuItem},
  Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri::{AppHandle, WebviewWindow};

#[cfg(not(debug_assertions))]
use sidecar::{bundled_node_exe, bundled_server_root, read_ready_url, spawn_ui_sidecar};
#[cfg(not(debug_assertions))]
use tauri_plugin_updater::UpdaterExt;

type SidecarSlot = Mutex<Option<std::process::Child>>;

fn kill_sidecar(app: &AppHandle) {
  let Some(state) = app.try_state::<SidecarSlot>() else {
    return;
  };
  let Ok(mut guard) = state.lock() else {
    return;
  };
  if let Some(mut child) = guard.take() {
    let _ = child.kill();
  }
}

#[cfg(debug_assertions)]
fn wait_tcp(host: &str, port: u16, label: &str) {
  for _ in 0..240_u32 {
    if TcpStream::connect((host, port)).is_ok() {
      return;
    }
    thread::sleep(Duration::from_millis(250));
  }
  eprintln!("TTT desktop: timed out waiting for {label} on {host}:{port}");
}

fn reveal_window(win: &WebviewWindow) -> tauri::Result<()> {
  if win.is_visible().unwrap_or(false) {
    win.set_focus()?;
  } else {
    win.show()?;
    win.set_focus()?;
  }
  Ok(())
}

fn install_tray(app: &AppHandle) -> tauri::Result<()> {
  let show = MenuItem::with_id(app, "show", "Show window", true, Option::<&str>::None)?;
  let quit = MenuItem::with_id(app, "quit", "Quit TTT", true, Option::<&str>::None)?;
  let menu = Menu::with_items(app, &[&show, &quit])?;

  let icon = app
    .default_window_icon()
    .ok_or_else(|| tauri::Error::InvalidWindowHandle)?;

  TrayIconBuilder::with_id("main_tray")
    .tooltip("TTT — The Tortoise Trainer")
    .icon(icon.clone())
    .show_menu_on_left_click(true)
    .menu(&menu)
    .on_menu_event(|app_handle, ev| match ev.id().as_ref() {
      "quit" => {
        kill_sidecar(app_handle);
        app_handle.exit(0);
      }
      "show" => {
        if let Some(win) = app_handle.get_webview_window("main") {
          let _ = reveal_window(&win);
        }
      }
      _ => {}
    })
    .on_tray_icon_event(|tray, evt| {
      match evt {
        TrayIconEvent::DoubleClick {
          button: tauri::tray::MouseButton::Left,
          ..
        }
        | TrayIconEvent::Click {
          button: tauri::tray::MouseButton::Right,
          button_state: tauri::tray::MouseButtonState::Down,
          ..
        } => {
          if let Some(win) = tray.app_handle().get_webview_window("main") {
            let _ = reveal_window(&win);
          }
        }
        _ => {}
      }
    })
    .build(app)?;

  Ok(())
}

#[cfg(not(debug_assertions))]
fn schedule_updater_check(app_handle: AppHandle) {
  tauri::async_runtime::spawn(async move {
    let Ok(updater) = app_handle.updater() else {
      return;
    };
    if let Err(e) = updater.check().await {
      eprintln!("TTT updater check failed: {e}");
    }
  });
}

fn main() {
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = reveal_window(&w);
      }
    }));
  }

  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_autostart::Builder::new().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(SidecarSlot::new(None))
    .setup(|app| {
      #[cfg(debug_assertions)]
      {
        // `npm run dev:ui` serves the SPA on Vite and proxies `/api` to `dev:ui:server` on 5174.
        wait_tcp("127.0.0.1", 5173, "Vite dev server");
        let url = tauri::Url::parse("http://127.0.0.1:5173").expect("static dev UI url");

        WebviewWindowBuilder::new(app.handle(), "main", WebviewUrl::External(url))
          .title("TTT — The Tortoise Trainer")
          .inner_size(1280.0, 840.0)
          .min_inner_size(800.0, 560.0)
          .build()?;

        install_tray(app.handle())?;

        #[cfg(debug_assertions)]
        {
          println!("TTT desktop (dev): WebView pointed at http://127.0.0.1:5173.");
        }

        Ok(())
      }
      #[cfg(not(debug_assertions))]
      {
        let resources = app.path().resource_dir()?;
        let node = bundled_node_exe(&resources);
        let marker = bundled_server_root(&resources)
          .join("dist")
          .join("index.js");
        if !node.exists() || !marker.exists() {
          eprintln!(
            "TTT desktop: missing staged runtime under `{}`. Build with `npm run tauri:build`.",
            resources.display(),
          );
          return Err(Box::<dyn std::error::Error>::from(
            "missing bundle-resources (desktop runtime not staged)".to_owned(),
          )
          .into());
        }

        let mut sidecar_child =
          spawn_ui_sidecar(&resources).map_err(|e| format!("spawn sidecar: {e}"))?;
        let startup_url = read_ready_url(&mut sidecar_child)?;
        let _ = app
          .state::<SidecarSlot>()
          .lock()
          .map_err(|_| "sidecar mutex poisoned".to_string())?
          .replace(sidecar_child);

        WebviewWindowBuilder::new(
          app.handle(),
          "main",
          WebviewUrl::External(startup_url),
        )
        .title("TTT — The Tortoise Trainer")
        .inner_size(1280.0, 840.0)
        .min_inner_size(800.0, 560.0)
        .build()?;

        install_tray(app.handle())?;
        schedule_updater_check(app.handle().clone());
        Ok(())
      }
    })
    .on_window_event(|window, event| {
      if cfg!(not(debug_assertions)) {
        if let WindowEvent::CloseRequested { api, .. } = event {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error building Tauri application")
    .run(|app_handle, event| {
      #[allow(clippy::single_match)]
      match event {
        RunEvent::Exit => {
          kill_sidecar(app_handle);
        }
        _ => {}
      }
    });
}
