//! Совместная игра P2P: друг подключается к вашему миру напрямую, без Hamachi/Radmin.
//!
//! Это НЕ виртуальная сеть (никаких драйверов и прав администратора), а туннель только для Minecraft:
//! лаунчер хозяина даёт код комнаты, лаунчер друга открывает у него локальный порт, из которого
//! трафик идёт к хозяину. В игре заходят по адресу localhost:<порт>.
//!
//! СПОСОБЫ СОЕДИНЕНИЯ (лаунчер автоматически пробует доступные маршруты):
//!   1. «tcp»     — прямой TCP через UPnP; работает без relay, если у хозяина есть публичный IPv4;
//!   2. «ticket»  — Iroh 1.x: адрес комнаты с relay URL и обнаруженными IP-адресами;
//!   3. «node_id» — Iroh 1.x: поиск адреса по Endpoint ID через N0 address lookup.
//! Маршруты 2 и 3 используют один сетевой стек Iroh, а не независимые резервные серверы.
//! Ключ доступа (в каждом коде) обязателен. Хозяин пересылает трафик только на свой порт игры.
//!
//! Код под cargo-feature `p2p`; она включена по умолчанию (отключить: --no-default-features).
//! Используется поддерживаемая ветка Iroh 1.x и публичная инфраструктура N0; доступность
//! публичных relay зависит от сети пользователя и не может быть гарантирована во всех странах.

use serde::Serialize;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

#[allow(dead_code)]
const NOT_BUILT: &str =
    "В этой сборке P2P отключён (она собрана с --no-default-features).";

#[allow(dead_code)]
type Handle = tauri::async_runtime::JoinHandle<()>;

/// (режим "host" | "guest", подпись для интерфейса, фоновая задача)
static STATE: Mutex<Option<(String, String, Handle)>> = Mutex::new(None);

/// Сколько туннелей (игроков / соединений) сейчас активно — для подписи в интерфейсе.
#[allow(dead_code)]
static PEERS: AtomicU32 = AtomicU32::new(0);

#[allow(dead_code)]
struct PeerGuard;

#[allow(dead_code)]
impl PeerGuard {
    fn new() -> Self {
        PEERS.fetch_add(1, Ordering::Relaxed);
        PeerGuard
    }
}

impl Drop for PeerGuard {
    fn drop(&mut self) {
        PEERS.fetch_sub(1, Ordering::Relaxed);
    }
}

/// Фоновые задачи отдельных туннелей: при остановке комнаты завершаем и их тоже.
#[allow(dead_code)]
static CHILDREN: Mutex<Vec<Handle>> = Mutex::new(Vec::new());

#[allow(dead_code)]
fn stop_current() {
    let old = STATE.lock().unwrap().take();
    if let Some((_, _, h)) = old {
        h.abort();
    }
    let kids: Vec<Handle> = std::mem::take(&mut *CHILDREN.lock().unwrap());
    for k in kids {
        k.abort();
    }
    #[cfg(feature = "p2p")]
    imp::clear_host();
}

/// Вызывается при выходе из приложения: останавливает всё и убирает проброс порта на роутере.
pub fn shutdown() {
    let old = STATE.lock().unwrap().take();
    if let Some((_, _, h)) = old {
        h.abort();
    }
    let kids: Vec<Handle> = std::mem::take(&mut *CHILDREN.lock().unwrap());
    for k in kids {
        k.abort();
    }
    #[cfg(feature = "p2p")]
    imp::clear_host_blocking();
}

#[allow(dead_code)]
fn set_state(mode: &str, info: String, handle: Handle) {
    *STATE.lock().unwrap() = Some((mode.to_string(), info, handle));
}

#[derive(Serialize)]
pub struct P2pStatus {
    pub mode: String,
    pub info: String,
    /// сколько игроков / соединений сейчас идёт через туннель
    pub peers: u32,
}

/// Все варианты адреса комнаты (в каждом — секретный ключ доступа).
#[derive(Serialize, Clone)]
#[allow(dead_code)]
pub struct AddressCodes {
    /// пробует все способы по очереди (рекомендуется)
    pub universal: String,
    /// «<endpoint id>:<ключ>» — короткая форма через N0 address lookup
    pub short: String,
    /// «<тикет>:<ключ>» — с прямыми адресами, DNS iroh не нужен
    pub ticket: String,
    /// только прямое TCP-подключение (если удалось открыть порт через UPnP)
    pub tcp: Option<String>,
    /// пояснение про TCP/UPnP (успех или причина, почему не вышло)
    pub tcp_note: String,
    /// подтвердил ли endpoint подключение хотя бы к одному публичному relay
    pub has_relay: bool,
    /// сколько прямых адресов попало в тикет
    pub direct: usize,
    /// слушает ли что-нибудь порт игры у хозяина (мир открыт для сети / сервер запущен)
    pub game_ok: bool,
}

