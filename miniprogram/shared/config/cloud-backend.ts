export type OnlineBackendMode = "cloud-function" | "cloud-container";

export interface CloudBackendConfig {
  mode: OnlineBackendMode;
  envId: string;
  containerServiceName: string;
  containerBasePath: string;
}

export const CLOUD_BACKEND_CONFIG: CloudBackendConfig = {
  mode: "cloud-container",
  envId: "prod-d8g0fjhdr8b4ad99c",
  containerServiceName: "express-eovc",
  containerBasePath: "/api"
};
