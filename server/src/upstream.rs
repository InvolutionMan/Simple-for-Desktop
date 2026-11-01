//! 官方后端的适配层：统一头、登录三步、错误翻译、夜市聚合、房间快照。

use crate::error::ApiError;
use axum::http::StatusCode;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT};
use reqwest::{Client, Method};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    time::Duration,
};

const BASE: &str = "https://simple.imsummer.cn";

#[derive(Debug, Clone)]
pub enum UpstreamError {
    Http { status: u16, message: String },
    Network(String),
    Decode(String),
}

impl UpstreamError {
    pub fn is_unauthorized(&self) -> bool {
        matches!(self, Self::Http { status: 401, .. })
    }

    /// 给界面的一句中文；房间接口要单独展示。
    pub fn ui_message(&self) -> String {
        match self {
            Self::Http { message, .. } => humanize(message).0,
            Self::Network(_) => "网络连接失败，请检查网络后重试。".to_string(),
            Self::Decode(_) => "服务返回了无法识别的内容。".to_string(),
        }
    }

    pub fn to_api_error(&self) -> ApiError {
        match self {
            Self::Http { status, message } => {
                if *status == 401 {
                    return ApiError::session_expired();
                }
                let (text, rate_limited) = humanize(message);
                let code = if rate_limited { "rate_limited" } else { "upstream_error" };
                let status_code = if *status == 429 {
                    StatusCode::TOO_MANY_REQUESTS
                } else if *status >= 500 {
                    StatusCode::BAD_GATEWAY
                } else {
                    StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY)
                };
                ApiError {
                    status: status_code,
                    code,
                    message: text,
                    rate_limited,
                    retry_after: rate_limited.then_some(300),
                }
            }
            Self::Network(_) => ApiError::new(
                StatusCode::BAD_GATEWAY,
                "network_error",
                "网络连接失败，请检查网络后重试。",
            ),
            Self::Decode(_) => ApiError::upstream("服务返回了无法识别的内容。"),
        }
    }
}

/// 官方客户端标识头：缺 `appVersionCode` 会被按 Web 端限流（夜市每页只给 4 条）。
fn client_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in [
        ("end", "ios"),
        ("os", "2"),
        ("channel", "appstore"),
        ("appversionname", "1.9.32"),
        ("appversioncode", "779"),
        ("languagecode", "zh"),
    ] {
        headers.insert(name, HeaderValue::from_static(value));
    }
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers
}

pub struct Upstream {
    base: String,
    client: Client,
    headers: HeaderMap,
}

