use std::{env, fs};
use zed_extension_api::{self as zed, serde_json, Result};

struct LiveLoveExtension {
    did_find_server: bool,
}

const SERVER_PATH: &str = "../../installed/livelove/server.js";

impl LiveLoveExtension {
    fn server_exists(&self) -> bool {
        fs::metadata(SERVER_PATH).map_or(false, |stat| stat.is_file())
    }

    fn server_script_path(&mut self, id: &zed::LanguageServerId) -> Result<String> {
        let server_exists = self.server_exists();
        if self.did_find_server && server_exists {
            return Ok(SERVER_PATH.to_string());
        }

        self.did_find_server = true;
        Ok(SERVER_PATH.to_string())
    }
}

impl zed::Extension for LiveLoveExtension {
    fn new() -> Self {
        Self {
            did_find_server: false,
        }
    }

    fn language_server_command(
        &mut self,
        id: &zed::LanguageServerId,
        _: &zed::Worktree,
    ) -> Result<zed::Command> {
        let server_path = self.server_script_path(id)?;
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![
                env::current_dir()
                    .unwrap()
                    .join(&server_path)
                    .to_string_lossy()
                    .to_string(),
                "--stdio".to_string(),
            ],
            env: Default::default(),
        })
    }

    fn language_server_initialization_options(
        &mut self,
        _: &zed::LanguageServerId,
        _: &zed::Worktree,
    ) -> Result<Option<serde_json::Value>> {
        Ok(Some(serde_json::json!({
            "serverOptions": {
                "port": 12345,
                "host": "127.0.0.1"
            },
            "inlayHints": {
                "enabled": true,
            },
            "codeActions": {
                "enabled": true,
            },
            "codeLens": {
                "enabled": true,
            }
        })))
    }
}

zed::register_extension!(LiveLoveExtension);
