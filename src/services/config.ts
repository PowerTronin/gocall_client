const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const envWsUrl = import.meta.env.VITE_WS_URL?.trim();

const isLocalDevHost = (hostname: string, port: string): boolean => {
  const isLoopbackHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  return isLoopbackHost && (port === "1420" || port === "4173" || port === "5173");
};

const getDefaultApiBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return "http://localhost:8080/api";
  }

  const { origin, hostname, port } = window.location;
  if (isLocalDevHost(hostname, port)) {
    return `http://${hostname}:8080/api`;
  }

  return `${origin}/api`;
};

const getDefaultWsBaseUrl = (): string => {
  if (typeof window === "undefined") {
    return "ws://localhost:8080/api/chat/ws";
  }

  const { host, hostname, port, protocol } = window.location;
  if (isLocalDevHost(hostname, port)) {
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${hostname}:8080/api/chat/ws`;
  }

  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${host}/api/chat/ws`;
};

export const API_BASE_URL = trimTrailingSlashes(
  envApiBaseUrl && envApiBaseUrl.length > 0
    ? envApiBaseUrl
    : getDefaultApiBaseUrl()
);

export const WS_BASE_URL = trimTrailingSlashes(
  envWsUrl && envWsUrl.length > 0 ? envWsUrl : getDefaultWsBaseUrl()
);
