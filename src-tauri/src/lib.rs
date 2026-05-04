#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    use tauri::Manager;
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      println!("Vidnovagram reopened with argv: {argv:?}");
      // Bring the existing window to front when a second instance is
      // launched (e.g. via vidnovagram:// deep link). Without this the
      // process exits silently and the user never sees a response. The
      // URL itself is forwarded to tauri-plugin-deep-link automatically
      // because the single-instance plugin is built with the
      // `deep-link` feature.
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
      }
    }));
  }

  builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations(
          "sqlite:vidnovagram.db",
          vec![
            tauri_plugin_sql::Migration {
              version: 1,
              description: "create messages cache",
              sql: "
                CREATE TABLE IF NOT EXISTS messages (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  remote_id TEXT NOT NULL,
                  client_id TEXT NOT NULL,
                  account_id TEXT NOT NULL,
                  channel TEXT NOT NULL DEFAULT 'tg',
                  message_date TEXT NOT NULL,
                  direction TEXT NOT NULL,
                  text TEXT,
                  has_media INTEGER NOT NULL DEFAULT 0,
                  media_type TEXT,
                  media_file TEXT,
                  thumbnail TEXT,
                  sender_name TEXT,
                  raw_json TEXT NOT NULL,
                  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                  UNIQUE(remote_id, account_id, channel)
                );
                CREATE INDEX IF NOT EXISTS idx_messages_chat
                  ON messages(client_id, account_id, message_date DESC);
                CREATE INDEX IF NOT EXISTS idx_messages_date
                  ON messages(message_date DESC);
                CREATE INDEX IF NOT EXISTS idx_messages_text
                  ON messages(text);
              ",
              kind: tauri_plugin_sql::MigrationKind::Up,
            },
          ],
        )
        .build(),
    )
    .setup(|app| {
      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        app.deep_link().register_all()?;
      }

      #[cfg(debug_assertions)]
      {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Vidnovagram application");
}
