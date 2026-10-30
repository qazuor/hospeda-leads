/**
 * Panel styles. Tokens carry an `--hc-` prefix: WhatsApp defines its own `--primary` & co. on page elements and those reach our host
 * with higher precedence than `:host` rules. The host mirrors the theme as `.dark` and only the tokens change.
 */
export const PANEL_CSS = `
:host{all:initial;--hc-bg:#fff;--hc-surface:#f5f7fb;--hc-chip:#eef2f8;--hc-border:#e3e8f0;--hc-text:#0f172a;--hc-muted:#5b6678;--hc-primary:#2563eb;--hc-primary-text:#fff;--hc-primary-ink:#1d4ed8;
--hc-info-bg:#e8f0fe;--hc-info-text:#1e3a8a;--hc-warn-bg:#fff4dc;--hc-warn-text:#7a4b00;--hc-danger-bg:#fdecec;--hc-danger-text:#991b1b;--hc-ok:#16a34a;--hc-amber:#d97706;--hc-red:#dc2626;--hc-sent:#1d4ed8;--hc-received:#a16207;--hc-rail-bg:#f7f5f3;
font:14px/1.4 "Plus Jakarta Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--hc-text)}
:host(.dark){--hc-bg:#161d24;--hc-surface:#1b2530;--hc-chip:#1f2a36;--hc-border:#2a3540;--hc-text:#e9edf2;--hc-muted:#9aa7b4;--hc-primary-ink:#93c5fd;
--hc-info-bg:#13283f;--hc-info-text:#bfdbfe;--hc-warn-bg:#3a2a12;--hc-warn-text:#fde68a;--hc-danger-bg:#3b1414;--hc-danger-text:#fecaca;--hc-ok:#22c55e;--hc-amber:#f59e0b;--hc-red:#ef4444;--hc-sent:#93c5fd;--hc-received:#fcd34d;--hc-rail-bg:#1d1f1f}
*{box-sizing:border-box}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--hc-primary);outline-offset:2px}
a{color:var(--hc-primary-ink)}
.launcher{position:fixed;right:16px;bottom:84px;z-index:2147483000;height:48px;padding:0 14px 0 8px;border:1px solid var(--hc-border);border-radius:999px;background:var(--hc-bg);display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;box-shadow:0 8px 20px -10px #0009}
.logo{width:32px;height:32px;border-radius:50%;object-fit:cover;flex:none}
.launcher.rail{right:auto;bottom:auto;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;box-shadow:none;justify-content:center;position:fixed}
.launcher.waiting{visibility:hidden}
.launcher.rail:hover{background:var(--hc-chip)}
.launcher.rail .logo{width:28px;height:28px}
.launcher.rail .label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.launcher.rail .dot{position:absolute;right:4px;bottom:4px;width:10px;height:10px;border:2px solid var(--hc-rail-bg)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--hc-muted)}
.dot.ok{background:var(--hc-ok)}.dot.warn{background:var(--hc-amber)}.dot.error{background:var(--hc-red)}
.panel{position:fixed;top:72px;right:16px;bottom:144px;z-index:2147483000;width:min(380px,calc(100vw - 32px));display:flex;flex-direction:column;justify-content:flex-start;pointer-events:none}
.card{pointer-events:auto;max-height:100%;display:flex;flex-direction:column;background:var(--hc-bg);border:1px solid var(--hc-border);border-radius:14px;box-shadow:0 12px 32px -12px #000a;overflow:hidden}
.bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 10px 14px;border-bottom:1px solid var(--hc-border)}
.brand{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--hc-muted)}
.brand .mark{width:22px;height:22px;border-radius:6px;object-fit:cover}
.title{display:flex;flex-direction:column;gap:2px;min-width:0}
.title strong{font-size:15px}
.title span{font-size:12px;color:var(--hc-muted)}
.icon{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--hc-muted);display:grid;place-items:center;flex:none}
.icon:hover{background:var(--hc-chip)}
.body{padding:14px;display:flex;flex-direction:column;gap:12px;overflow:auto;min-height:0;flex:1 1 auto}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--hc-primary-ink)}
.name{font-size:17px;font-weight:700}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:12px;padding:4px 8px;border-radius:999px;background:var(--hc-chip);color:var(--hc-text)}
.chip.sent{color:var(--hc-sent)}.chip.received{color:var(--hc-received)}
.box{padding:10px;border-radius:10px;background:var(--hc-surface);display:flex;flex-direction:column;gap:4px}
.box .label{font-size:12px;color:var(--hc-muted)}
.note{padding:10px;border-radius:10px;font-size:13px;line-height:1.45}
.note.info{background:var(--hc-info-bg);color:var(--hc-info-text)}.note.warn{background:var(--hc-warn-bg);color:var(--hc-warn-text)}.note.danger{background:var(--hc-danger-bg);color:var(--hc-danger-text)}
.meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--hc-muted)}
.muted{color:var(--hc-muted);font-size:13px;line-height:1.45}
.actions{display:flex;gap:8px;align-items:center}
.popover{position:fixed;z-index:2147483001;width:300px;max-height:60vh;overflow:auto;box-sizing:border-box;padding:12px;border:1px solid var(--hc-border);border-radius:12px;background:var(--hc-surface);color:var(--hc-text);box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:13px;line-height:1.5;white-space:pre-line;pointer-events:none}
.popover strong{display:block;margin-bottom:6px}
.popover mark{background:var(--hc-warn-bg);color:var(--hc-warn-text);border-radius:4px;padding:0 3px}
.actions.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
.actions.grid .btn.primary{grid-column:1/-1}
.btn{min-height:40px;padding:8px 14px;line-height:1.2;text-align:center;border-radius:10px;border:1px solid var(--hc-border);background:transparent;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;color:var(--hc-text)}
.btn.primary{flex:1;border:0;background:var(--hc-primary);color:var(--hc-primary-text);font-weight:600}
.btn.primary:hover{background:#1d4ed8}
.btn.danger{color:var(--hc-danger-text);border-color:color-mix(in srgb,var(--hc-red) 45%,var(--hc-border))}
.btn.small{height:36px;font-size:13px}
.btn:disabled{opacity:.55;cursor:not-allowed}
.section{display:flex;flex-direction:column;gap:8px}
.section + .section{border-top:1px solid var(--hc-border);padding-top:12px}
.section h3{margin:0;font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--hc-muted)}
.status{display:flex;align-items:center;gap:8px}
.field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--hc-muted)}
.field input,select{height:38px;border:1px solid var(--hc-border);border-radius:10px;background:var(--hc-surface);padding:0 10px;font-size:14px;color:var(--hc-text)}
.toggle{display:flex;align-items:center;justify-content:space-between;gap:12px}
.toggle input{width:18px;height:18px;accent-color:var(--hc-primary)}
.list{display:flex;flex-direction:column;gap:6px;padding:0 10px;overflow:auto;flex:1;min-height:80px}
.row{display:flex;gap:10px;padding:10px;border-radius:10px;background:var(--hc-surface);align-items:flex-start}
.row input{width:16px;height:16px;margin-top:2px;accent-color:var(--hc-primary);flex:none}
.row .content{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.row .text{word-break:break-word}
.dir{font-weight:600}.dir.out{color:var(--hc-sent)}.dir.in{color:var(--hc-received)}
.selectall{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;font-size:13px}
.selectall label{display:flex;align-items:center;gap:8px}
.selectall input{width:16px;height:16px;accent-color:var(--hc-primary)}
.footer{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-top:1px solid var(--hc-border)}
.note.update{display:flex;align-items:center;justify-content:space-between;gap:10px}
.note.update .btn{flex:none;color:inherit;border-color:currentColor}
[aria-live]:empty{display:none}
`;
