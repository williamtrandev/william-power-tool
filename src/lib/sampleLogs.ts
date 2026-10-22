/**
 * Small, realistic demo logs for first-time users and the guided tour: a .NET gateway and a
 * Serilog core service sharing request ids, with timeouts, auth failures, a stack trace and
 * JSON bodies (Vietnamese text escaped like Laravel/.NET would).
 */

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const guid = (r: () => number) =>
  [8, 4, 4, 4, 12].map((n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('')).join('-');

const gwTime = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const coreTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} +07:00`;

const ENDPOINTS = ['/api/orders/advancedsearch', '/api/vouchers/redeem', '/api/report/export', '/api/payments/confirm', '/api/merchants/list'];

export function sampleLogFiles(now = Date.now()): File[] {
  const r = rng(20261008);
  const gw: string[] = [];
  const core: string[] = [];
  let t = now - 45 * 60 * 1000; // last 45 minutes

  gw.push(`[${gwTime(new Date(t))} INF]  Now listening on: https://[::]:7186`);
  core.push(`${coreTime(new Date(t))} [INF] Report export service starting with 4 concurrent worker(s).`);

  for (let k = 0; k < 140; k++) {
    t += 8000 + Math.floor(r() * 12000);
    const id = guid(r);
    const ep = ENDPOINTS[Math.floor(r() * ENDPOINTS.length)];
    const roll = r();
    const d = new Date(t);
    const d2 = new Date(t + 40);
    const ms = 20 + Math.floor(r() * 400);

    gw.push(`[${gwTime(d)} INF]  Request starting HTTP/1.1 POST https://gateway.local${ep} - application/json`);
    gw.push(`[${gwTime(d)} INF] ${id} --- BEGIN MESSAGE ---`);
    gw.push(`[${gwTime(d)} INF] ${id} Request https gateway.local${ep} {"merchantId":${3000 + Math.floor(r() * 99)}}`);
    core.push(`${coreTime(d2)} [INF] Request ${id} https core.local${ep}`);

    if (roll < 0.06) {
      // downstream timeout
      core.push(`${coreTime(new Date(t + 30040))} [ERR] Timed out trying to connect!`);
      core.push(`${coreTime(new Date(t + 30050))} [INF] Response ${id} {"success":false,"code":"core.timeout","message":"Hệ thống bận, vui lòng thử lại"}`);
      gw.push(`[${gwTime(new Date(t + 30100))} ERR] ${id} Upstream call failed: timeout after 30000 ms`);
      gw.push(`[${gwTime(new Date(t + 30100))} INF]  HTTP POST ${ep} responded 504 in 30101.2 ms`);
    } else if (roll < 0.1) {
      // auth failure
      gw.push(`[${gwTime(d)} ERR] ${id} CoreAuthenticationMiddleware: Authorize failed with message = Username or Credential is not matched`);
      gw.push(`[${gwTime(d)} INF] ${id} Response {"Success":false,"Message":"Ch\\u1eef k\\u00fd kh\\u00f4ng h\\u1ee3p l\\u1ec7","Code":"auth.signature_failed"}`);
      gw.push(`[${gwTime(d)} INF]  HTTP POST ${ep} responded 401 in ${ms}.5 ms`);
    } else if (roll < 0.13 && ep === '/api/report/export') {
      // crash with a stack trace
      core.push(`${coreTime(new Date(t + 120))} [ERR] Export report failed for merchant 3042
System.NullReferenceException: Object reference not set to an instance of an object.
   at Watane.Application.Reports.ExportService.BuildSheet(ReportRequest req) in /src/Watane.Application/Reports/ExportService.cs:line 88
   at Watane.Application.Reports.ExportService.RunAsync(ReportRequest req, CancellationToken ct) in /src/Watane.Application/Reports/ExportService.cs:line 41
   at Microsoft.AspNetCore.Mvc.Infrastructure.ActionMethodExecutor.TaskOfIActionResultExecutor.Execute(IActionResultTypeMapper mapper)
   at Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker.InvokeActionMethodAsync()
   at Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker.InvokeNextActionFilterAsync()
   at Microsoft.AspNetCore.Routing.EndpointMiddleware.Invoke(HttpContext httpContext)`);
      core.push(`${coreTime(new Date(t + 130))} [INF] Response ${id} {"success":false,"code":"report.export_failed","message":"Xuất báo cáo thất bại"}`);
      gw.push(`[${gwTime(d)} INF]  HTTP POST ${ep} responded 500 in ${ms}.9 ms`);
    } else {
      if (r() < 0.15) core.push(`${coreTime(new Date(t + 60))} [WRN] Slow query on Orders took ${900 + Math.floor(r() * 900)} ms`);
      core.push(`${coreTime(new Date(t + 80))} [INF] Response ${id} {"success":true,"data":{"total":${Math.floor(r() * 500)}}}`);
      gw.push(`[${gwTime(d)} INF] ${id} Response {"Success":true}`);
      gw.push(`[${gwTime(d)} INF] ${id} --- END MESSAGE ---`);
      gw.push(`[${gwTime(d)} INF]  HTTP POST ${ep} responded 200 in ${ms}.3 ms`);
    }
    if (k % 20 === 0) core.push(`${coreTime(new Date(t + 500))} [INF] ${pad(d.getHours())}:${pad(d.getMinutes())}:00 AutoResendSMSsJob is working.`);
  }

  return [
    new File([gw.join('\n') + '\n'], 'demo-gateway.log', { type: 'text/plain', lastModified: now }),
    new File([core.join('\n') + '\n'], 'demo-core.log', { type: 'text/plain', lastModified: now }),
  ];
}
