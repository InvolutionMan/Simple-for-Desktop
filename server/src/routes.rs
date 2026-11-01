//! 所有 `/api` 路由。上游的原始 JSON 直接透传给前端，只有夜市与麦位做归一化。

use crate::{error::ApiError, mock, session, upstream::UpstreamError, AppState};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

pub fn router(state: Arc<AppState>) -> Router {
    let index = state.cfg.web_dir.join("index.html");
    let mut router = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/code", post(send_code))
        .route("/api/auth/login", post(login))
        .route("/api/auth/session", get(get_session))
        .route("/api/auth/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/feed", get(feed))
        .route("/api/profile/posts", get(profile_posts))
        .route("/api/channels", get(joined_channels))
        .route("/api/channels/{id}/posts", get(channel_posts))
        .route("/api/posts/{id}/comments", get(comments).post(post_comment))
        .route("/api/comments/{id}/replies", get(replies).post(post_reply))
        .route("/api/votes", post(vote_post))
        .route("/api/comment-votes", post(vote_comment))
        .route("/api/night-markets", get(night_markets))
        .route("/api/night-markets/counts", get(night_counts))
        .route("/api/rooms/{id}/join", post(join_room))
        .route("/api/rooms/{id}/state", get(room_state))
        .route("/api/rooms/{id}/leave", post(leave_room))
        .route("/api/im/session", post(im_session))
        .route("/api/dev/session", post(dev_session));

    if index.exists() {
        // ServeDir::not_found_service 会把兜底页也标成 404；这里自己读文件，SPA 才会是 200。
        router = router.fallback(spa_fallback);
    }

    router.with_state(state)
}

// MARK: - 响应

pub struct R {
    status: StatusCode,
    body: Value,
    cookie: Option<String>,
}

impl R {
    fn ok(body: Value) -> Self {
        Self {
            status: StatusCode::OK,
            body,
            cookie: None,
        }
    }

    fn created(body: Value) -> Self {
        Self {
            status: StatusCode::CREATED,
            body,
            cookie: None,
        }
    }

    fn cookie(mut self, sid: &str) -> Self {
        self.cookie = Some(session::session_cookie(sid));
        self
    }

    fn clear(mut self) -> Self {
        self.cookie = Some(session::clear_cookie());
        self
    }
}

impl IntoResponse for R {
    fn into_response(self) -> Response {
        let mut response = (self.status, Json(self.body)).into_response();
        if let Some(cookie) = self.cookie {
            if let Ok(value) = HeaderValue::from_str(&cookie) {
                response.headers_mut().insert(header::SET_COOKIE, value);
            }
        }
        response
    }
}

// MARK: - 会话

struct Actor {
    sid: String,
    session: session::Session,
}

fn actor(state: &AppState, headers: &HeaderMap) -> Result<Actor, ApiError> {
    let sid = session::sid_from_headers(headers).ok_or_else(ApiError::no_session)?;
    let session = state.sessions.get(&sid).ok_or_else(ApiError::no_session)?;
    if !session.is_authenticated() {
        return Err(ApiError::no_session());
    }
    Ok(Actor { sid, session })
}

fn upstream_failure(state: &AppState, sid: &str, error: UpstreamError) -> ApiError {
    if error.is_unauthorized() {
        state.sessions.remove(sid);
        ApiError::session_expired()
    } else {
        error.to_api_error()
    }
}

fn value_id(value: Option<&Value>) -> Option<String> {
    value.and_then(|entry| {
        entry
            .as_str()
            .map(str::to_string)
            .or_else(|| entry.as_i64().map(|number| number.to_string()))
    })
}

fn user_json(session: &session::Session) -> Value {
    json!({
        "id": session.user_id,
        "nickname": session.nickname,
        "avatar_url": session.avatar_url,
        "simple_id": session.simple_id,
        "phone": mask_phone(&session.phone),
    })
}

// MARK: - 官方私信连接

async fn im_session(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    if state.cfg.mock {
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "im_unavailable",
            "离线预览不连接官方私信。",
        ));
    }

    let session_user_id = actor
        .session
        .user_id
        .as_deref()
        .ok_or_else(|| ApiError::bad_request("会话缺少用户信息。"))?;

    let credentials = crate::im::load_credentials().map_err(|error| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "im_credentials_missing",
            error,
        )
    })?;

    if credentials.user_id != session_user_id {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "im_account_mismatch",
            "当前登录账号与本机官方客户端账号不一致，不能读取另一账号的私信。",
        ));
    }

    let token = crate::im::fetch_token(&credentials)
        .await
        .map_err(|error| ApiError::new(StatusCode::BAD_GATEWAY, "im_login_failed", error))?;

    Ok(R::ok(json!({
        "user": credentials.im_id,
        "token": token,
        "app_key": crate::im::app_key().map_err(|message| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "im_config_missing",
                message,
            )
        })?,
    })))
}

