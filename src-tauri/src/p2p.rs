//! Совместная игра P2P: друг подключается к вашему миру напрямую, без Hamachi/Radmin.
//!
//! Это НЕ виртуальная сеть (никаких драйверов и прав администратора), а туннель только для Minecraft:
//! лаунчер хозяина даёт код комнаты, лаунчер друга открывает у него локальный порт, из которого
//! трафик идёт к хозяину. В игре заходят по адресу localhost:<порт>.
//!
//! СПОСОБЫ СОЕДИНЕНИЯ (если один не сработал — лаунчер сам пробует следующий):
//!   1. «tcp»     — прямое TCP-подключение: хозяин открывает порт на роутере через UPnP
//!                  (не зависит ни от каких серверов; не сработает за «серым» IP/CGNAT);
//!   2. «ticket»  — iroh: тикет с relay и прямыми IP хозяина, DNS iroh не нужен
//!                  (страны, где он блокируется, и жёсткие NAT);
//!   3. «node_id» — iroh: голый Node ID, адрес ищется через публичный DNS iroh (США/ЕС).
//! «Универсальный код» содержит все три способа сразу. Короткий код, тикет и TCP-адрес можно
//! отдавать и по отдельности.
//! Ключ доступа (в каждом коде) обязателен: без него хозяин закрывает соединение. Хозяин всегда
//! соединяет гостей только со СВОИМ портом игры, другие порты недоступны.
//!
//! Код под cargo-feature `p2p`; она включена по умолчанию (отключить: --no-default-features).
//! Версия iroh закреплена (=0.92.0): API между версиями заметно меняется.

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
    /// «<node id>:<ключ>» — для стран, где работает DNS iroh
    pub short: String,
    /// «<тикет>:<ключ>» — с прямыми адресами, DNS iroh не нужен
    pub ticket: String,
    /// только прямое TCP-подключение (если удалось открыть порт через UPnP)
    pub tcp: Option<String>,
    /// пояснение про TCP/UPnP (успех или причина, почему не вышло)
    pub tcp_note: String,
    /// узнал ли ваш компьютер адрес relay-сервера
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
    use iroh::{Endpoint, NodeAddr, NodeId, Watcher};
    use iroh_base::ticket::NodeTicket;
    use std::net::{IpAddr, Ipv4Addr};
    use std::str::FromStr;
    use std::sync::Mutex;
    use std::time::Duration;
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

    /// Адрес хозяина в iroh. Узнаётся не сразу (relay и внешние адреса появляются через секунды после
    /// запуска), поэтому до ~8 секунд ждём, пока в нём будут и relay, и прямые адреса.
    async fn iroh_addr(endpoint: &Endpoint) -> NodeAddr {
        let mut addr = NodeAddr::new(endpoint.node_id());
        for _ in 0..16 {
            // в iroh 0.92 node_addr() — Watcher: initialized() даёт NodeAddr, когда адрес известен
            let got = timeout(Duration::from_secs(2), endpoint.node_addr().initialized()).await;
            if let Ok(a) = got {
                addr = a;
                if addr.relay_url.is_some() && !addr.direct_addresses.is_empty() {
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        addr
    }

    fn make_codes(info: &HostInfo, addr: NodeAddr) -> AddressCodes {
        let node_id = info.endpoint.node_id();
        let has_relay = addr.relay_url.is_some();
        let direct = addr.direct_addresses.len();
        let key = to_hex(&info.token);
        let ticket = NodeTicket::new(addr);
        let tcp_part = info.tcp.clone().unwrap_or_default();
        AddressCodes {
            universal: format!("EL1|{key}|{tcp_part}|{ticket}|{node_id}"),
            short: format!("{node_id}:{key}"),
            ticket: format!("{ticket}:{key}"),
            tcp: info.tcp.as_ref().map(|t| format!("EL1|{key}|{t}||")),
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
        let addr = iroh_addr(&info.endpoint).await;
        let mut codes = make_codes(&info, addr);
        codes.game_ok = game_listening(info.game_port).await;
        Ok(codes)
    }

    pub async fn host(port: u16) -> Result<AddressCodes, String> {
        stop_current();

        let mut token = [0u8; 16];
        getrandom::getrandom(&mut token).map_err(err)?;

        let endpoint = Endpoint::builder()
            .alpns(vec![ALPN.to_vec()])
            .discovery_n0() // публикуем адрес для короткого кода (если DNS iroh недоступен — остальные способы работают)
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
        let ((tcp, tcp_note), addr) =
            futures_util::future::join(start_tcp_gateway(port, token), iroh_addr(&endpoint)).await;

        let info = HostInfo { endpoint, token, tcp, tcp_note, game_port: port };
        *HOST.lock().unwrap() = Some(info.clone());
        let mut codes = make_codes(&info, addr);
        codes.game_ok = game_listening(port).await;
        Ok(codes)
    }

    /// Гость: поднимает туннель через iroh (с DNS-поиском или без).
    async fn start_tunnel_iroh(addr: NodeAddr, use_dns: bool, token: [u8; 16], secs: u64) -> Result<u16, String> {
        let builder = Endpoint::builder();
        let builder = if use_dns { builder.discovery_n0() } else { builder }; // с тикетом DNS iroh не трогаем вообще
        let endpoint = builder.bind().await.map_err(err)?;

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
        Ticket(NodeAddr),
        NodeId(NodeId),
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

    /// Понимает универсальный код «EL1|ключ|tcp|тикет|nodeid» и старые «адрес:ключ».
    fn parse(input: &str) -> Result<([u8; 16], Vec<Method>), String> {
        let t = input.trim();
        if let Some(rest) = t.strip_prefix("EL1|") {
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
                if let Ok(tk) = NodeTicket::from_str(parts[2]) {
                    methods.push(Method::Ticket(tk.node_addr().clone()));
                }
            }
            if !parts[3].is_empty() {
                if let Ok(id) = NodeId::from_str(parts[3]) {
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
        if let Ok(tk) = NodeTicket::from_str(head) {
            Ok((token, vec![Method::Ticket(tk.node_addr().clone())]))
        } else if let Ok(id) = NodeId::from_str(head) {
            Ok((token, vec![Method::NodeId(id)]))
        } else {
            Err("не удалось распознать код: это не тикет и не Node ID".into())
        }
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
                Method::Ticket(addr) => start_tunnel_iroh(addr, false, token, if single { 25 } else { 12 }).await,
                Method::NodeId(id) => {
                    start_tunnel_iroh(NodeAddr::new(id), true, token, if single { 25 } else { 15 }).await
                }
            };
            match res {
                Ok(port) => return Ok(ConnectInfo { port, method: name.to_string() }),
                Err(e) => errors.push(format!("• {}: {}", label(name), e)),
            }
        }
        Err(format!("не удалось подключиться:\n{}", errors.join("\n")))
    }
}
