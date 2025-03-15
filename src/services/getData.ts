import Emitter from "./eventEmitter";
import translateErrorMessage from "./translateErrorMessage";
import storageManager from "./storage.ts";

const initialHistory = storageManager.get("requestHistoryMap") || {};
const requestHistoryMap = new Map<string, number[]>(Object.entries(initialHistory));


const noMessagesPath = ["/Users/GetUser"];
/**
 * 检测请求是否过快
 * @param path API请求路径（非实际路径）
 * @returns 返回true 则代表请求过快，需要等待
 */
function rateLimit(path: string): boolean {
  const history = requestHistoryMap.get(path) || [];
  
  if (!requestHistoryMap.has(path)) {
    requestHistoryMap.set(path, [Date.now()]);
    return false;
  }

  if (history.length > 10) {
    requestHistoryMap.set(path, history.slice(1));
  }

  switch (path) {
    case "/Messages/PostComment":
      const list = history;
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        n++;
        if (Math.sqrt(Date.now() / 1000 - list[i] / 1000) < n) {
          return true;
        }
      }
  }
  requestHistoryMap.set(path, [...history, Date.now()]);
  storageManager.set("requestHistoryMap", Object.fromEntries(requestHistoryMap));
  return false;
}

export async function getData(path: string, body: any) {
  window.$message.destroyAll();
  if (rateLimit(path) === true) {
    Emitter.emit("error", "连接失败，请稍候重试", 2);
    throw "频率过快";
  }
  noMessagesPath.some((p) => path === p) || Emitter.emit("loading", "正在与服务器通信...", 40);
  return fetch(window.$getPath("/api" + path), {
    method: "POST",
    body: JSON.stringify(body),
    // @ts-ignore
    headers: {
      "Content-Type": "application/json",
      "x-API-Token": localStorage.getItem("token") || undefined,
      "x-API-AuthCode": localStorage.getItem("authCode") || undefined,
    },
  }).then((response) => {
    window.$message.destroyAll();
    if (!response.ok) {
      return response.json().then(() => {
        Emitter.emit("error", "无法与服务器通讯，请稍候再试", 3);
      });
    }
    return response.json().then((data) => {
      if (data.Status == 403 && localStorage.getItem("loginStatus") !== "true") {
        Emitter.emit("loginRequired");
        Emitter.emit("error", translateErrorMessage(data.Message), 3);
      } else if (data.Status !== 200) {
        noMessagesPath.some((p) => path === p) ||
          Emitter.emit("error", translateErrorMessage(data.Message), 3);
      }
      return data;
    });
  });
}

export async function login(arg1: String | null, arg2: String | null, is_token = false) {
  window.$message.destroyAll();
  Emitter.emit("loading", "正在与服务器通信...", 50);
  let username = is_token ? null : arg1;
  let password = is_token ? null : arg2;
  let header = { "Content-Type": "application/json" };
  if (is_token && arg1 && arg2) {
    // @ts-ignore
    header["x-API-Token"] = arg1;
    // @ts-ignore
    header["x-API-AuthCode"] = arg2;
  }
  return fetch(window.$getPath("/api/Users/Authenticate"), {
    method: "POST",
    body: JSON.stringify({
      Login: username,
      Password: password,
      Version: 2411,
      Device: {
        Identifier: "7db01528cf13e2199e141c402d79190e",
        Language: "Chinese",
      },
    }),
    headers: header,
  }).then(async (response) => {
    window.$message.destroyAll();
    if (!response.ok) {
      return response.json().then(() => {
        Emitter.emit("error", "无法与服务器通讯，请稍候再试", 3);
      });
    }
    return response.json().then((data) => {
      if (data.Status === 403) {
        Emitter.emit("error", "用户名或密码错误", 3);
        throw "密码错误";
      } else if (data.Status !== 200) {
        Emitter.emit("error", translateErrorMessage(data.Message), 3);
      }
      window.$message.destroyAll();
      password && localStorage.setItem("loginStatus", "true");
      password && Emitter.emit("success", "登录成功", 1);
      return data;
    });
  });
}