// MARK: - 基础

async fn health(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "mock": state.cfg.mock,
        "dev": state.cfg.dev,
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

#[derive(Deserialize)]
struct CodeRequest {
    phone: String,
}

async fn send_code(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CodeRequest>,
) -> Result<R, ApiError> {
    let phone = normalize_phone(&body.phone)?;

    let existing = session::sid_from_headers(&headers)
        .and_then(|sid| state.sessions.get(&sid).map(|session| (sid, session)));

    // 只在前端没拦住时兜一层：同一会话 60 秒一条。
    if let Some((_, current)) = &existing {
        if let Some(pending) = &current.pending {
            let elapsed = session::now().saturating_sub(pending.sent_at);
            if elapsed < 60 {
                return Err(ApiError::rate_limited(
                    "验证码发送过于频繁，请稍后再试。",
                    60 - elapsed,
                ));
            }
        }
    }

    if state.cfg.mock {
        let sid = match existing {
            Some((sid, _)) => sid,
            None => state.sessions.create(session::Session::pre_auth(&phone)),
        };
        let code = mock_code();
        let pending = session::PendingCode {
            phone: phone.clone(),
            auth_token: "mock".to_string(),
            message_id: "mock".to_string(),
            sent_at: session::now(),
            mock_code: Some(code.clone()),
        };
        state.sessions.update(&sid, |current| {
            current.phone = phone.clone();
            current.pending = Some(pending.clone());
        });
        // 和真短信一样：码只投递到「服务端日志」这个收件箱，不写进响应，也不自动填。
        eprintln!("[mock] 验证码 {code}（5 分钟内有效，仅离线预览）");
        return Ok(R::ok(json!({"ok": true, "cooldown": 60})).cookie(&sid));
    }

    let auth_token = state
        .upstream
        .auth_token()
        .await
        .map_err(|error| error.to_api_error())?;
    let message_id = state
        .upstream
        .request_code(&phone, &auth_token)
        .await
        .map_err(|error| error.to_api_error())?;

    let pending = session::PendingCode {
        phone: phone.clone(),
        auth_token,
        message_id,
        sent_at: session::now(),
        mock_code: None,
    };

    let sid = match existing {
        Some((sid, mut current)) => {
            current.phone = phone.clone();
            current.pending = Some(pending);
            state
                .sessions
                .update(&sid, |slot| *slot = current)
                .ok_or_else(ApiError::no_session)?;
            sid
        }
        None => {
            let mut fresh = session::Session::pre_auth(&phone);
            fresh.pending = Some(pending);
            state.sessions.create(fresh)
        }
    };

    Ok(R::ok(json!({"ok": true, "cooldown": 60})).cookie(&sid))
}

#[derive(Deserialize)]
struct LoginRequest {
    phone: String,
    code: String,
}

async fn login(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<R, ApiError> {
    let phone = normalize_phone(&body.phone)?;
    let code = body.code.trim().to_string();
    if code.len() != 4 || !code.chars().all(|value| value.is_ascii_digit()) {
        return Err(ApiError::bad_request("验证码应为 4 位数字。"));
    }

    let sid = session::sid_from_headers(&headers)
        .ok_or_else(|| ApiError::bad_request("请先获取验证码。"))?;
    let current = state
        .sessions
        .get(&sid)
        .ok_or_else(|| ApiError::bad_request("请先获取验证码。"))?;
    let pending = current
        .pending
        .clone()
        .ok_or_else(|| ApiError::bad_request("请先获取验证码。"))?;

    if pending.phone != phone {
        return Err(ApiError::bad_request("手机号与验证码不匹配，请重新获取。"));
    }
    if session::now().saturating_sub(pending.sent_at) > 600 {
        return Err(ApiError::bad_request("验证码已过期，请重新获取。"));
    }

    if state.cfg.mock {
        let expected = pending.mock_code.clone().unwrap_or_default();
        let expired = session::now().saturating_sub(pending.sent_at) > 300;
        if expected.is_empty() || expired || code != expected {
            return Err(ApiError::bad_request("验证码不正确或已过期。"));
        }
        let updated = state.sessions.update(&sid, |current| {
            current.token = "mock-token".to_string();
            current.user_id = Some("u_demo_me".to_string());
            current.nickname = Some("示例用户".to_string());
            current.simple_id = Some("110700065".to_string());
            current.pending = None;
            current.created_at = session::now();
        });
        let user = updated.map(|value| user_json(&value)).unwrap_or(Value::Null);
        return Ok(R::ok(json!({"user": user})).cookie(&sid));
    }

    let verified = state
        .upstream
        .verify_code(&pending.message_id, &code)
        .await
        .map_err(|error| {
            if error.is_unauthorized() {
                ApiError::bad_request("登录校验未通过，请重新获取验证码。")
            } else {
                error.to_api_error()
            }
        })?;

    let token = verified
        .get("token")
        .and_then(Value::as_str)
        .filter(|token| !token.is_empty())
        .map(str::to_string)
        .ok_or_else(|| ApiError::upstream("登录失败，请稍后再试。"))?;

    let profile = match state.upstream.current_user(&token).await {
        Ok(profile) => profile,
        Err(error) if error.is_unauthorized() => {
            return Err(ApiError::bad_request("登录校验未通过，请重新获取验证码。"))
        }
        Err(error) => return Err(error.to_api_error()),
    };

    let user_id = profile
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            verified
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let nickname = profile
        .get("nickname")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            verified
                .get("nickname")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let avatar_url = profile
        .get("avatar_url")
        .and_then(Value::as_str)
        .filter(|url| !url.is_empty())
        .map(str::to_string);
    let simple_id = value_id(profile.get("simple_id"))
        .or_else(|| value_id(verified.get("simple_id")));

    let updated = state.sessions.update(&sid, |current| {
        current.token = token;
        current.user_id = user_id;
        current.nickname = nickname;
        current.avatar_url = avatar_url;
        current.simple_id = simple_id;
        current.pending = None;
        current.created_at = session::now();
    });

    let user = updated
        .map(|value| user_json(&value))
        .ok_or_else(ApiError::no_session)?;
    Ok(R::ok(json!({"user": user})).cookie(&sid))
}

async fn get_session(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<R, ApiError> {
    let sid = session::sid_from_headers(&headers).ok_or_else(ApiError::no_session)?;
    let current = state.sessions.get(&sid).ok_or_else(ApiError::no_session)?;
    if !current.is_authenticated() {
        return Err(ApiError::no_session());
    }

    if state.cfg.mock {
        return Ok(R::ok(json!({"user": user_json(&current)})));
    }

    // 头像只有 `/current_user` 会给，顺手补一次；网络错误不动登录态。
    match state.upstream.current_user(&current.token).await {
        Ok(profile) => {
            let nickname = profile
                .get("nickname")
                .and_then(Value::as_str)
                .map(str::to_string);
            let avatar_url = profile
                .get("avatar_url")
                .and_then(Value::as_str)
                .filter(|url| !url.is_empty())
                .map(str::to_string);
            let simple_id = value_id(profile.get("simple_id"));
            if nickname.is_some() || avatar_url.is_some() || simple_id.is_some() {
                state.sessions.update(&sid, |session| {
                    if let Some(value) = &nickname {
                        session.nickname = Some(value.clone());
                    }
                    if let Some(value) = &avatar_url {
                        session.avatar_url = Some(value.clone());
                    }
                    if let Some(value) = &simple_id {
                        session.simple_id = Some(value.clone());
                    }
                });
            }
        }
        Err(error) if error.is_unauthorized() => {
            state.sessions.remove(&sid);
            return Err(ApiError::session_expired());
        }
        Err(_) => {}
    }

    let refreshed = state.sessions.get(&sid).unwrap_or(current);
    Ok(R::ok(json!({"user": user_json(&refreshed)})))
}

async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<R, ApiError> {
    let Some(sid) = session::sid_from_headers(&headers) else {
        return Ok(R::ok(json!({"ok": true})).clear());
    };
    let Some(current) = state.sessions.get(&sid) else {
        return Ok(R::ok(json!({"ok": true})).clear());
    };

    if !state.cfg.mock && current.is_authenticated() {
        if let Some(user_id) = current.user_id.as_deref() {
            for room in current.rooms.iter().take(5) {
                if let Err(error) = state
                    .upstream
                    .leave_room(room, &current.token, user_id)
                    .await
                {
                    eprintln!("[room] 退出登录时退房失败 {room}: {error:?}");
                }
            }
        }
    }

    state.sessions.remove(&sid);
    Ok(R::ok(json!({"ok": true})).clear())
}

async fn me(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    if state.cfg.mock {
        return Ok(R::ok(json!({"user": user_json(&actor.session)})));
    }

    let profile = state
        .upstream
        .current_user(&actor.session.token)
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;

    let nickname = profile
        .get("nickname")
        .and_then(Value::as_str)
        .map(str::to_string);
    let avatar_url = profile
        .get("avatar_url")
        .and_then(Value::as_str)
        .filter(|url| !url.is_empty())
        .map(str::to_string);
    let simple_id = value_id(profile.get("simple_id"));

    let refreshed = state.sessions.update(&actor.sid, |session| {
        if let Some(value) = &nickname {
            session.nickname = Some(value.clone());
        }
        if let Some(value) = &avatar_url {
            session.avatar_url = Some(value.clone());
        }
        if let Some(value) = &simple_id {
            session.simple_id = Some(value.clone());
        }
    });

    let user = refreshed
        .map(|value| user_json(&value))
        .unwrap_or_else(|| user_json(&actor.session));
    Ok(R::ok(json!({"user": user})))
}

// MARK: - 动态

#[derive(Deserialize)]
struct FeedQuery {
    tab: Option<String>,
    last_id: Option<String>,
}

async fn feed(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<FeedQuery>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let tab = query.tab.as_deref().unwrap_or("following");

    let base = match tab {
        "following" => "api/v3/posts/followings",
        "plaza" => "api/v3/posts",
        "discover" => return Ok(R::ok(json!({"posts": []}))),
        _ => return Err(ApiError::bad_request("未知的 tab。")),
    };

    if state.cfg.mock {
        return Ok(R::ok(json!({"posts": mock::feed(tab)})));
    }

    let path = with_cursor(base.to_string(), query.last_id.as_deref())?;
    let posts = state
        .upstream
        .get(&path, Some(&actor.session.token))
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(json!({"posts": posts})))
}

async fn profile_posts(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<CursorQuery>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;

    if state.cfg.mock {
        return Ok(R::ok(json!({"posts": mock::profile_posts()})));
    }

    let path = with_cursor("api/v3/posts/mine".to_string(), query.last_id.as_deref())?;
    let posts = state
        .upstream
        .get(&path, Some(&actor.session.token))
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(json!({"posts": posts})))
}

async fn joined_channels(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;

    if state.cfg.mock {
        return Ok(R::ok(json!({ "channels": mock::channels() })));
    }

    let roots = state
        .upstream
        .get("api/v3/root_channels", Some(&actor.session.token))
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    let catalog = state
        .upstream
        .get("api/v3/channels", Some(&actor.session.token))
        .await
        .ok();

    let mut sections_by_root = std::collections::HashMap::new();
    let mut rooms_by_root = std::collections::HashMap::new();
    let mut voice_rooms_by_root = std::collections::HashMap::new();
    if let Some(list) = catalog.as_ref().and_then(Value::as_array) {
        for channel in list {
            let Some(id) = channel.get("id").and_then(Value::as_str) else { continue };
            let sections = channel
                .get("sub_channels")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| {
                            Some(json!({
                                "id": item.get("id")?.as_str()?,
                                "name": item.get("name")?.as_str()?,
                            }))
                        })
                        .collect::<Vec<Value>>()
                })
                .unwrap_or_default();
            sections_by_root.insert(id.to_string(), sections);

            let mut rooms = Vec::new();
            let mut voice_rooms = Vec::new();
            if let Some(sections) = channel.get("sub_channels").and_then(Value::as_array) {
                for section in sections {
                    let section_name = section.get("name").and_then(Value::as_str).unwrap_or("");
                    if let Some(leaves) = section.get("sub_channels").and_then(Value::as_array) {
                        for leaf in leaves {
                            if leaf.get("channel_type").and_then(Value::as_str) != Some("chat_channel") {
                                continue;
                            }
                            let Some(group) = leaf.get("group") else { continue };
                            let Some(im_id) = group.get("im_id").map(Value::to_string).map(|v| v.trim_matches('"').to_string()) else { continue };
                            if im_id.is_empty() {
                                continue;
                            }
                            rooms.push(json!({
                                "id": leaf.get("id").and_then(Value::as_str).unwrap_or(""),
                                "name": leaf.get("name").and_then(Value::as_str).unwrap_or("文字聊天房"),
                                "im_id": im_id,
                                "group_id": group.get("id").and_then(Value::as_str).unwrap_or(""),
                                "role": group.get("current_member_role").and_then(Value::as_str).unwrap_or(""),
                                "section": section_name,
                                "channel_id": id,
                            }));
                        }
                    }
                    if let Some(leaves) = section.get("sub_channels").and_then(Value::as_array) {
                        for leaf in leaves {
                            if leaf.get("channel_type").and_then(Value::as_str) != Some("voice_channel") {
                                continue;
                            }
                            let Some(room) = leaf.get("chat_room") else { continue };
                            let Some(im_id) = room.get("im_id").map(Value::to_string).map(|v| v.trim_matches('"').to_string()) else { continue };
                            if im_id.is_empty() {
                                continue;
                            }
                            voice_rooms.push(json!({
                                "id": leaf.get("id").and_then(Value::as_str).unwrap_or(""),
                                "name": leaf.get("name").and_then(Value::as_str).unwrap_or("语音房"),
                                "im_id": im_id,
                                "chat_room_id": room.get("id").and_then(Value::as_str).unwrap_or(""),
                                "members": room.get("chat_room_members_count").and_then(Value::as_i64).unwrap_or(0),
                                "room_type": room.get("chat_room_type").and_then(Value::as_str).unwrap_or(""),
                                "mic_mode": room.get("mic_mode").and_then(Value::as_str).unwrap_or(""),
                                "mute_type": room.get("mute_type").and_then(Value::as_str).unwrap_or(""),
                                "section": section_name,
                                "channel_id": id,
                            }));
                        }
                    }
                }
            }
            rooms_by_root.insert(id.to_string(), rooms);
            voice_rooms_by_root.insert(id.to_string(), voice_rooms);
        }
    }

    let channels: Vec<Value> = roots
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| item.get("is_joined").and_then(Value::as_bool) == Some(true))
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?.to_string();
                    let sections = sections_by_root.get(&id).cloned().unwrap_or_default();
                    let chat_rooms = rooms_by_root.get(&id).cloned().unwrap_or_default();
                    let voice_rooms = voice_rooms_by_root.get(&id).cloned().unwrap_or_default();
                    Some(json!({
                        "id": id,
                        "name": item.get("name").and_then(Value::as_str).unwrap_or("频道"),
                        "icon": item.get("icon").and_then(Value::as_str).unwrap_or(""),
                        "description": item.get("description").and_then(Value::as_str).unwrap_or(""),
                        "members": item.get("channel_members_count").and_then(Value::as_i64).unwrap_or(0),
                        "role": item.get("current_member_role").and_then(Value::as_str).unwrap_or(""),
                        "sections": sections,
                        "chat_rooms": chat_rooms,
                        "voice_rooms": voice_rooms,
                    }))
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(R::ok(json!({ "channels": channels })))
}

