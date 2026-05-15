use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const SERVICE_TYPE: &str = "_fileosophy._tcp.local.";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Peer {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub addresses: Vec<String>,
    pub token: String,
}

pub struct MdnsService {
    daemon: ServiceDaemon,
    peers: Arc<Mutex<HashMap<String, Peer>>>,
    registered_name: Option<String>,
    registered_fullname: Option<String>,
}

impl MdnsService {
    pub fn new() -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|e| format!("mDNS 初始化失败: {e}"))?;
        Ok(Self {
            daemon,
            peers: Arc::new(Mutex::new(HashMap::new())),
            registered_name: None,
            registered_fullname: None,
        })
    }

    /// 注册本机为 Fileosophy 服务实例
    pub fn register(&mut self, port: u16, token: &str) -> Result<(), String> {
        let hostname = get_hostname();

        let instance_name = format!("Fileosophy@{hostname}");
        let mut properties = std::collections::HashMap::new();
        properties.insert("name".to_string(), hostname.clone());
        properties.insert("token".to_string(), token.to_string());

        let my_ip = local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "127.0.0.1".to_string());

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &format!("{instance_name}.local."),
            my_ip,
            port,
            properties,
        )
        .map_err(|e| format!("创建服务信息失败: {e}"))?;

        self.daemon
            .register(service_info)
            .map_err(|e| format!("注册 mDNS 服务失败: {e}"))?;

        self.registered_name = Some(instance_name.clone());
        self.registered_fullname = Some(format!("{instance_name}.{SERVICE_TYPE}"));
        log::info!("mDNS 服务已注册，端口: {port}");
        Ok(())
    }

    /// 开始监听局域网中的其他 Fileosophy 实例
    pub fn start_discovery(&self) -> Result<(), String> {
        let receiver = self
            .daemon
            .browse(SERVICE_TYPE)
            .map_err(|e| format!("启动 mDNS 发现失败: {e}"))?;

        let peers = Arc::clone(&self.peers);
        let registered_name = self.registered_name.clone();

        std::thread::spawn(move || {
            while let Ok(event) = receiver.recv() {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        let resolved_name = info.get_fullname().to_string();

                        // 跳过自身
                        if let Some(ref reg_name) = registered_name {
                            if resolved_name.contains(reg_name) {
                                continue;
                            }
                        }

                        let addresses: Vec<String> =
                            info.get_addresses().iter().map(|a| a.to_string()).collect();
                        let host = info.get_hostname().to_string();
                        let port = info.get_port();
                        let token = info.get_property_val_str("token")
                            .map(|s| s.to_string())
                            .unwrap_or_default();

                        let peer = Peer {
                            name: resolved_name.clone(),
                            host,
                            port,
                            addresses,
                            token,
                        };

                        if let Ok(mut map) = peers.lock() {
                            map.insert(resolved_name, peer);
                        }
                    }
                    ServiceEvent::ServiceRemoved(_, full_name) => {
                        if let Ok(mut map) = peers.lock() {
                            map.remove(&full_name);
                        }
                    }
                    _ => {}
                }
            }
        });

        log::info!("mDNS 发现已启动");
        Ok(())
    }

    /// 获取当前发现的对等节点列表
    pub fn get_peers(&self) -> Vec<Peer> {
        self.peers
            .lock()
            .map(|map| map.values().cloned().collect())
            .unwrap_or_default()
    }

    /// 停止 mDNS 服务
    pub fn shutdown(&self) -> Result<(), String> {
        if let Some(ref fullname) = self.registered_fullname {
            let _ = self.daemon.unregister(fullname);
        }
        self.daemon
            .shutdown()
            .map_err(|e| format!("mDNS 关闭失败: {e}"))?;
        log::info!("mDNS 服务已停止");
        Ok(())
    }
}

fn get_hostname() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOSTNAME").unwrap_or_else(|_| "device".to_string())
    }
}