#[derive(Serialize)]
#[allow(dead_code)]
pub struct ConnectInfo {
    pub port: u16,
    /// "tcp" | "ticket" | "node_id" — каким способом удалось подключиться
    pub method: String,
}

#[derive(Serialize)]
pub struct P2pDiagnosticReport {
    pub relay_online: bool,
    pub relay_detail: String,
    pub invite_ok: bool,
    pub invite_detail: String,
    pub roundtrip_ok: bool,
    pub roundtrip_detail: String,
    pub elapsed_ms: u64,
}

#[tauri::command]
pub async fn p2p_diagnostics() -> P2pDiagnosticReport {
    #[cfg(feature = "p2p")]
    { return imp::diagnostics().await; }
    #[cfg(not(feature = "p2p"))]
    {
        P2pDiagnosticReport {
            relay_online: false,
            relay_detail: "Эта сборка создана без поддержки P2P.".into(),
            invite_ok: false,
            invite_detail: "Диагностика недоступна без функции P2P.".into(),
            roundtrip_ok: false,
            roundtrip_detail: "Диагностика недоступна без функции P2P.".into(),
            elapsed_ms: 0,
        }
    }
}

#[tauri::command]
pub fn p2p_status() -> P2pStatus {
    match STATE.lock().unwrap().as_ref() {
        Some((m, i, _)) => P2pStatus { mode: m.clone(), info: i.clone(), peers: PEERS.load(Ordering::Relaxed) },
        None => P2pStatus { mode: "off".to_string(), info: String::new(), peers: 0 },
    }
}

/// Есть ли P2P в этой сборке (по умолчанию есть).
#[tauri::command]
pub fn p2p_available() -> bool {
    cfg!(feature = "p2p")
}

/// Ищет в логе игры порт открытого «для сети» мира («Local game hosted on port N»), чтобы не вводить вручную.
#[tauri::command]
pub fn p2p_detect_port() -> Option<u16> {
    let path = crate::instances::active_dir().join("logs").join("latest.log");
    let bytes = std::fs::read(&path).ok()?;
    let tail = &bytes[bytes.len().saturating_sub(300_000)..];
    let text = String::from_utf8_lossy(tail);
    let mut found = None;
    for line in text.lines() {
        for marker in ["Local game hosted on port ", "Started serving on "] {
            if let Some(pos) = line.find(marker) {
                let digits: String = line[pos + marker.len()..]
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                if let Ok(port) = digits.parse::<u16>() {
                    if port >= 1024 {
                        found = Some(port); // берём последнее упоминание
                    }
                }
            }
        }
    }
    found
}

#[tauri::command]
pub fn p2p_stop() {
    stop_current();
}

/// Открыть комнату: туннель к порту вашей игры. Возвращает все варианты кода для друга.
#[tauri::command]
pub async fn p2p_host(port: u16) -> Result<AddressCodes, String> {
    if port < 1024 {
        return Err("порт игры должен быть от 1024 (для мира по локальной сети он виден в чате игры)".into());
    }
    #[cfg(feature = "p2p")]
    return imp::host(port).await;
    #[cfg(not(feature = "p2p"))]
    return Err(NOT_BUILT.to_string());
}

/// Свежие коды для уже открытой комнаты (адреса могли измениться, а у только что запущенной сети
/// iroh поначалу нет внешних адресов — через несколько секунд тикет полнее).
#[tauri::command]
pub async fn generate_address_ticket() -> Result<AddressCodes, String> {
    #[cfg(feature = "p2p")]
    return imp::fresh_codes().await;
    #[cfg(not(feature = "p2p"))]
    return Err(NOT_BUILT.to_string());
}

/// Универсальное подключение. input — универсальный код, тикет, короткий код или TCP-адрес.
/// method: "auto" (по умолчанию: пробует способы по очереди) | "tcp" | "ticket" | "node_id".
/// Возвращает локальный порт: в игре заходите на localhost:<порт>.
#[tauri::command]
pub async fn connect_to_peer(input: String, method: Option<String>) -> Result<ConnectInfo, String> {
    #[cfg(feature = "p2p")]
    return imp::connect(input, method).await;
    #[cfg(not(feature = "p2p"))]
    {
        let _ = (input, method);
        return Err(NOT_BUILT.to_string());
    }
}

#[cfg(feature = "p2p")]
mod imp {
    use super::{set_state, stop_current, AddressCodes, ConnectInfo, Handle, PeerGuard, CHILDREN};
    use iroh::{endpoint::presets, Endpoint, EndpointAddr, EndpointId};
    use iroh_tickets::endpoint::EndpointTicket;
    use std::net::{IpAddr, Ipv4Addr};
    use std::str::FromStr;
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
    use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
    use tokio::net::{TcpListener, TcpStream};
    use tokio::time::timeout;