async fn channel_posts(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(query): Query<CursorQuery>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let id = safe_id(&id)?;

    if state.cfg.mock {
        return Ok(R::ok(json!({ "posts": mock::channel_posts(&id) })));
    }

    let path = with_cursor(
        format!("api/v3/posts/channels/all?root_channel_id={id}&per_page=10"),
        query.last_id.as_deref(),
    )?;
    let posts = state
        .upstream
        .get(&path, Some(&actor.session.token))
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(json!({ "posts": posts })))
}

#[derive(Deserialize)]
struct CursorQuery {
    last_id: Option<String>,
}

async fn comments(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(post_id): Path<String>,
    Query(query): Query<CursorQuery>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let post_id = safe_id(&post_id)?;

    if state.cfg.mock {
        return Ok(R::ok(json!({"comments": mock::comments()})));
    }

    let path = with_cursor(
        format!("api/v3/comments?post_id={post_id}"),
        query.last_id.as_deref(),
    )?;
    let list = state
        .upstream
        .get(&path, Some(&actor.session.token))
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(json!({"comments": list})))
}

#[derive(Deserialize)]
struct ContentRequest {
    content: String,
}

async fn post_comment(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(post_id): Path<String>,
    Json(body): Json<ContentRequest>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let post_id = safe_id(&post_id)?;
    let content = trimmed_content(&body.content)?;

    if state.cfg.mock {
        return Ok(R::created(json!({"comment": mock::created_comment(&content)})));
    }

    let created = state
        .upstream
        .post(
            "api/v3/comments",
            Some(&actor.session.token),
            json!({"post_id": post_id, "content": content}),
        )
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::created(json!({"comment": created})))
}

