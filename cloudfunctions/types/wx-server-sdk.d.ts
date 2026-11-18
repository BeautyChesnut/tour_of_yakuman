declare module "wx-server-sdk" {
  import type { CloudDatabase, CloudFunctionContext } from "../_shared/src/index";

  export const DYNAMIC_CURRENT_ENV: string;

  export function init(options?: { env?: string }): void;

  export function database(): CloudDatabase;

  export function getWXContext(): CloudFunctionContext;
}