impl Upstream {
    pub fn new(base: &str) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent("SimpleWeb/0.1")
            .build()
            .expect("构建 HTTP 客户端失败");
        let mut headers = client_headers();
        headers.insert(
            "origin",
            HeaderValue::from_static("https://simple.imsummer.cn"),
        );
        Self {
            base: base.trim_end_matches('/').to_string(),
            client,
            headers,
        }
    }

    pub fn default_base() -> &'static str {
        BASE
    }

    async fn send(
        &self,
        method: Method,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> Result<Value, UpstreamError> {
        let url = format!("{}/{}", self.base, path.trim_start_matches('/'));
        let mut request = self
            .client
            .request(method, &url)
            .headers(self.headers.clone())
            .timeout(Duration::from_secs(20));

        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }

        let response = request
            .send()
            .await
            .map_err(|error| UpstreamError::Network(error.to_string()))?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let parsed: Option<Value> = if text.trim().is_empty() {
            None
        } else {
            serde_json::from_str(&text).ok()
        };

        if !status.is_success() {
            let message = parsed
                .as_ref()
                .and_then(|value| value.get("message").or_else(|| value.get("error")))
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| truncate(&text, 200));
            return Err(UpstreamError::Http {
                status: status.as_u16(),
                message,
            });
        }

        Ok(parsed.unwrap_or(Value::Null))
    }

    pub async fn get(&self, path: &str, token: Option<&str>) -> Result<Value, UpstreamError> {
        self.send(Method::GET, path, token, None).await
    }

    pub async fn post(
        &self,
        path: &str,
        token: Option<&str>,
        body: Value,
    ) -> Result<Value, UpstreamError> {
        self.send(Method::POST, path, token, Some(body)).await
    }

    pub async fn delete(&self, path: &str, token: Option<&str>) -> Result<Value, UpstreamError> {
        self.send(Method::DELETE, path, token, None).await
    }

    // MARK: - 登录三步

    /// 换一个 auth 身份的令牌：上游读 JWT 里的 `auth_id`，普通会话 JWT 会被判不存在。
    pub async fn auth_token(&self) -> Result<String, UpstreamError> {
        let uid = format!("mac-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
        let path = format!("api/v3/auths?provider=wechat&uid={uid}&token=mac");
        let value = self.get(&path, None).await?;
        value
            .get("auth_token")
            .and_then(Value::as_str)
            .filter(|token| !token.is_empty())
            .map(str::to_string)
            .ok_or_else(|| UpstreamError::Decode("auth_token 缺失".into()))
    }

    pub async fn request_code(
        &self,
        phone: &str,
        auth_token: &str,
    ) -> Result<String, UpstreamError> {
        let value = self
            .post(
                "api/v3/phone_messages/deliveries",
                None,
                json!({
                    "auth_token": auth_token,
                    "area_code": "+86",
                    "phone": phone,
                }),
            )
            .await?;
        value
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .map(str::to_string)
            .ok_or_else(|| UpstreamError::Decode("phone_message_id 缺失".into()))
    }

    pub async fn verify_code(&self, message_id: &str, code: &str) -> Result<Value, UpstreamError> {
        self.post(
            "api/v3/phone_messages/verifications",
            None,
            json!({ "phone_message_id": message_id, "code": code }),
        )
        .await
    }

    pub async fn current_user(&self, token: &str) -> Result<Value, UpstreamError> {
        self.get("api/v3/current_user", Some(token)).await
    }

    // MARK: - 夜市

    /// 夜市列表：banners 拿开市状态，列表最多翻 10 页、按 id 去重。
    pub async fn night_markets(&self, token: &str) -> Result<Value, UpstreamError> {
        let banner = self
            .get("api/v3/night_markets/banners", Some(token))
            .await
            .ok();

        let mut channels: Vec<Value> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let mut cursor = String::new();

        for _ in 0..10 {
            let path = format!("api/v3/night_markets?last_id={cursor}&per_page=10");
            let page = self.get(&path, Some(token)).await?;
            let items = page.as_array().cloned().unwrap_or_default();
            if items.is_empty() {
                break;
            }

            for item in &items {
                let Some(id) = item.get("id").and_then(Value::as_str) else {
                    continue;
                };
                if seen.insert(id.to_string()) {
                    channels.push(normalize_channel(item));
                }
            }

            let next = items
                .last()
                .and_then(|item| item.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if next.is_empty() || next == cursor {
                break;
            }
            cursor = next.to_string();
        }

        let is_open = banner
            .as_ref()
            .and_then(|value| value.get("is_in_progress"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let end_at = banner
            .as_ref()
            .and_then(|value| value.get("end_at"))
            .cloned()
            .unwrap_or(Value::Null);

        Ok(json!({
            "is_open": is_open,
            "end_at": end_at,
            "channels": channels,
        }))
    }

    /// 列表里的人数会变：只刷第一页，不重排、不动分页。
    pub async fn night_counts(&self, token: &str) -> Result<Value, UpstreamError> {
        let page = self
            .get("api/v3/night_markets?last_id=&per_page=10", Some(token))
            .await?;
        let mut counts = serde_json::Map::new();
        for item in page.as_array().cloned().unwrap_or_default() {
            let Some(id) = item.get("id").and_then(Value::as_str) else {
                continue;
            };
            let count = item
                .get("chat_room")
                .and_then(|chat| chat.get("chat_room_members_count"))
                .and_then(Value::as_i64)
                .unwrap_or(0);
            counts.insert(id.to_string(), json!(count));
        }
        Ok(json!({ "counts": counts }))
    }

    // MARK: - 房间

    pub async fn room_snapshot(&self, room_id: &str, token: &str) -> RoomSnapshot {
        let info_path = format!("api/v3/chatroom_channels/{room_id}");
        let seats_path = format!("api/v3/voice_members?channel_id={room_id}");
        let (info, seats) = tokio::join!(
            self.get(&info_path, Some(token)),
            self.get(&seats_path, Some(token))
        );
        RoomSnapshot {
            info: info.map(|value| RoomInfo::from_value(&value)),
            seats: seats.map(|value| {
                value
                    .as_array()
                    .map(|items| items.iter().filter_map(normalize_seat).collect())
                    .unwrap_or_default()
            }),
        }
    }

    /// 进房：上游要求先成为频道成员，之后读麦位才不是 500。
    pub async fn join_room(&self, room_id: &str, token: &str) -> Result<(), UpstreamError> {
        self.post(
            "api/v3/voice_members",
            Some(token),
            json!({ "channel_id": room_id }),
        )
        .await
        .map(|_| ())
    }

    /// 退房必须带 user_id，少这个参数上游会 400，麦位记录会变成幽灵。
    pub async fn leave_room(
        &self,
        room_id: &str,
        token: &str,
        user_id: &str,
    ) -> Result<(), UpstreamError> {
        if user_id.is_empty() {
            return Err(UpstreamError::Decode("user_id 缺失".into()));
        }
        let path = format!("api/v3/voice_members?channel_id={room_id}&user_id={user_id}");
        self.delete(&path, Some(token)).await.map(|_| ())
    }
}

pub struct RoomSnapshot {
    pub info: Result<RoomInfo, UpstreamError>,
    pub seats: Result<Vec<Value>, UpstreamError>,
}

pub struct RoomInfo {
    pub count: i64,
    pub mic_mode: String,
}

impl RoomInfo {
    fn from_value(value: &Value) -> Self {
        let chat = value.get("chat_room");
        Self {
            count: chat
                .and_then(|chat| chat.get("chat_room_members_count"))
                .and_then(Value::as_i64)
                .unwrap_or(0),
            mic_mode: chat
                .and_then(|chat| chat.get("mic_mode"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        }
    }
}

fn normalize_channel(item: &Value) -> Value {
    let chat = item.get("chat_room");
    json!({
        "id": item.get("id").cloned().unwrap_or(Value::Null),
        "name": item.get("name").and_then(Value::as_str).unwrap_or("未命名房间"),
        "count": chat
            .and_then(|chat| chat.get("chat_room_members_count"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        "im_id": chat.and_then(|chat| chat.get("im_id")).cloned().unwrap_or(Value::Null),
        "root_name": item
            .get("root_channel")
            .and_then(|root| root.get("name"))
            .cloned()
            .unwrap_or(Value::Null),
    })
}

fn normalize_seat(item: &Value) -> Option<Value> {
    let id = item.get("id").and_then(Value::as_str)?;
    Some(json!({
        "id": id,
        "nickname": item.get("nickname").and_then(Value::as_str).unwrap_or("匿名用户"),
        "avatar_url": item
            .get("avatar_url")
            .and_then(Value::as_str)
            .filter(|url| !url.is_empty())
            .map(str::to_string),
        "avatar_color": item.get("avatar_color").cloned().unwrap_or(Value::Null),
        "role": item.get("role").and_then(Value::as_str).unwrap_or(""),
        "im_id": item.get("im_id").cloned().unwrap_or(Value::Null),
    }))
}

/// 把上游的错误原文翻成界面能直接用的一句话。
fn humanize(raw: &str) -> (String, bool) {
    let text = raw.trim();
    if text.contains("操作过快") {
        return ("操作过于频繁，请稍后再试。".into(), true);
    }
    if text.contains("频率限制") {
        return ("该手机号发送过于频繁，请过几分钟再试。".into(), true);
    }
    if text.contains("手机号不正确") {
        return ("手机号格式不正确。".into(), false);
    }
    if text.contains("auth.not_found") {
        return ("登录凭据已失效，请重新获取验证码。".into(), false);
    }
    if text.contains("验证码") {
        return ("验证码不正确或已过期。".into(), false);
    }
    if text.contains("没有权限") {
        return ("没有权限查看这个频道。".into(), false);
    }
    if text.is_empty() {
        return ("服务暂时不可用，请稍后再试。".into(), false);
    }
    (truncate(text, 120), false)
}

fn truncate(text: &str, limit: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= limit {
        return trimmed.to_string();
    }
    trimmed.chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limited_messages_carry_a_hint() {
        let (text, limited) = humanize("发送过于频繁，触发频率限制");
        assert!(limited);
        assert!(text.contains("过几分钟"));
    }

    #[test]
    fn auth_not_found_is_translated() {
        let (text, limited) = humanize("auth.not_found");
        assert!(!limited);
        assert!(text.contains("登录凭据"));
    }

    #[test]
    fn channel_normalization_keeps_the_official_fields() {
        let raw = json!({
            "id": "room-1",
            "name": "乌托邦",
            "chat_room": { "im_id": "123", "chat_room_members_count": 6 },
            "root_channel": { "name": "夜市" }
        });
        let channel = normalize_channel(&raw);
        assert_eq!(channel["name"], "乌托邦");
        assert_eq!(channel["count"], 6);
        assert_eq!(channel["root_name"], "夜市");
    }

    #[test]
    fn empty_seats_are_skipped() {
        let raw = json!([{ "id": "u1", "nickname": "piper", "avatar_color": "beede7" }, { "nickname": "无 id" }]);
        let seats: Vec<Value> = raw.as_array().unwrap().iter().filter_map(normalize_seat).collect();
        assert_eq!(seats.len(), 1);
        assert_eq!(seats[0]["avatar_color"], "beede7");
    }
}