async fn replies(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(comment_id): Path<String>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let comment_id = safe_id(&comment_id)?;

    if state.cfg.mock {
        return Ok(R::ok(json!({"replies": mock::replies()})));
    }

    let path = format!("api/v3/comments/replies?comment_id={comment_id}");
    let list = state
        .upstream
        .get(&path, Some(&actor.session.token))
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(json!({"replies": list})))
}

async fn post_reply(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(comment_id): Path<String>,
    Json(body): Json<ContentRequest>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let comment_id = safe_id(&comment_id)?;
    let content = trimmed_content(&body.content)?;

    if state.cfg.mock {
        return Ok(R::created(json!({"reply": mock::created_reply(&content)})));
    }

    let created = state
        .upstream
        .post(
            "api/v3/comments/replies",
            Some(&actor.session.token),
            json!({"comment_id": comment_id, "content": content}),
        )
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::created(json!({"reply": created})))
}

#[derive(Deserialize)]
struct VoteRequest {
    post_id: String,
    liked: bool,
}

async fn vote_post(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<VoteRequest>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let post_id = safe_id(&body.post_id)?;

    if state.cfg.mock {
        return Ok(R::ok(json!({"ok": true})));
    }

    let result = if body.liked {
        state
            .upstream
            .post(
                "api/v3/votes",
                Some(&actor.session.token),
                json!({"post_id": post_id}),
            )
            .await
    } else {
        state
            .upstream
            .delete(
                &format!("api/v3/votes?post_id={post_id}"),
                Some(&actor.session.token),
            )
            .await
    };

    result.map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(json!({"ok": true})))
}

