//! 统一的 JSON 错误：前端只认 `error` 这句人话，`code` 用来做分支。

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
    pub rate_limited: bool,
    pub retry_after: Option<u64>,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            rate_limited: false,
            retry_after: None,
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_request", message)
    }

    pub fn no_session() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "no_session", "还没有登录。")
    }

    pub fn session_expired() -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "session_expired",
            "登录已过期，请重新登录。",
        )
    }

    pub fn rate_limited(message: impl Into<String>, retry_after: u64) -> Self {
        let mut error = Self::new(StatusCode::TOO_MANY_REQUESTS, "rate_limited", message);
        error.rate_limited = true;
        error.retry_after = Some(retry_after);
        error
    }

    pub fn upstream(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, "upstream_error", message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal_error",
            message,
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = json!({
            "error": self.message,
            "code": self.code,
            "rate_limited": self.rate_limited,
            "retry_after": self.retry_after,
        });
        (self.status, Json(body)).into_response()
    }
}
