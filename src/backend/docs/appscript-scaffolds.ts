/**
 * @file docs/appscript-scaffolds.ts
 * @description Built-in Apps Script "rolls" — ready-to-use container-bound
 * script templates (Apps Script files arrays) an agent can drop into a project
 * so it starts from something working. The chat sidebar calls back into this
 * worker's /api/appscript/ai bridge.
 *
 * Config the deployed script needs (Script Properties): WORKER_URL, WORKER_KEY.
 */

export interface ScriptFile {
  name: string;
  type: "SERVER_JS" | "HTML" | "JSON";
  source: string;
}

const MANIFEST: ScriptFile = {
  name: "appsscript",
  type: "JSON",
  source: JSON.stringify(
    {
      timeZone: "America/Los_Angeles",
      exceptionLogging: "STACKDRIVER",
      runtimeVersion: "V8",
      oauthScopes: [
        "https://www.googleapis.com/auth/script.external_request",
        "https://www.googleapis.com/auth/documents.currentonly",
      ],
    },
    null,
    2,
  ),
};

const SIDEBAR_CODE: ScriptFile = {
  name: "Code",
  type: "SERVER_JS",
  source: `function onOpen() {
  DocumentApp.getUi().createMenu('Agent').addItem('Open sidebar', 'showSidebar').addToUi();
}
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Agent');
  DocumentApp.getUi().showSidebar(html);
}`,
};

const SIDEBAR_HTML: ScriptFile = {
  name: "Sidebar",
  type: "HTML",
  source: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:8px">
  <h3>Agent sidebar</h3>
  <p>Wire up your actions here.</p>
</body></html>`,
};

const CHAT_CODE: ScriptFile = {
  name: "Code",
  type: "SERVER_JS",
  source: `function onOpen() {
  DocumentApp.getUi().createMenu('Agent').addItem('Chat', 'showSidebar').addToUi();
}
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('Agent chat');
  DocumentApp.getUi().showSidebar(html);
}
/** Ask the worker agent. Requires Script Properties WORKER_URL + WORKER_KEY. */
function askAgent(prompt) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('WORKER_URL') + '/api/appscript/ai';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-worker-key': props.getProperty('WORKER_KEY') },
    payload: JSON.stringify({ prompt: prompt, docId: DocumentApp.getActiveDocument().getId() }),
    muteHttpExceptions: true,
  });
  return JSON.parse(res.getContentText()).text;
}`,
};

const CHAT_HTML: ScriptFile = {
  name: "Sidebar",
  type: "HTML",
  source: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:8px">
  <div id="log" style="height:300px;overflow:auto;border:1px solid #ccc;padding:6px;margin-bottom:6px"></div>
  <textarea id="q" rows="3" style="width:100%"></textarea>
  <button onclick="send()">Send</button>
  <script>
    function send() {
      var q = document.getElementById('q').value;
      if (!q) return;
      add('You: ' + q);
      document.getElementById('q').value = '';
      google.script.run.withSuccessHandler(function(t){ add('Agent: ' + t); }).askAgent(q);
    }
    function add(t) { var d = document.getElementById('log'); d.innerHTML += '<p>' + t + '</p>'; d.scrollTop = d.scrollHeight; }
  </script>
</body></html>`,
};

export const SCRIPT_SCAFFOLDS: Record<string, ScriptFile[]> = {
  sidebar: [MANIFEST, SIDEBAR_CODE, SIDEBAR_HTML],
  "chat-sidebar": [MANIFEST, CHAT_CODE, CHAT_HTML],
};