#[derive(Deserialize)]
struct CommentVoteRequest {
    comment_id: String,
    liked: bool,
}

async fn vote_comment(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CommentVoteRequest>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let comment_id = safe_id(&body.comment_id)?;

    if state.cfg.mock {
        return Ok(R::ok(json!({"ok": true})));
    }

    let result = if body.liked {
        state
            .upstream
            .post(
                "api/v3/comment_votes",
                Some(&actor.session.token),
                json!({"comment_id": comment_id}),
            )
            .await
    } else {
        state
            .upstream
            .delete(
                &format!("api/v3/comment_votes?comment_id={comment_id}"),
                Some(&actor.session.token),
            )
            .await
    };

    result.map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(json!({"ok": true})))
}

// MARK: - 夜市

async fn night_markets(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    if state.cfg.mock {
        return Ok(R::ok(mock::night_markets()));
    }
    let data = state
        .upstream
        .night_markets(&actor.session.token)
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(data))
}

async fn night_counts(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    if state.cfg.mock {
        return Ok(R::ok(mock::night_counts()));
    }
    let data = state
        .upstream
        .night_counts(&actor.session.token)
        .await
        .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    Ok(R::ok(data))
}

// MARK: - 房间

async fn join_room(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(room_id): Path<String>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let room_id = safe_id(&room_id)?;

    if !state.cfg.mock {
        state
            .upstream
            .join_room(&room_id, &actor.session.token)
            .await
            .map_err(|error| upstream_failure(&state, &actor.sid, error))?;
    }

    state.sessions.update(&actor.sid, |current| {
        if !current.rooms.contains(&room_id) {
            current.rooms.push(room_id.clone());
        }
    });
    Ok(R::ok(json!({"ok": true})))
}

