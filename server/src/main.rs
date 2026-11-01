//! Simple 网页版后端：把官方接口包一层，浏览器只拿 HttpOnly 会话。

mod error;
mod im;
mod mock;
mod routes;
mod session;
mod upstream;

use axum::{
    extract::Request,
    http::{header, Method, StatusCode, Uri},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

pub struct AppState {
    pub cfg: Config,
    pub sessions: session::SessionStore,
    pub upstream: upstream::Upstream,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub web_dir: PathBuf,
    pub data_dir: PathBuf,
    pub upstream_base: String,
    /// 开发模式：开 `/api/dev/session`，用已有 token 建会话。
    pub dev: bool,
    /// 离线预览：所有接口返回固定假数据，不碰官方后端。
    pub mock: bool,
}

impl Config {
    fn from_args() -> Self {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let root = manifest.parent().unwrap_or(manifest);

        let mut cfg = Self {
            host: "127.0.0.1".to_string(),
            port: 8787,
            web_dir: root.join("web"),
            data_dir: root.join("data"),
            upstream_base: upstream::Upstream::default_base().to_string(),
            dev: false,
            mock: false,
        };

        let args: Vec<String> = std::env::args().skip(1).collect();
        let mut index = 0;
        while index < args.len() {
            match args[index].as_str() {
                "--port" => {
                    if let Some(value) = args.get(index + 1) {
                        cfg.port = value.parse().unwrap_or(cfg.port);
                        index += 1;
                    }
                }
                "--host" => {
                    if let Some(value) = args.get(index + 1) {
                        cfg.host = value.clone();
                        index += 1;
                    }
                }
                "--web" => {
                    if let Some(value) = args.get(index + 1) {
                        cfg.web_dir = PathBuf::from(value);
                        index += 1;
                    }
                }
                "--data" => {
                    if let Some(value) = args.get(index + 1) {
                        cfg.data_dir = PathBuf::from(value);
                        index += 1;
                    }
                }
                "--upstream" => {
                    if let Some(value) = args.get(index + 1) {
                        cfg.upstream_base = value.clone();
                        index += 1;
                    }
                }
                "--dev" => cfg.dev = true,
                "--mock" => cfg.mock = true,
                "--help" | "-h" => {
                    print_help();
                    std::process::exit(0);
                }
                other => eprintln!("[simple] 忽略未知参数 {other}"),
            }
            index += 1;
        }

        if let Ok(port) = std::env::var("SIMPLE_PORT") {
            if let Ok(port) = port.parse() {
                cfg.port = port;
            }
        }
        if let Ok(host) = std::env::var("SIMPLE_HOST") {
            cfg.host = host;
        }

        cfg
    }
}

fn print_help() {
    println!(
        "Simple 网页版服务\n\n\
         用法: simple-web-server [选项]\n\n\
         --host <HOST>     监听地址，默认 127.0.0.1\n\
         --port <PORT>     监听端口，默认 8787\n\
         --web <DIR>       静态目录，默认 <项目>/web\n\
         --data <DIR>      会话落盘目录，默认 <项目>/data\n\
         --dev             开启开发入口 /api/dev/session（用已有 token 建会话）\n\
         --mock            离线预览：接口返回固定假数据，不访问官方后端\n\
         --help            显示这段帮助"
    );
}

#[tokio::main]
async fn main() {
    let cfg = Config::from_args();
    let sessions = session::SessionStore::open(cfg.data_dir.join("sessions.json"));
    let upstream = upstream::Upstream::new(&cfg.upstream_base);

    if cfg.mock {
        eprintln!("[simple] mock 模式：接口返回固定假数据，不会访问官方后端");
    }
    if cfg.dev {
        eprintln!("[simple] dev 模式：/api/dev/session 已开启，请只在本机使用");
    }

    let state = Arc::new(AppState {
        cfg,
        sessions,
        upstream,
    });

    let address = format!("{}:{}", state.cfg.host, state.cfg.port);
    let listener = match tokio::net::TcpListener::bind(&address).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("[simple] 监听 {address} 失败: {error}");
            std::process::exit(1);
        }
    };

    eprintln!(
        "[simple] 已启动 http://{address}  静态目录 {}",
        state.cfg.web_dir.display()
    );

    let app = routes::router(state.clone())
        .layer(axum::middleware::from_fn(guard_origin))
        .layer(axum::middleware::from_fn(log_request));

    if let Err(error) = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        eprintln!("[simple] 服务异常退出: {error}");
    }

    state.sessions.persist();
    eprintln!("[simple] 已退出");
}

async fn log_request(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let path = request
        .uri()
        .path_and_query()
        .map(|value| value.as_str().to_string())
        .unwrap_or_default();
    let started = Instant::now();
    let response = next.run(request).await;
    eprintln!(
        "[http] {method} {path} -> {} ({} ms)",
        response.status().as_u16(),
        started.elapsed().as_millis()
    );
    response
}

/// 变更类请求只接受同源：Cookie 是 SameSite=Lax，再加一道 Origin 校验。
async fn guard_origin(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    if matches!(
        method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    ) {
        let origin = request
            .headers()
            .get(header::ORIGIN)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let host = request
            .headers()
            .get(header::HOST)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);

        if let (Some(origin), Some(host)) = (origin, host) {
            let origin_host = Uri::try_from(origin.as_str())
                .ok()
                .and_then(|uri| uri.authority().map(|authority| authority.as_str().to_string()));
            if let Some(origin_host) = origin_host {
                if origin_host != host {
                    return (StatusCode::FORBIDDEN, "跨站请求被拒绝").into_response();
                }
            }
        }
    }
    next.run(request).await
}

async fn shutdown_signal() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        eprintln!("[simple] 监听退出信号失败: {error}");
    }
    eprintln!("\n[simple] 收到退出信号，正在收尾…");
}
