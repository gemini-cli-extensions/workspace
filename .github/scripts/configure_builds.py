"""Initialize a freshly created template repository on Cloudflare.

Optional environment variables:
- CLOUDFLARE_BUILD_TRIGGER_NAME: overrides the default production trigger name.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SKIP_DIRS = {".git", ".astro", "dist", "node_modules", ".wrangler", ".cache"}
TEXT_EXTENSIONS = {
    ".astro",
    ".css",
    ".js",
    ".json",
    ".jsonc",
    ".md",
    ".mjs",
    ".ts",
    ".tsx",
    ".toml",
    ".txt",
    ".yaml",
    ".yml",
}
SPECIAL_TEXT_FILES = {"AGENTS.md", "LICENSE"}
DEFAULT_TRIGGER_NAME = "Deploy production"


def read_jsonc(path: Path) -> dict[str, object]:
    content = strip_jsonc_comments(path.read_text(encoding="utf-8"))
    content = re.sub(r",(\s*[}\]])", r"\1", content)
    return json.loads(content)


def strip_jsonc_comments(content: str) -> str:
    result: list[str] = []
    index = 0
    in_string = False
    escaped = False

    while index < len(content):
        char = content[index]
        next_char = content[index + 1] if index + 1 < len(content) else ""

        if in_string:
            result.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue

        if char == '"':
            in_string = True
            result.append(char)
            index += 1
            continue

        if char == "/" and next_char == "/":
            index += 2
            while index < len(content) and content[index] not in "\r\n":
                index += 1
            continue

        if char == "/" and next_char == "*":
            index += 2
            while index + 1 < len(content) and not (
                content[index] == "*" and content[index + 1] == "/"
            ):
                index += 1
            index += 2
            continue

        result.append(char)
        index += 1

    return "".join(result)


def normalize_package_lock_name(name: str) -> str:
    if name.startswith("@") and "/" in name:
        return name.split("/", 1)[1]
    return name


def write_jsonc(path: Path, data: dict[str, object]) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def run_git(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def detect_template_name() -> str:
    candidates: list[str] = []
    package_json = ROOT / "package.json"
    wrangler_jsonc = ROOT / "wrangler.jsonc"
    package_lock = ROOT / "package-lock.json"

    if package_json.exists():
        try:
            name = json.loads(package_json.read_text(encoding="utf-8")).get("name")
            if isinstance(name, str):
                candidates.append(name)
        except json.JSONDecodeError:
            pass

    if wrangler_jsonc.exists():
        try:
            name = read_jsonc(wrangler_jsonc).get("name")
            if isinstance(name, str):
                candidates.append(name)
        except Exception:
            pass

    if package_lock.exists():
        try:
            name = json.loads(package_lock.read_text(encoding="utf-8")).get("name")
            if isinstance(name, str):
                candidates.append(normalize_package_lock_name(name))
        except json.JSONDecodeError:
            pass

    return candidates[0] if candidates else ROOT.name


def iter_text_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.is_file() and (path.suffix.lower() in TEXT_EXTENSIONS or path.name in SPECIAL_TEXT_FILES):
            files.append(path)
    return files


def replace_repository_identity(template_name: str, target_name: str) -> None:
    if template_name == target_name:
        return

    for path in iter_text_files():
        content = path.read_text(encoding="utf-8")
        if template_name not in content:
            continue
        path.write_text(content.replace(template_name, target_name), encoding="utf-8")


def cloudflare_request(
    token: str,
    method: str,
    url: str,
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    headers = {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    }
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def create_d1_database(account_id: str, token: str, repo_name: str) -> str:
    response = cloudflare_request(
        token,
        "POST",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database",
        {"name": repo_name},
    )
    result = response.get("result", {})
    database_id = result.get("id")
    if not isinstance(database_id, str) or not database_id:
        database_id = result.get("database_id")
    if not isinstance(database_id, str) or not database_id:
        raise RuntimeError("Cloudflare D1 creation did not return a database id.")
    return database_id


def create_kv_namespace(account_id: str, token: str, repo_name: str) -> str:
    response = cloudflare_request(
        token,
        "POST",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces",
        {"title": f"{repo_name}-session"},
    )
    result = response.get("result", {})
    namespace_id = result.get("id")
    if not isinstance(namespace_id, str) or not namespace_id:
        raise RuntimeError("Cloudflare KV creation did not return a namespace id.")
    return namespace_id


def update_wrangler_config(repo_name: str, database_id: str, kv_id: str) -> None:
    path = ROOT / "wrangler.jsonc"
    config = read_jsonc(path)
    config["name"] = repo_name
    update_d1_binding(config, repo_name, database_id)
    update_kv_binding(config, kv_id)
    write_jsonc(path, config)


def update_d1_binding(config: dict[str, object], repo_name: str, database_id: str) -> None:
    d1_databases = config.setdefault("d1_databases", [])
    if not isinstance(d1_databases, list) or not d1_databases:
        return

    binding = d1_databases[0]
    if not isinstance(binding, dict):
        return

    binding["database_name"] = repo_name
    binding["database_id"] = database_id
    binding["preview_database_id"] = database_id


def update_kv_binding(config: dict[str, object], kv_id: str) -> None:
    config["kv_namespaces"] = [
        {
            "binding": "SESSION",
            "id": kv_id,
            "preview_id": kv_id,
        }
    ]


def github_request(token: str, url: str) -> dict[str, object]:
    headers = {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
    }
    request = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def register_workers_builds(account_id: str, cf_token: str, github_repository: str, github_token: str, worker_name: str) -> None:
    repo_owner, repo_name = github_repository.split("/", 1)
    repo_data = github_request(github_token, f"https://api.github.com/repos/{repo_owner}/{repo_name}")
    owner_data = github_request(github_token, f"https://api.github.com/users/{repo_owner}")

    connection_payload = {
        "provider_type": "github",
        "provider_account_id": owner_data["id"],
        "provider_account_name": owner_data["login"],
        "repo_id": repo_data["id"],
        "repo_name": repo_data["name"],
    }
    connection_response = cloudflare_request(
        cf_token,
        "PUT",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/builds/repos/connections",
        connection_payload,
    )
    repo_connection_uuid = connection_response.get("result", {}).get("repo_connection_uuid")
    if not isinstance(repo_connection_uuid, str) or not repo_connection_uuid:
        raise RuntimeError("Cloudflare Builds connection did not return a repo connection UUID.")

    worker_scripts = cloudflare_request(
        cf_token,
        "GET",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts",
    ).get("result", [])
    worker_tag = None
    for script in worker_scripts:
        if isinstance(script, dict) and script.get("id") == worker_name:
            tag = script.get("tag")
            if isinstance(tag, str):
                worker_tag = tag
                break

    if not worker_tag:
        raise RuntimeError(f"Could not find a Cloudflare Worker tag for '{worker_name}'.")

    build_tokens = cloudflare_request(
        cf_token,
        "GET",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/builds/tokens",
    ).get("result", [])
    selected_build_token_uuid = None
    for token in build_tokens:
        if isinstance(token, dict):
            uuid = token.get("build_token_uuid")
            if isinstance(uuid, str):
                selected_build_token_uuid = uuid
                break

    if not selected_build_token_uuid:
        raise RuntimeError("Cloudflare Builds did not return a build token UUID.")

    trigger_payload = {
        "external_script_id": worker_tag,
        "repo_connection_uuid": repo_connection_uuid,
        "build_token_uuid": selected_build_token_uuid,
        "trigger_name": os.environ.get("CLOUDFLARE_BUILD_TRIGGER_NAME", DEFAULT_TRIGGER_NAME),
        "build_command": "pnpm run build",
        "deploy_command": "npx wrangler deploy",
        "root_directory": "/",
        "branch_includes": ["main"],
        "branch_excludes": [],
        "path_includes": ["*"],
        "path_excludes": [],
    }
    cloudflare_request(
        cf_token,
        "POST",
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}/builds/triggers",
        trigger_payload,
    )


def main() -> None:
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    cf_token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    github_repository = os.environ.get("GITHUB_REPOSITORY", "")
    github_token = os.environ.get("GITHUB_TOKEN", "")

    if not account_id or not cf_token or not github_repository:
        raise SystemExit("Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, or GITHUB_REPOSITORY.")

    target_name = github_repository.rsplit("/", 1)[-1]
    template_name = detect_template_name()
    if template_name == target_name:
        print("Template repository detected; skipping autoconfiguration.")
        return
    replace_repository_identity(template_name, target_name)

    database_id = create_d1_database(account_id, cf_token, target_name)
    kv_id = create_kv_namespace(account_id, cf_token, target_name)
    update_wrangler_config(target_name, database_id, kv_id)

    if github_token:
        worker_name = target_name
        try:
            wrangler_name = read_jsonc(ROOT / "wrangler.jsonc").get("name")
            if isinstance(wrangler_name, str):
                worker_name = wrangler_name
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            pass
        if isinstance(worker_name, str):
            register_workers_builds(account_id, cf_token, github_repository, github_token, worker_name)


if __name__ == "__main__":
    main()