async fn room_state(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(room_id): Path<String>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let room_id = safe_id(&room_id)?;

    if state.cfg.mock {
        return Ok(R::ok(mock::room_state(&room_id)));
    }

    let snapshot = state
        .upstream
        .room_snapshot(&room_id, &actor.session.token)
        .await;

    if let Err(error) = &snapshot.info {
        if error.is_unauthorized() {
            state.sessions.remove(&actor.sid);
            return Err(ApiError::session_expired());
        }
    }
    if let Err(error) = &snapshot.seats {
        if error.is_unauthorized() {
            state.sessions.remove(&actor.sid);
            return Err(ApiError::session_expired());
        }
    }

    let (count, mic_mode) = match &snapshot.info {
        Ok(info) => (info.count, json!(info.mic_mode)),
        Err(_) => (0, Value::Null),
    };
    let (seats, seats_ok, seats_error) = match &snapshot.seats {
        Ok(list) => (json!(list), true, Value::Null),
        Err(error) => {
            // 没有权限（或还没进过房）时上游会给 500，界面只展示一句人话。
            eprintln!("[room] 麦位读取失败 {room_id}: {error:?}");
            (
                json!([]),
                false,
                json!("这个房间暂时看不到麦位（没有权限，或者还没加入）。"),
            )
        }
    };
    let joined = actor.session.rooms.iter().any(|room| room == &room_id);

    Ok(R::ok(json!({
        "count": count,
        "mic_mode": mic_mode,
        "seats": seats,
        "seats_ok": seats_ok,
        "seats_error": seats_error,
        "joined": joined,
    })))
}

