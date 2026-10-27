//! Один общий HTTP-клиент на всё приложение. Раньше почти каждый запрос создавал свой клиент — а значит
//! заново настраивал TLS и открывал новое соединение. Общий клиент переиспользует соединения и TLS-сессии:
//! поиск модов, загрузки и проверки становятся быстрее и легче.

use std::sync::OnceLock;
use std::time::Duration;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn client() -> reqwest::Client {
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent(concat!("end-launcher/", env!("CARGO_PKG_VERSION"))) // Modrinth и GitHub требуют User-Agent
                .connect_timeout(Duration::from_secs(15))
                .pool_idle_timeout(Duration::from_secs(60))
                .build()
                .expect("не удалось создать HTTP-клиент")
        })
        .clone() // Client — это счётчик ссылок внутри, клонирование почти бесплатно
}
