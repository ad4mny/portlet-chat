# Portlet Chat

### A minimal, dependency-free web chat UI for OpenAI-compatible model servers

**A small window to your models.**

Portlet Chat is a free and open-source local LLM chat interface built with plain
HTML, CSS, and JavaScript. Connect multiple model servers, refresh to discover
models, and chat in your browser. No npm install, build step, framework, plugins,
Docker requirement, or application backend.

If Open WebUI feels too crowded and you just want a lightweight chat frontend
for model engines you start and stop yourself, Portlet Chat is built for that workflow.

## Who is it for?

- You run models through different engines, such as MLX-LM, llama.cpp, Ollama,
  LM Studio, or vLLM, and want one OpenAI-compatible chat UI.
- You start and stop inference servers on demand instead of keeping everything running.
- You want to save endpoint addresses once and refresh the model picker when servers change.
- You want local chat histories, streaming replies, retries, and basic Markdown without a large platform.
- You want readable source you can modify without installing a toolchain.

Compatibility depends on the endpoints and streaming format your server exposes.
MLX-LM has been tested locally; the other engines above are intended use cases,
not a claim that every version or configuration has been tested.

## Features

- **Multiple saved endpoints:** give each server a name and a stable base URL.
- **Model discovery:** query each server on page load or with Refresh; offline endpoints stay saved.
- **Streaming chat:** read replies as they arrive and stop a request when needed.
- **Chat history:** start a new conversation without losing earlier ones; reopen them through Chats.
- **Retry:** resend failed or stopped requests without duplicating the prompt.
- **Markdown:** headings, emphasis, lists, quotes, code blocks, and safe links.
- **Small interface:** text-width user bubbles, responsive layout, and system light/dark theme.
- **No external dependencies:** no parser packages, CDN assets, analytics, or plugin system.

## Quick start

Clone the repository and start a static file server (or download the source ZIP and serve its extracted directory):

```sh
git clone https://github.com/ad4mny/portlet-chat.git
cd portlet-chat
python3 -m http.server 3000 --bind 127.0.0.1
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.
On macOS, you can open it from a second terminal:

```sh
open http://localhost:3000
```

Python 3 is only used here as a convenient static file server. **The app runs in
your browser.** Any static HTTP server works; there is no Python application,
package installation, or server-side chat processing.

Press **Ctrl+C** in the serving terminal to stop serving the UI. This does not
stop your model servers, and an already-open page can keep working until closed.
Start and stop each model engine with its own commands.

Use a current browser with Fetch, streaming responses, localStorage, and dialog
support. Serving over localhost is recommended over opening `index.html` directly:
`file://` origins can cause API access and storage problems.

## Connect your model servers

1. Start an OpenAI-compatible inference server using its normal command.
2. Open **Endpoints** in Portlet Chat. The initial base URL is prefilled as
   `http://localhost:8080/v1`; change it if your server uses another address or port.
3. Enter a name and an optional API key, then choose **Save endpoint**.
4. Use **Add another endpoint** to connect another engine. **Edit** updates an existing entry.
5. Close Endpoints. Pick a model from the discovered list and send a message.

Include the API prefix in the base URL when required, usually `/v1`. Do not enter
the full `/chat/completions` URL. The app appends `/models` and `/chat/completions` itself.

For example, an MLX-LM server started with a local model might look like:

```sh
mlx_lm.server --model /path/to/your/model --port 8080
```

Save `http://localhost:8080/v1` in Portlet Chat. The model path belongs in your
engine's startup command; the UI discovers model IDs from the running server.

When you stop a server, start another one, or change its model, click **Refresh**
or reload the page. Saved addresses stay in place. The app checks each endpoint
independently with a five-second discovery timeout; it does not scan ports or
start, stop, download, or manage models.

## Everyday usage

| Action | Behavior |
| --- | --- |
| Send | Enter sends; Shift + Enter adds a new line. |
| Stop | Cancels the browser request and retains any partial reply. Whether inference stops depends on the server. |
| Retry | Replaces a failed or stopped reply using the currently selected model. Retrying an older failure creates a separate chat to preserve later turns. |
| New chat | Creates a new conversation and keeps earlier chats. |
| Chats | Opens the saved conversation list; titles come from the first user message. |
| Delete | In Chats, permanently deletes the chosen conversation after confirmation. Deleting the active chat opens another chat, or a fresh one if none remain. |
| Change model | Keeps the current conversation and sends its context to the newly selected endpoint on the next request. |
| Refresh | Queries saved endpoints again. If the previous model disappeared, choose a new one. |

## Storage, privacy, and API keys

Endpoint addresses, chat histories, and each chat's model selection are saved in
**localStorage in your browser**. Use the same browser profile, hostname, and UI
port to see the same data. `localhost:3000` and `127.0.0.1:3000` have separate storage.
Clearing site data removes saved settings and conversations. There is no account,
cloud sync, or chat export in the current version.