async fn leave_room(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(room_id): Path<String>,
) -> Result<R, ApiError> {
    let actor = actor(&state, &headers)?;
    let room_id = safe_id(&room_id)?;

    if !state.cfg.mock {
        let user_id = match actor.session.user_id.clone() {
            Some(value) if !value.is_empty() => Some(value),
            _ => state
                .upstream
                .current_user(&actor.session.token)
                .await
                .ok()
                .and_then(|value| value.get("id").and_then(Value::as_str).map(str::to_string)),
        };

        match user_id {
            Some(user_id) => {
                if let Err(error) = state
                    .upstream
                    .leave_room(&room_id, &actor.session.token, &user_id)
                    .await
                {
                    // 退房失败也照常收尾，别把用户困在房间里。
                    eprintln!("[room] 退房失败 {room_id}: {error:?}");
                }
            }
            None => eprintln!("[room] 会话里没有 user_id，跳过退房"),
        }
    }

    state.sessions.update(&actor.sid, |current| {
        current.rooms.retain(|room| room != &room_id);
    });
    Ok(R::ok(json!({"ok": true})))
}

// MARK: - 开发入口

#[derive(Deserialize)]
struct DevSessionRequest {
    token: String,
    phone: Option<String>,
    nickname: Option<String>,
    user_id: Option<String>,
}

