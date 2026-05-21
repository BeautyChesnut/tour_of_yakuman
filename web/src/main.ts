import { runRiichiCompatibilityReport } from "../../miniprogram/shared/riichi/compatibility";
import "./styles.css";

const report = runRiichiCompatibilityReport();
const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("找不到页面根节点");
}

app.innerHTML = `
  <section class="summary ${report.allPassed ? "summary-pass" : "summary-fail"}">
    <h1>riichi 浏览器兼容验证</h1>
    <p>${report.allPassed ? "全部通过" : "存在失败"}</p>
  </section>
  <section class="case-list">
    ${report.results
      .map(
        (result) => `
          <article class="case-card">
            <header class="case-header">
              <h2>${escapeHtml(result.name)}</h2>
              <span class="${result.passed ? "pass" : "fail"}">
                ${result.passed ? "通过" : "失败"}
              </span>
            </header>
            <p class="case-input">${escapeHtml(result.input)}</p>
            <p class="case-result">${escapeHtml(result.actual.text || JSON.stringify(result.actual.yaku))}</p>
            ${
              result.passed
                ? ""
                : `<ul class="failures">${result.failures
                    .map((failure) => `<li>${escapeHtml(failure)}</li>`)
                    .join("")}</ul>`
            }
          </article>
        `
      )
      .join("")}
  </section>
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
