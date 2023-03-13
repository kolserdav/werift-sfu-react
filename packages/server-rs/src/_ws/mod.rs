use self::messages::{Any, FromValue, GetLocale, GetUserId, SetUserId};
pub use super::locales::{get_locale, Client, LocaleValue};
use std::{
    net::{TcpListener, TcpStream},
    ops::Deref,
    thread::spawn,
};
use tungstenite::{
    accept_hdr,
    handshake::server::{Request, Response},
    Message, WebSocket,
};
use uuid::Uuid;
pub mod messages;
use log::{debug, error, info};

use messages::{MessageArgs, MessageType, SetLocale};
use serde::Serialize;
use serde_json::{to_string, Result as SerdeResult};
use std::{
    collections::HashMap,
    fmt::Debug,
    str::FromStr,
    sync::{Arc, Mutex},
};
mod collections;
use collections::Sockets;

#[derive(Debug)]
pub struct Socket {
    pub conn_id: String,
    pub ws: Arc<Mutex<WebSocket<TcpStream>>>,
}

#[derive(Debug)]

pub struct WS {
    pub sockets: Vec<Socket>,
}

impl WS {
    pub fn new() -> Self {
        Self {
            sockets: Vec::new(),
        }
    }

    pub fn listen_ws(self, addr: &str) {
        let server = TcpListener::bind(addr);
        if let Err(e) = server {
            error!("Failed start WS server: {:?}", e);
            return;
        }
        let server = server.unwrap();
        info!("Server WS listen at: {}", &addr);

        let this: Arc<Mutex<WS>> = Arc::new(Mutex::new(self));

        for stream in server.incoming() {
            let this = this.clone();
            spawn(move || {
                let callback = |req: &Request, mut response: Response| {
                    debug!("Received a new ws handshake");
                    debug!("The request's path is: {}", req.uri().path());
                    debug!("The request's headers are:");
                    for (ref header, _value) in req.headers() {
                        debug!("* {}: {:?}", header, _value);
                    }

                    let headers = response.headers_mut();
                    headers.append("MyCustomHeader", ":)".parse().unwrap());

                    Ok(response)
                };
                let websocket = accept_hdr(stream.unwrap(), callback).unwrap();
                let ws = Arc::new(Mutex::new(websocket));
                let websocket = ws.clone();
                loop {
                    let ws = ws.clone();
                    let mut websocket = websocket.lock().unwrap();
                    let msg = websocket.read_message().unwrap();
                    std::mem::drop(websocket);

                    if msg.is_binary() || msg.is_text() {
                        let conn_id = Uuid::new_v4();
                        let mut this = this.lock().unwrap();

                        this.handle_ws(msg, conn_id, ws).unwrap();
                    } else {
                        warn!("Unsupported message mime: {:?}", msg);
                    }
                }
            });
        }
    }

    fn handle_ws(
        &mut self,
        msg: Message,
        conn_id: Uuid,
        ws: Arc<Mutex<WebSocket<TcpStream>>>,
    ) -> Result<(), ()> {
        let msg_c = msg.clone();
        let json = self.parse_message::<Any>(msg);
        if let Err(e) = json {
            error!("Error handle WS: {:?}", e);
            return Ok(());
        }
        let json = json.unwrap();
        let type_mess = &json.r#type;

        debug!("Get message: {}", json);

        match type_mess {
            MessageType::GET_LOCALE => {
                self.get_locale(msg_c, conn_id, ws);
            }
            MessageType::GET_USER_ID => {
                self.get_user_id(msg_c, conn_id, ws);
            }
            _ => {
                warn!("Default case of message: {:?}", json);
            }
        };

        Ok(())
    }

    pub fn get_locale(
        &mut self,
        msg: Message,
        conn_id: Uuid,
        ws: Arc<Mutex<WebSocket<TcpStream>>>,
    ) {
        let msg = self.parse_message::<GetLocale>(msg).unwrap();
        let locale = get_locale(msg.data.locale);

        let mess = MessageArgs {
            connId: conn_id.to_string(),
            id: msg.id,
            data: SetLocale {
                locale: locale.Client,
            },
            r#type: MessageType::SET_LOCALE,
        };
        info!("Get lale: {:?}", ws);
        let mut ws = ws.lock().unwrap();
        info!("Get lcoale:");
        ws.write_message(Message::Text(to_string(&mess).unwrap()))
            .unwrap();
    }

    pub fn get_user_id(
        &mut self,
        msg: Message,
        conn_id: Uuid,
        ws: Arc<Mutex<WebSocket<TcpStream>>>,
    ) {
        let msg = self.parse_message::<GetUserId>(msg).unwrap();
        let conn_id_str = conn_id.to_string();

        self.set_socket_by_id(conn_id.to_string(), ws);

        self.send_message(MessageArgs::<SetUserId> {
            id: msg.id,
            connId: conn_id_str,
            r#type: MessageType::SET_USER_ID,
            data: SetUserId {
                name: msg.data.userName,
            },
        })
        .unwrap();
    }

    fn send_message<T>(&mut self, msg: MessageArgs<T>) -> Result<(), ()>
    where
        T: Serialize + Debug,
    {
        let conn_id = msg.connId.clone();
        let socket = self.get_socket_by_id(&conn_id);
        if let None = socket {
            return Err(());
        }
        let socket = socket.unwrap();
        let mut socket = socket.lock().unwrap();
        debug!("Send message: {:?}", &msg);
        socket
            .write_message(Message::Text(to_string(&msg).unwrap()))
            .unwrap();
        Ok(())
    }

    pub fn parse_message<T>(&mut self, msg: Message) -> SerdeResult<MessageArgs<T>>
    where
        T: FromValue + Debug,
    {
        let msg_str = msg.to_string();
        let json: serde_json::Value = serde_json::from_str(msg_str.as_str()).map_err(|err| {
            error!("Failed parse JSON: {:?}", err);
            err
        })?;
        debug!("Parse message: {}", json);
        Ok(MessageArgs {
            id: json["id"].to_string().replace("\"", ""),
            connId: json["connId"].to_string().replace("\"", ""),
            r#type: MessageType::from_str(json["type"].as_str().unwrap()).unwrap(),
            data: T::from(&json["data"]),
        })
    }

    pub fn get_socket_by_id(
        &mut self,
        conn_id: &String,
    ) -> Option<Arc<Mutex<WebSocket<TcpStream>>>> {
        let mut res: Option<Arc<Mutex<WebSocket<TcpStream>>>> = None;
        for sock in &mut self.sockets {
            if sock.conn_id == conn_id.deref() {
                res = Some(sock.ws.clone());
                break;
            }
        }
        res
    }

    fn set_socket_by_id(&mut self, conn_id: String, ws: Arc<Mutex<WebSocket<TcpStream>>>) {
        let socket = self.get_socket_by_id(&conn_id);
        if let Some(v) = socket {
            warn!("Socket exists: {:?}", v);
            return;
        }

        self.sockets.push(Socket { conn_id, ws });
    }
}
