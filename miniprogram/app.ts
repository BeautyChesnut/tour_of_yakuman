import "./utils/node-shim";
import { initCloudBackend, reportClientDiagnostic } from "./shared/services/online-backend/index";

initCloudBackend();

App<IAppOption>({
  globalData: {},
  onError() {
    void reportClientDiagnostic({
      action: "unhandledError",
      errorCode: "UNHANDLED_ERROR"
    });
  },
  onUnhandledRejection() {
    void reportClientDiagnostic({
      action: "unhandledRejection",
      errorCode: "UNHANDLED_REJECTION"
    });
  }
});
