//! 服务端会话：浏览器只拿一个不透明的 sid，官方 token 不出服务端。
//!
//! 落盘到 `data/sessions.json`（0600），启动时加载并清掉过期会话。

use axum::http::{header, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub const COOKIE_NAME: &str = "simple_sid";
/// 会话 30 天；上游 token 失效时会被 401 提前清掉。
pub const TTL_SECS: u64 = 30 * 24 * 3600;

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PendingCode {
    pub phone: String,
    pub auth_token: String,
    pub message_id: String,
    pub sent_at: u64,
    /// 仅 mock 模式：本地生成的一次性验证码，真实登录时为 None。
    #[serde(default)]
    pub mock_code: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Session {
    /// 官方会话 JWT；为空表示「还没登录，只是在等验证码」。
    pub token: String,
    pub phone: String,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub nickname: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub simple_id: Option<String>,
    pub created_at: u64,
    pub last_seen: u64,
    #[serde(default)]
    pub pending: Option<PendingCode>,
    /// 进过的房间，退房与「已加入」判断用。
    #[serde(default)]
    pub rooms: Vec<String>,
}

impl Session {
    pub fn pre_auth(phone: &str) -> Self {
        let now = now();
        Self {
            token: String::new(),
            phone: phone.to_string(),
            user_id: None,
            nickname: None,
            avatar_url: None,
            simple_id: None,
            created_at: now,
            last_seen: now,
            pending: None,
            rooms: Vec::new(),
        }
    }

    pub fn is_authenticated(&self) -> bool {
        !self.token.is_empty()
    }
}

#[derive(Clone)]
pub struct SessionStore {
    inner: Arc<Mutex<HashMap<String, Session>>>,
    path: Option<PathBuf>,
}

impl SessionStore {
    pub fn open(path: PathBuf) -> Self {
        let map = load(&path);
        if !map.is_empty() {
            eprintln!("[session] 从磁盘恢复 {} 个会话", map.len());
        }
        Self {
            inner: Arc::new(Mutex::new(map)),
            path: Some(path),
        }
    }

    #[cfg(test)]
    pub fn memory() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            path: None,
        }
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, Session>> {
        self.inner.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn create(&self, session: Session) -> String {
        let sid = Uuid::new_v4().simple().to_string();
        self.lock().insert(sid.clone(), session);
        self.persist();
        sid
    }

    /// 取会话并顺手清掉过期项、刷新 last_seen。
    pub fn get(&self, sid: &str) -> Option<Session> {
        let mut map = self.lock();
        let expired = match map.get(sid) {
            Some(session) => now().saturating_sub(session.created_at) > TTL_SECS,
            None => return None,
        };
        if expired {
            map.remove(sid);
            drop(map);
            self.persist();
            return None;
        }
        let session = map.get_mut(sid)?;
        session.last_seen = now();
        Some(session.clone())
    }

    pub fn update<F>(&self, sid: &str, change: F) -> Option<Session>
    where
        F: FnOnce(&mut Session),
    {
        let updated = {
            let mut map = self.lock();
            let session = map.get_mut(sid)?;
            change(session);
            session.clone()
        };
        self.persist();
        Some(updated)
    }

    pub fn remove(&self, sid: &str) -> Option<Session> {
        let removed = self.lock().remove(sid);
        if removed.is_some() {
            self.persist();
        }
        removed
    }

    pub fn persist(&self) {
        let Some(path) = &self.path else { return };
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let snapshot = self.lock().clone();
        let data = match serde_json::to_vec_pretty(&snapshot) {
            Ok(data) => data,
            Err(error) => {
                eprintln!("[session] 序列化失败: {error}");
                return;
            }
        };
        let tmp = path.with_extension("json.tmp");
        if let Err(error) = fs::write(&tmp, &data) {
            eprintln!("[session] 写入失败 {}: {error}", tmp.display());
            return;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
        }
        if let Err(error) = fs::rename(&tmp, path) {
            eprintln!("[session] 落盘失败 {}: {error}", path.display());
        }
    }
}

fn load(path: &PathBuf) -> HashMap<String, Session> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return HashMap::new(),
        Err(error) => {
            eprintln!("[session] 读取失败 {}: {error}", path.display());
            return HashMap::new();
        }
    };
    match serde_json::from_str::<HashMap<String, Session>>(&text) {
        Ok(mut map) => {
            let cutoff = now().saturating_sub(TTL_SECS);
            map.retain(|_, session| session.created_at >= cutoff);
            map
        }
        Err(error) => {
            eprintln!("[session] 解析失败，本次从空会话开始: {error}");
            HashMap::new()
        }
    }
}

pub fn sid_from_headers(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in raw.split(';') {
        let mut pair = part.trim().splitn(2, '=');
        if pair.next() == Some(COOKIE_NAME) {
            let value = pair.next().unwrap_or("").trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

pub fn session_cookie(sid: &str) -> String {
    format!("{COOKIE_NAME}={sid}; Path=/; Max-Age={TTL_SECS}; HttpOnly; SameSite=Lax")
}

pub fn clear_cookie() -> String {
    format!("{COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
}

pub fn header_value(raw: String) -> HeaderValue {
    HeaderValue::from_str(&raw).unwrap_or_else(|_| HeaderValue::from_static(""))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cookie_parsing_picks_our_sid() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("theme=dark; simple_sid=abc123; other=1"),
        );
        assert_eq!(sid_from_headers(&headers).as_deref(), Some("abc123"));
    }

    #[test]
    fn cookie_parsing_ignores_prefix_collisions() {
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, HeaderValue::from_static("xsimple_sid=nope"));
        assert_eq!(sid_from_headers(&headers), None);
    }

    #[test]
    fn expired_sessions_are_dropped() {
        let store = SessionStore::memory();
        let sid = store.create(Session::pre_auth("13800138000"));
        assert!(store.get(&sid).is_some());
        store.update(&sid, |session| {
            session.created_at = now().saturating_sub(TTL_SECS + 10);
        });
        assert!(store.get(&sid).is_none());
    }

    #[test]
    fn cookie_header_is_hardened() {
        let cookie = session_cookie("sid");
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(cookie.contains("Path=/"));
    }
}