    const ALPN: &[u8] = b"end-launcher/p2p/1";

    /// Работающая комната: нужна, чтобы выдавать свежие коды.
    #[derive(Clone)]
    struct HostInfo {
        endpoint: Endpoint,
        token: [u8; 16],
        tcp: Option<String>,
        tcp_note: String,
        game_port: u16,
    }

    static HOST: Mutex<Option<HostInfo>> = Mutex::new(None);
    /// Внешний порт, открытый через UPnP (чтобы закрыть при остановке комнаты)
    static UPNP_PORT: Mutex<Option<u16>> = Mutex::new(None);

    pub fn clear_host() {
        *HOST.lock().unwrap() = None;
        // закрываем проброс порта на роутере (лучшее из возможного: аренда и так истечёт)
        let port = UPNP_PORT.lock().unwrap().take();
        if let Some(p) = port {
            let _ = tauri::async_runtime::spawn_blocking(move || {
                if let Ok(gw) = igd_next::search_gateway(Default::default()) {
                    let _ = gw.remove_port(igd_next::PortMappingProtocol::TCP, p);
                }
            });
        }
    }

    /// Закрыть комнату при выходе из лаунчера и дождаться (до 2,5 с), пока роутер уберёт проброс порта.
    pub fn clear_host_blocking() {
        *HOST.lock().unwrap() = None;
        let port = UPNP_PORT.lock().unwrap().take();
        if let Some(p) = port {
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                if let Ok(gw) = igd_next::search_gateway(Default::default()) {
                    let _ = gw.remove_port(igd_next::PortMappingProtocol::TCP, p);
                }
                let _ = tx.send(());
            });
            let _ = rx.recv_timeout(Duration::from_millis(2500));
        }
    }

    fn err<E: std::fmt::Display>(e: E) -> String {
        e.to_string()
    }

    fn to_hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    fn from_hex16(s: &str) -> Option<[u8; 16]> {
        if s.len() != 32 {
            return None;
        }
        let mut out = [0u8; 16];
        for (i, byte) in out.iter_mut().enumerate() {
            *byte = u8::from_str_radix(s.get(i * 2..i * 2 + 2)?, 16).ok()?;
        }
        Some(out)
    }

    /// Задача, которая сама отменяется при уничтожении (чтобы не оставлять «висящих» копировщиков).
    struct AbortOnDrop(Handle);

    impl Drop for AbortOnDrop {
        fn drop(&mut self) {
            self.0.abort();
        }
    }

    /// Запускает задачу туннеля и запоминает её, чтобы «Остановить» завершило и её.
    fn spawn_child<F>(fut: F)
    where
        F: std::future::Future<Output = ()> + Send + 'static,
    {
        let h = tauri::async_runtime::spawn(fut);
        CHILDREN.lock().unwrap().push(h);
    }

    /// Гоняет байты между локальным TCP и удалённым потоком в обе стороны, пока один из них не закроется.
    async fn pipe<S, R>(tcp: TcpStream, mut send: S, mut recv: R)
    where
        S: AsyncWrite + Unpin + Send + 'static,
        R: AsyncRead + Unpin + Send + 'static,
    {
        let _guard = PeerGuard::new();
        let (mut tr, mut tw) = tcp.into_split();
        let up = AbortOnDrop(tauri::async_runtime::spawn(async move {
            let _ = tokio::io::copy(&mut tr, &mut send).await;
            let _ = send.shutdown().await;
        }));
        let _ = tokio::io::copy(&mut recv, &mut tw).await;
        drop(up);
    }

    // ───────────────────── способ 1: прямой TCP + UPnP ─────────────────────

    fn is_public_v4(ip: Ipv4Addr) -> bool {
        let o = ip.octets();
        let cgnat = o[0] == 100 && (o[1] & 0xC0) == 64; // 100.64.0.0/10 — «серый» адрес провайдера
        !(ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() || cgnat)
    }

    /// Открывает порт на роутере через UPnP; возвращает внешний IPv4. Блокирующая функция.
    fn upnp_map(port: u16) -> Result<Ipv4Addr, String> {
        let gw = igd_next::search_gateway(Default::default())
            .map_err(|e| format!("роутер с UPnP не найден ({e})"))?;
        // свой адрес в локальной сети: тот, с которого компьютер выходит наружу (пакеты тут не отправляются)
        let sock = std::net::UdpSocket::bind("0.0.0.0:0").map_err(err)?;
        sock.connect("8.8.8.8:80").map_err(err)?;
        let local_ip = sock.local_addr().map_err(err)?.ip();
        let ext = gw
            .get_external_ip()
            .map_err(|e| format!("не удалось узнать внешний адрес ({e})"))?;
        gw.add_port(
            igd_next::PortMappingProtocol::TCP,
            port,
            std::net::SocketAddr::new(local_ip, port),
            14_400, // аренда 4 часа
            "End Launcher P2P",
        )
        .map_err(|e| format!("роутер не принял проброс порта ({e})"))?;
        match ext {
            IpAddr::V4(v4) => Ok(v4),
            IpAddr::V6(_) => Err("внешний адрес роутера — IPv6, такой вариант не поддерживается".to_string()),
        }
    }

    /// Хозяин: слушаем TCP-порт, принимаем гостей (ключ + проверка), пытаемся открыть порт на роутере.
    /// Возвращает (внешний адрес «ip:порт», пояснение).
    async fn start_tcp_gateway(game_port: u16, token: [u8; 16]) -> (Option<String>, String) {
        let listener = match TcpListener::bind(("0.0.0.0", 0)).await {
            Ok(l) => l,
            Err(e) => return (None, format!("TCP недоступен: {e}")),
        };
        let lport = match listener.local_addr() {
            Ok(a) => a.port(),
            Err(e) => return (None, format!("TCP недоступен: {e}")),
        };

        spawn_child(async move {
            while let Ok((sock, _)) = listener.accept().await {
                spawn_child(async move {
                    let (mut r, mut w) = sock.into_split();
                    // гость должен прислать ключ за 5 секунд, иначе отключаем (защита от «сканеров»)
                    let mut got = [0u8; 16];
                    let ok = matches!(timeout(Duration::from_secs(5), r.read_exact(&mut got)).await, Ok(Ok(_)));
                    if !ok || got != token {
                        return;
                    }
                    let Ok(game) = TcpStream::connect(("127.0.0.1", game_port)).await else { return };
                    if w.write_all(&[1]).await.is_err() {
                        return; // подтверждение гостю: ключ верный, игра на месте
                    }
                    pipe(game, w, r).await;
                });
            }
        });

        // UPnP: ищем роутер и открываем порт (до 8 секунд)
        let mapped = timeout(
            Duration::from_secs(8),
            tauri::async_runtime::spawn_blocking(move || upnp_map(lport)),
        )
        .await;
        match mapped {
            Ok(Ok(Ok(ip))) => {
                *UPNP_PORT.lock().unwrap() = Some(lport);
                if is_public_v4(ip) {
                    (Some(format!("{ip}:{lport}")), format!("TCP: порт {lport} открыт на роутере через UPnP (внешний адрес {ip})."))
                } else {
                    (None, format!("TCP: у роутера «серый» адрес {ip} (провайдер использует CGNAT) — прямое подключение снаружи не получится."))
                }
            }
            Ok(Ok(Err(e))) => (None, format!("TCP: {e}. Можно вручную пробросить на роутере TCP-порт {lport}.")),
            _ => (None, format!("TCP: роутер не ответил за 8 секунд (UPnP выключен?). Можно вручную пробросить TCP-порт {lport}.")),
        }
    }

    /// Гость: рукопожатие по TCP (ключ -> подтверждение). Возвращает готовые половины сокета.
    async fn tcp_handshake(
        addr: &str,
        token: &[u8; 16],
        secs: u64,
    ) -> Result<(OwnedReadHalf, OwnedWriteHalf), String> {
        let sock = timeout(Duration::from_secs(secs), TcpStream::connect(addr))
            .await
            .map_err(|_| "нет ответа по адресу хозяина".to_string())?
            .map_err(err)?;
        let (mut r, mut w) = sock.into_split();
        w.write_all(token).await.map_err(err)?;
        let mut ack = [0u8; 1];
        timeout(Duration::from_secs(secs), r.read_exact(&mut ack))
            .await
            .map_err(|_| "хозяин не подтвердил подключение".to_string())?
            .map_err(err)?;
        if ack[0] != 1 {
            return Err("хозяин отклонил подключение".to_string());
        }
        Ok((r, w))
    }

    async fn start_tunnel_tcp(addr: String, token: [u8; 16], secs: u64) -> Result<u16, String> {
        // проверка заранее: достижим ли хозяин (рукопожатие и сразу закрываем)
        let probe = tcp_handshake(&addr, &token, secs).await;
        let (r, w) = probe.map_err(|e| {
            format!("{e}: у хозяина не сработал UPnP или порт закрыт")
        })?;
        drop((r, w));

        let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(err)?;
        let port = listener.local_addr().map_err(err)?.port();
        let handle = tauri::async_runtime::spawn(async move {
            while let Ok((local, _)) = listener.accept().await {
                let addr = addr.clone();
                spawn_child(async move {
                    let Ok((r, w)) = tcp_handshake(&addr, &token, 8).await else { return };
                    pipe(local, w, r).await;
                });
            }
        });
        set_state("guest", format!("localhost:{port}"), handle);
        Ok(port)
    }

    // ───────────────────── способы 2 и 3: iroh ─────────────────────

    /// Ждём подтверждённого выхода хотя бы на один публичный Iroh relay.
    /// Если relay недоступен, всё равно возвращаем обнаруженные прямые адреса:
    /// приглашение сможет использовать их, но CGNAT без relay не обойти.
    async fn iroh_addr(endpoint: &Endpoint) -> (EndpointAddr, bool) {
        let relay_online = timeout(Duration::from_secs(12), endpoint.online()).await.is_ok();
        (endpoint.addr(), relay_online)
    }

    fn make_codes(info: &HostInfo, addr: EndpointAddr, has_relay: bool) -> AddressCodes {
        let endpoint_id = info.endpoint.id();
        let direct = addr.ip_addrs().count();
        let key = to_hex(&info.token);
        let ticket = EndpointTicket::new(addr);
        let tcp_part = info.tcp.clone().unwrap_or_default();
        AddressCodes {
            universal: format!("EL2|{key}|{tcp_part}|{ticket}|{endpoint_id}"),
            short: format!("{endpoint_id}:{key}"),
            ticket: format!("{ticket}:{key}"),
            tcp: info.tcp.as_ref().map(|t| format!("EL2|{key}|{t}||")),
            tcp_note: info.tcp_note.clone(),
            has_relay,
            direct,
            game_ok: true, // реальное значение проставляет вызывающий (см. game_listening)
        }
    }

    /// Слушает ли что-нибудь порт игры: если нет, друг подключится к пустоте — об этом стоит предупредить.
    async fn game_listening(port: u16) -> bool {
        matches!(
            timeout(Duration::from_millis(700), TcpStream::connect(("127.0.0.1", port))).await,
            Ok(Ok(_))
        )
    }

    pub async fn fresh_codes() -> Result<AddressCodes, String> {
        let info = HOST.lock().unwrap().clone();
        let info = info.ok_or("Комната не открыта — сначала нажмите «Создать комнату»")?;
        let (addr, has_relay) = iroh_addr(&info.endpoint).await;
        let mut codes = make_codes(&info, addr, has_relay);
        codes.game_ok = game_listening(info.game_port).await;
        Ok(codes)
    }

    pub async fn host(port: u16) -> Result<AddressCodes, String> {
        stop_current();

        let mut token = [0u8; 16];
        getrandom::getrandom(&mut token).map_err(err)?;

        let endpoint = Endpoint::builder(presets::N0)
            .alpns(vec![ALPN.to_vec()])
            .proxy_from_env()
            .bind()
            .await
            .map_err(err)?;

        let accept_ep = endpoint.clone();
        let handle = tauri::async_runtime::spawn(async move {
            while let Some(incoming) = accept_ep.accept().await {
                spawn_child(async move {
                    let Ok(conn) = incoming.await else { return };
                    let Ok((send, mut recv)) = conn.accept_bi().await else { return };
                    // первое, что присылает гость, — секретный ключ из кода комнаты
                    let mut got = [0u8; 16];
                    if recv.read_exact(&mut got).await.is_err() || got != token {
                        conn.close(1u32.into(), b"denied");
                        return;
                    }
                    let Ok(tcp) = TcpStream::connect(("127.0.0.1", port)).await else {
                        conn.close(2u32.into(), b"game not running");
                        return;
                    };
                    pipe(tcp, send, recv).await;
                });
            }
        });
        set_state("host", format!("порт игры {port}"), handle);

        // TCP/UPnP и ожидание адресов iroh идут одновременно, чтобы не ждать их по очереди
        let ((tcp, tcp_note), (addr, has_relay)) =
            futures_util::future::join(start_tcp_gateway(port, token), iroh_addr(&endpoint)).await;

        let info = HostInfo { endpoint, token, tcp, tcp_note, game_port: port };
        *HOST.lock().unwrap() = Some(info.clone());
        let mut codes = make_codes(&info, addr, has_relay);
        codes.game_ok = game_listening(port).await;
        Ok(codes)
    }

    /// Гость: поднимает туннель через поддерживаемую Iroh 1.x инфраструктуру.
    async fn start_tunnel_iroh(addr: EndpointAddr, token: [u8; 16], secs: u64) -> Result<u16, String> {
        let endpoint = Endpoint::builder(presets::N0)
            .proxy_from_env()
            .bind()
            .await
            .map_err(err)?;

        let conn = timeout(Duration::from_secs(secs), endpoint.connect(addr, ALPN))
            .await
            .map_err(|_| "нет ответа от хозяина".to_string())?
            .map_err(err)?;

        let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(err)?;
        let port = listener.local_addr().map_err(err)?.port();

        let handle = tauri::async_runtime::spawn(async move {
            let _keep_alive = endpoint; // туннель живёт, пока жив endpoint
            while let Ok((tcp, _)) = listener.accept().await {
                let conn = conn.clone();
                spawn_child(async move {
                    let Ok((mut send, recv)) = conn.open_bi().await else { return };
                    if send.write_all(&token).await.is_err() {
                        return;
                    }
                    pipe(tcp, send, recv).await;
                });
            }
        });
        set_state("guest", format!("localhost:{port}"), handle);
        Ok(port)
    }

    // ───────────────────── разбор кода и перебор способов ─────────────────────

    enum Method {
        Tcp(String),
        Ticket(EndpointAddr),
        NodeId(EndpointId),
    }

    impl Method {
        fn name(&self) -> &'static str {
            match self {
                Method::Tcp(_) => "tcp",
                Method::Ticket(_) => "ticket",
                Method::NodeId(_) => "node_id",
            }
        }
    }

    fn label(name: &str) -> &'static str {
        match name {
            "tcp" => "прямой TCP",
            "ticket" => "тикет",
            _ => "короткий код (DNS iroh)",
        }
    }

    /// Понимает EL2, старый EL1 TCP-маршрут и короткий Endpoint ID.
    fn parse(input: &str) -> Result<([u8; 16], Vec<Method>), String> {
        let t = input.trim();
        let universal = t.strip_prefix("EL2|").or_else(|| t.strip_prefix("EL1|"));
        if let Some(rest) = universal {
            let parts: Vec<&str> = rest.split('|').collect();
            if parts.len() < 4 {
                return Err("код повреждён — скопируйте его целиком".into());
            }
            let token = from_hex16(parts[0]).ok_or("неверный ключ в коде — скопируйте код целиком")?;
            let mut methods = Vec::new();
            if !parts[1].is_empty() {
                methods.push(Method::Tcp(parts[1].to_string()));
            }
            if !parts[2].is_empty() {
                if let Ok(tk) = EndpointTicket::from_str(parts[2]) {
                    methods.push(Method::Ticket(tk.endpoint_addr().clone()));
                }
            }
            if !parts[3].is_empty() {
                if let Ok(id) = EndpointId::from_str(parts[3]) {
                    methods.push(Method::NodeId(id));
                }
            }
            if methods.is_empty() {
                return Err("в коде нет ни одного способа подключения".into());
            }
            return Ok((token, methods));
        }

        // старые форматы: «<тикет или Node ID>:<ключ>»
        let (head, key) = t
            .rsplit_once(':')
            .ok_or("неверный код: нужен вид «адрес:ключ» — скопируйте его целиком")?;
        let token = from_hex16(key).ok_or("неверный ключ в конце кода — скопируйте код целиком")?;
        if let Ok(tk) = EndpointTicket::from_str(head) {
            Ok((token, vec![Method::Ticket(tk.endpoint_addr().clone())]))
        } else if let Ok(id) = EndpointId::from_str(head) {
            Ok((token, vec![Method::NodeId(id)]))
        } else {
            Err("не удалось распознать код: это не тикет и не Node ID".into())
        }
    }


    const PROBE_REQUEST: &[u8] = b"END-LAUNCHER-P2P-PROBE-REQUEST-v1";
    const PROBE_RESPONSE: &[u8] = b"END-LAUNCHER-P2P-PROBE-RESPONSE-v1";

    /// Checks public relay availability, EL2 invite parsing and a two-way data exchange
    /// between two temporary endpoints. Does not stop or replace the active game room.
    pub async fn diagnostics() -> super::P2pDiagnosticReport {
        let started = Instant::now();
        let mut report = super::P2pDiagnosticReport {
            relay_online: false,
            relay_detail: "Проверка ещё не выполнена.".into(),
            invite_ok: false,
            invite_detail: "Проверка ещё не выполнена.".into(),
            roundtrip_ok: false,
            roundtrip_detail: "Проверка ещё не выполнена.".into(),
            elapsed_ms: 0,
        };

        let host = match Endpoint::builder(presets::N0)
            .alpns(vec![ALPN.to_vec()])
            .proxy_from_env()
            .bind()
            .await
        {
            Ok(endpoint) => endpoint,
            Err(e) => {
                report.relay_detail = format!("Не удалось создать сетевой endpoint: {}", e);
                report.invite_detail = "Проверьте интернет и настройки сети.".into();
                report.roundtrip_detail = "Тест передачи не запускался.".into();
                report.elapsed_ms = started.elapsed().as_millis() as u64;
                return report;
            }
        };

        report.relay_online = timeout(Duration::from_secs(12), host.online()).await.is_ok();
        report.relay_detail = if report.relay_online {
            "Соединение с публичным Iroh relay подтверждено.".into()
        } else {
            "За 12 секунд не удалось подтвердить публичный relay. Прямой маршрут ещё может работать.".into()
        };

        let mut token = [0u8; 16];
        if let Err(e) = getrandom::getrandom(&mut token) {
            report.invite_detail = format!("Не удалось создать случайный ключ: {}", e);
            report.roundtrip_detail = "Тест передачи не запускался.".into();
            report.elapsed_ms = started.elapsed().as_millis() as u64;
            return report;
        }

        let endpoint_id = host.id();
        let ticket = EndpointTicket::new(host.addr());
        let invite = format!("EL2|{}||{}|{}", to_hex(&token), ticket, endpoint_id);
        let (parsed_token, methods) = match parse(&invite) {
            Ok(parsed) => parsed,
            Err(e) => {
                report.invite_detail = format!("Сформированный код не прошёл проверку: {}", e);
                report.roundtrip_detail = "Тест передачи не запускался.".into();
                report.elapsed_ms = started.elapsed().as_millis() as u64;
                return report;
            }
        };
        let ticket_addr = methods.into_iter().find_map(|method| match method {
            Method::Ticket(addr) => Some(addr),
            _ => None,
        });
        let Some(ticket_addr) = ticket_addr else {
            report.invite_detail = "В коде не найден маршрут Iroh Ticket.".into();
            report.roundtrip_detail = "Тест передачи не запускался.".into();
            report.elapsed_ms = started.elapsed().as_millis() as u64;
            return report;
        };
        report.invite_ok = parsed_token == token;
        report.invite_detail = "EL2-код создан, тикет и ключ успешно разобраны обратно.".into();

        let guest = match Endpoint::builder(presets::N0).proxy_from_env().bind().await {
            Ok(endpoint) => endpoint,
            Err(e) => {
                report.roundtrip_detail = format!("Не удалось создать второй endpoint: {}", e);
                report.elapsed_ms = started.elapsed().as_millis() as u64;
                return report;
            }
        };

        let accept_ep = host.clone();
        let expected_token = token;
        let host_task = tauri::async_runtime::spawn(async move {
            let incoming = timeout(Duration::from_secs(18), accept_ep.accept())
                .await
                .map_err(|_| "хост не получил входящее соединение за 18 секунд".to_string())?
                .ok_or("endpoint хоста уже закрыт")?;
            let connection = timeout(Duration::from_secs(8), incoming)
                .await
                .map_err(|_| "не завершилось рукопожатие хоста".to_string())?
                .map_err(err)?;
            let (mut send, mut recv) = timeout(Duration::from_secs(8), connection.accept_bi())
                .await
                .map_err(|_| "гость не открыл двусторонний поток".to_string())?
                .map_err(err)?;
            let mut received_token = [0u8; 16];
            recv.read_exact(&mut received_token).await.map_err(err)?;
            if received_token != expected_token {
                return Err("ключ тестового приглашения не совпал".into());
            }
            let mut received = vec![0u8; PROBE_REQUEST.len()];
            recv.read_exact(&mut received).await.map_err(err)?;
            if received.as_slice() != PROBE_REQUEST {
                return Err("хост получил неверные тестовые данные".into());
            }
            send.write_all(PROBE_RESPONSE).await.map_err(err)?;
            Ok::<(), String>(())
        });

        let connection = match timeout(Duration::from_secs(18), guest.connect(ticket_addr, ALPN)).await {
            Ok(Ok(connection)) => connection,
            Ok(Err(e)) => {
                host_task.abort();
                report.roundtrip_detail = format!("Второй endpoint не подключился к хосту: {}", e);
                report.elapsed_ms = started.elapsed().as_millis() as u64;
                return report;
            }
            Err(_) => {
                host_task.abort();
                report.roundtrip_detail = "Истекло ожидание соединения между временными endpoint'ами.".into();
                report.elapsed_ms = started.elapsed().as_millis() as u64;
                return report;
            }
        };

        let transfer = async {
            let (mut send, mut recv) = connection.open_bi().await.map_err(err)?;
            send.write_all(&parsed_token).await.map_err(err)?;
            send.write_all(PROBE_REQUEST).await.map_err(err)?;
            let mut received = vec![0u8; PROBE_RESPONSE.len()];
            recv.read_exact(&mut received).await.map_err(err)?;
            if received.as_slice() != PROBE_RESPONSE {
                return Err("получен неверный ответ на тестовые данные".to_string());
            }
            Ok::<(), String>(())
        };
        match timeout(Duration::from_secs(12), transfer).await {
            Ok(Ok(())) => match timeout(Duration::from_secs(5), host_task).await {
                Ok(Ok(Ok(()))) => {
                    report.roundtrip_ok = true;
                    report.roundtrip_detail = "Два временных узла обменялись контрольными данными в обе стороны.".into();
                }
                Ok(Ok(Err(e))) => report.roundtrip_detail = format!("Ошибка на стороне хоста: {}", e),
                Ok(Err(e)) => report.roundtrip_detail = format!("Задача хоста завершилась с ошибкой: {}", e),
                Err(_) => report.roundtrip_detail = "Хост не подтвердил получение тестовых данных вовремя.".into(),
            },
            Ok(Err(e)) => {
                host_task.abort();
                report.roundtrip_detail = format!("Не удалось передать тестовые данные: {}", e);
            }
            Err(_) => {
                host_task.abort();
                report.roundtrip_detail = "Истекло ожидание ответа на тестовые данные.".into();
            }
        }
        report.elapsed_ms = started.elapsed().as_millis() as u64;
        report
    }

    pub async fn connect(input: String, method: Option<String>) -> Result<ConnectInfo, String> {
        stop_current();

        let (token, mut methods) = parse(&input)?;
        let want = method.unwrap_or_else(|| "auto".to_string());
        if want != "auto" {
            methods.retain(|m| m.name() == want.as_str());
            if methods.is_empty() {
                return Err(format!("в этом коде нет способа «{}»", label(&want)));
            }
        }
        // одиночному способу даём больше времени; при переборе — меньше, чтобы быстро перейти к следующему
        let single = methods.len() == 1;

        let mut errors: Vec<String> = Vec::new();
        for m in methods {
            let name = m.name();
            let res = match m {
                Method::Tcp(a) => start_tunnel_tcp(a, token, if single { 20 } else { 6 }).await,
                Method::Ticket(addr) => start_tunnel_iroh(addr, token, if single { 25 } else { 12 }).await,
                Method::NodeId(id) => {
                    start_tunnel_iroh(EndpointAddr::new(id), token, if single { 25 } else { 15 }).await
                }
            };
            match res {
                Ok(port) => return Ok(ConnectInfo { port, method: name.to_string() }),
                Err(e) => errors.push(format!("• {}: {}", label(name), e)),
            }
        }
        Err(format!("не удалось подключиться:\n{}", errors.join("\n")))
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::str::FromStr;
        use iroh_tickets::endpoint::EndpointTicket;

        const TEST_ENDPOINT_ID: &str =
            "ae58ff8833241ac82d6ff7611046ed67b5072d142c588d0063e942d9a75502b6";

        #[test]
        fn universal_v2_code_parses_tcp_ticket_and_endpoint_id() {
            let id = EndpointId::from_str(TEST_ENDPOINT_ID).unwrap();
            let addr = EndpointAddr::new(id.clone());
            let ticket = EndpointTicket::new(addr.clone());
            let key = "ab".repeat(16);
            let code = format!("EL2|{key}|127.0.0.1:25565|{ticket}|{id}");

            let (token, methods) = parse(&code).unwrap();

            assert_eq!(token, [0xab; 16]);
            assert_eq!(methods.len(), 3);
            assert!(matches!(&methods[0], Method::Tcp(address) if address == "127.0.0.1:25565"));
            match &methods[1] {
                Method::Ticket(parsed) => assert_eq!(parsed, ticket.endpoint_addr()),
                _ => panic!("EL2 ticket route was not parsed"),
            }
            assert!(matches!(&methods[2], Method::NodeId(parsed) if parsed == &id));
        }

        #[test]
        fn legacy_el1_tcp_route_remains_usable() {
            let key = "cd".repeat(16);
            let code = format!("EL1|{key}|127.0.0.1:25565||");
            let (token, methods) = parse(&code).unwrap();
            assert_eq!(token, [0xcd; 16]);
            assert!(matches!(methods.as_slice(), [Method::Tcp(address)] if address == "127.0.0.1:25565"));
        }

        #[test]
        fn legacy_short_endpoint_id_code_remains_usable() {
            let id = EndpointId::from_str(TEST_ENDPOINT_ID).unwrap();
            let key = "ef".repeat(16);
            let code = format!("{id}:{key}");
            let (token, methods) = parse(&code).unwrap();
            assert_eq!(token, [0xef; 16]);
            assert!(matches!(methods.as_slice(), [Method::NodeId(parsed)] if parsed == &id));
        }

        #[test]
        fn malformed_invitation_key_is_rejected() {
            assert!(parse("EL2|not-a-key|||").is_err());
        }
    }
}