async fn dev_session(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DevSessionRequest>,
) -> Result<R, ApiError> {
    if !state.cfg.dev && !state.cfg.mock {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "dev_disabled",
            "开发入口未开启。",
        ));
    }

    let token = body.token.trim().to_string();
    if token.is_empty() {
        return Err(ApiError::bad_request("缺少 token。"));
    }

    let (user_id, nickname, avatar_url, simple_id) = if state.cfg.mock || token == "mock" {
        (
            "u_demo_me".to_string(),
            Some("示例用户".to_string()),
            None,
            Some("110700065".to_string()),
        )
    } else {
        let profile = state
            .upstream
            .current_user(&token)
            .await
            .map_err(|error| error.to_api_error())?;
        (
            body.user_id
                .clone()
                .or_else(|| {
                    profile
                        .get("id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .unwrap_or_else(|| "dev".to_string()),
            body.nickname.clone().or_else(|| {
                profile
                    .get("nickname")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            }),
            profile
                .get("avatar_url")
                .and_then(Value::as_str)
                .filter(|url| !url.is_empty())
                .map(str::to_string),
            value_id(profile.get("simple_id")),
        )
    };

    let now = session::now();
    let fresh = session::Session {
        token,
        phone: body.phone.unwrap_or_else(|| "13800138000".to_string()),
        user_id: Some(user_id),
        nickname,
        avatar_url,
        simple_id,
        created_at: now,
        last_seen: now,
        pending: None,
        rooms: Vec::new(),
    };
    let sid = state.sessions.create(fresh.clone());
    eprintln!("[dev] 用现有 token 建立了本地会话（仅开发/预览模式）");
    Ok(R::ok(json!({"user": user_json(&fresh)})).cookie(&sid))
}

// MARK: - 小工具

fn normalize_phone(raw: &str) -> Result<String, ApiError> {
    let digits: String = raw.chars().filter(char::is_ascii_digit).collect();
    let phone = if digits.len() == 13 && digits.starts_with("86") {
        digits[2..].to_string()
    } else {
        digits
    };
    if phone.len() != 11 || !phone.starts_with('1') {
        return Err(ApiError::bad_request("手机号格式不正确。"));
    }
    Ok(phone)
}

fn safe_id(raw: &str) -> Result<String, ApiError> {
    let value = raw.trim();
    if value.is_empty()
        || value.len() > 80
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
    {
        return Err(ApiError::bad_request("无效的 id。"));
    }
    Ok(value.to_string())
}

fn with_cursor(mut path: String, last_id: Option<&str>) -> Result<String, ApiError> {
    if let Some(value) = last_id.filter(|value| !value.trim().is_empty()) {
        let value = safe_id(value)?;
        path.push(if path.contains('?') { '&' } else { '?' });
        path.push_str("last_id=");
        path.push_str(&value);
    }
    Ok(path)
}

fn trimmed_content(raw: &str) -> Result<String, ApiError> {
    let content = raw.trim();
    if content.is_empty() {
        return Err(ApiError::bad_request("内容不能为空。"));
    }
    if content.chars().count() > 2000 {
        return Err(ApiError::bad_request("内容太长了，精简一下再发。"));
    }
    Ok(content.to_string())
}

/// 离线预览用的一次性验证码：4 位数字，存进会话，5 分钟内有效。
fn mock_code() -> String {
    let bytes = uuid::Uuid::new_v4();
    let raw = u32::from_be_bytes([
        bytes.as_bytes()[0],
        bytes.as_bytes()[1],
        bytes.as_bytes()[2],
        bytes.as_bytes()[3],
    ]);
    format!("{:04}", raw % 10_000)
}

fn mask_phone(phone: &str) -> String {
    let characters: Vec<char> = phone.chars().collect();
    if characters.len() == 11 {
        let head: String = characters[..3].iter().collect();
        let tail: String = characters[7..].iter().collect();
        format!("{head} **** {tail}")
    } else {
        phone.to_string()
    }
}

/// 静态文件 + SPA 兜底：找不到的 GET 一律回 index.html（200），
/// 但 `/api/...` 不会走到这里，未知接口仍然 404。
async fn spa_fallback(State(state): State<Arc<AppState>>, method: Method, uri: Uri) -> Response {
    if method != Method::GET {
        return (StatusCode::NOT_FOUND, "Not Found").into_response();
    }

    let mut relative = uri.path().trim_start_matches('/').to_string();
    if relative.starts_with("api/") || relative.split('/').any(|segment| segment == "..") {
        return (StatusCode::NOT_FOUND, "Not Found").into_response();
    }
    if relative.is_empty() {
        relative = "index.html".to_string();
    }

    let web = &state.cfg.web_dir;
    let mut path = web.join(&relative);
    if path.is_dir() {
        path = path.join("index.html");
    }
    if !path.is_file() {
        path = web.join("index.html");
    }

    match tokio::fs::read(&path).await {
        Ok(body) => {
            let content_type = content_type(&path);
            // 本地开发会频繁改 JS/CSS，一律 no-cache，避免浏览器拿旧界面。
            (
                [
                    (header::CONTENT_TYPE, content_type),
                    (header::CACHE_CONTROL, "no-cache"),
                ],
                body,
            )
                .into_response()
        }
        Err(error) => {
            eprintln!("[web] 读取 {} 失败: {error}", path.display());
            (StatusCode::INTERNAL_SERVER_ERROR, "静态文件读取失败").into_response()
        }
    }
}

fn content_type(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "woff2" => "font/woff2",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phone_accepts_country_code() {
        assert_eq!(normalize_phone("+86 138-0013-8000").unwrap(), "13800138000");
        assert_eq!(normalize_phone("13800138000").unwrap(), "13800138000");
        assert!(normalize_phone("23800138000").is_err());
        assert!(normalize_phone("138001380").is_err());
    }

    #[test]
    fn ids_are_restricted_to_uuid_alphabet() {
        assert!(safe_id("0b6f-4c1e_a9").is_ok());
        assert!(safe_id("../../etc/passwd").is_err());
        assert!(safe_id("id?last_id=1").is_err());
    }

    #[test]
    fn cursor_appends_with_the_right_separator() {
        assert_eq!(
            with_cursor("api/v3/comments?post_id=p1".into(), Some("c9")).unwrap(),
            "api/v3/comments?post_id=p1&last_id=c9"
        );
        assert_eq!(
            with_cursor("api/v3/posts".into(), None).unwrap(),
            "api/v3/posts"
        );
    }

    #[test]
    fn mock_codes_are_four_digits() {
        for _ in 0..20 {
            let code = mock_code();
            assert_eq!(code.len(), 4, "{code}");
            assert!(code.chars().all(|value| value.is_ascii_digit()), "{code}");
        }
    }

    #[test]
    fn phone_masking_keeps_three_and_four() {
        assert_eq!(mask_phone("13800138000"), "138 **** 8000");
    }
}