The endpoint form remembers the last saved address. Optional API keys are kept
**in memory only** and must be re-entered after reload using Edit.

Requests go directly from your browser to the endpoint you select. With a remote
provider, that provider receives the conversation you send. Portlet Chat has no
telemetry or intermediary service. Stored chats are not encrypted by the app.

## Troubleshooting

### “Failed to fetch” or no models appear

Check that the inference server is running and the base URL points to its API:

```sh
curl http://localhost:8080/v1/models
```

If that works in a terminal but not in the browser, check **CORS**. Configure your
model server to allow the UI's origin, such as `http://localhost:3000`, GET and POST,
and the Content-Type and Authorization headers when used. It must also handle
browser preflight requests where required. CORS configuration varies by engine.
A browser-only app cannot bypass it, and Portlet Chat does not include a proxy.

An HTTPS-hosted UI may also be blocked from calling an HTTP endpoint by browser
mixed-content rules. For local use, serve the UI over localhost as shown above.

### Why does MLX show a repository ID as well as my local model path?

Portlet Chat displays the IDs returned by `/v1/models`. MLX-LM scans Hugging Face's
cache for model metadata and also adds the local path passed with `--model`.
Its metadata check does not verify every weight shard, and the list does not say
which models are currently loaded in memory. A cached `mlx-community/...` entry
and a local path can therefore both appear.

The picker labels these as **server-listed models**, not verified downloads. It
prefers a local path when there is no saved selection. Distinct IDs remain visible:
matching names alone cannot prove they represent the same model. The UI cannot
inspect your filesystem or reliably infer download status from the standard model list.

### My settings or histories disappeared

Return to the same browser profile and origin you used before, including the port.
Private browsing, cleared site data, or unavailable/full browser storage can affect
persistence. Storage failures are reported in the UI.

### A reply failed or stopped halfway

Check the endpoint and selected model, then use **Retry** below the reply. You can
select a different model before retrying. Interrupted requests remain retryable
when the conversation is reopened.

## API compatibility and current limits

A server must provide:

- `GET {baseURL}/models`: JSON containing a `data` array with string model `id` values.
- `POST {baseURL}/chat/completions`: accept `model`, `messages`, and `stream: true`;
  return SSE chunks with `choices[].delta.content`, ending with a finish reason or `[DONE]`.

This is a **text Chat Completions client**, not a complete implementation of every
OpenAI API or provider extension. Attachments, tools, separate reasoning display,
the Responses API, inference-server management, and syntax highlighting are not implemented.

### Markdown support

The local `markdown.js` renderer supports:

- ATX headings (`#` through `######`).
- Bold, italic, and combined bold/italic.
- Flat bulleted and numbered lists, and blockquotes.
- Single-backtick inline code and fenced code blocks using backticks or tildes.
- Inline links with absolute HTTP, HTTPS, or mailto URLs.
- Paragraphs, preserved line breaks, and backslash-escaped punctuation.

Formatting updates while replies stream and when saved chats reopen. Raw HTML
stays literal text; model output is never inserted as HTML. Images are not loaded.

This is a small subset, not a full CommonMark parser. Tables, nested lists,
reference links, link titles, URLs containing parentheses, multi-backtick inline
code, and complex nested emphasis are not fully supported. Unsupported syntax
stays text where possible.

## Develop and contribute

Edit the files and refresh your browser. No compilation or package manager is needed.

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and forms |
| `style.css` | Layout, themes, and Markdown styling |
| `app.js` | Endpoints, model discovery, chats, storage, and streaming |
| `markdown.js` | Dependency-free Markdown rendering |
| `tests/markdown.html` | Browser test runner and formatting sample |
| `tests/markdown-tests.js` | Renderer and streaming-prefix checks |

While serving the project, open
[http://localhost:3000/tests/markdown.html](http://localhost:3000/tests/markdown.html)
to run the Markdown checks. Before submitting changes, also check offline model
discovery, streaming, Stop/Retry, saved chats after reload, and narrow-screen layout.

Bug reports, documentation improvements, and focused contributions are welcome.
For connection problems, include the engine/version, browser, reproduction steps,
and any relevant response format. Remove API keys and private conversation content.
Keep upstream contributions small and dependency-free to preserve the project's purpose.
Your own forks are free to take a different direction.

## License: free and open source

Portlet Chat is **FOSS**, released under the
[Zero-Clause BSD license (0BSD)](LICENSE), an
[OSI-approved open-source license](https://opensource.org/license/0bsd).

You may use, copy, modify, redistribute, and sell the code, including in commercial
or proprietary products. You do not have to publish your modifications, credit
this project, or pay a license fee. Contributions are welcome, not required.
The software is provided without warranty; see the standard license text for details.

This license covers Portlet Chat's code. Models and inference engines retain their
own licenses.
