from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve_env(key: str) -> str | None:
    if os.environ.get(key):
        return os.environ[key]
    for candidate in (ROOT / ".env", ROOT / ".env.local"):
        data = load_env_file(candidate)
        if key in data:
            return data[key]
    return None


def chunked(values: list[Any], size: int) -> list[list[Any]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


@dataclass
class SupabaseRest:
    base_url: str
    service_role_key: str

    @property
    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": "application/json",
        }

    def request(
        self,
        method: str,
        table: str,
        *,
        query: dict[str, str] | None = None,
        body: Any | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> Any:
        encoded_query = urllib.parse.urlencode(query or {})
        url = f"{self.base_url}/rest/v1/{table}"
        if encoded_query:
            url = f"{url}?{encoded_query}"

        headers = dict(self.headers)
        if extra_headers:
            headers.update(extra_headers)

        payload = None
        if body is not None:
            payload = json.dumps(body).encode("utf-8")

        request = urllib.request.Request(url, data=payload, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request) as response:
                raw = response.read().decode("utf-8")
                if not raw:
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {url} failed: {exc.code} {detail}") from exc


def normalize_phone(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    if digits:
        return f"+{digits}"
    return ""


def read_user_agents(path: Path, fallback_tag: str) -> list[dict[str, str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("userAgents", [])
    if not isinstance(data, list):
        raise RuntimeError("JSON must be an array, or an object with a userAgents array.")

    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        phone = normalize_phone(item.get("phone"))
        agent = str(
            item.get("agent")
            or item.get("tag")
            or item.get("name")
            or fallback_tag
        ).strip()
        if not phone or not agent:
            continue
        key = (phone, agent.casefold())
        if key in seen:
            continue
        seen.add(key)
        rows.append({"phone": phone, "agent": agent})
    return rows


def get_or_create_tag(api: SupabaseRest, user_id: str, name: str, color: str) -> str:
    existing = api.request(
        "GET",
        "tags",
        query={
            "select": "id",
            "user_id": f"eq.{user_id}",
            "name": f"eq.{name}",
            "limit": "1",
        },
    )
    if existing:
        return existing[0]["id"]

    created = api.request(
        "POST",
        "tags",
        query={"select": "id"},
        body={"user_id": user_id, "name": name, "color": color},
        extra_headers={"Prefer": "return=representation"},
    )
    return created[0]["id"]


def fetch_contacts_by_phones(
    api: SupabaseRest, user_id: str, phones: list[str]
) -> dict[str, dict[str, Any]]:
    contacts: dict[str, dict[str, Any]] = {}
    for phone_chunk in chunked(phones, 200):
        rows = api.request(
            "GET",
            "contacts",
            query={
                "select": "id,phone,name",
                "user_id": f"eq.{user_id}",
                "phone": f"in.({','.join(phone_chunk)})",
            },
        )
        for row in rows or []:
            contacts[row["phone"]] = row
    return contacts


def existing_contact_tag_pairs(
    api: SupabaseRest, contact_ids: list[str], tag_ids: list[str]
) -> set[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    if not contact_ids or not tag_ids:
        return pairs
    tag_values = ",".join(tag_ids)
    for contact_chunk in chunked(contact_ids, 200):
        rows = api.request(
            "GET",
            "contact_tags",
            query={
                "select": "contact_id,tag_id",
                "contact_id": f"in.({','.join(contact_chunk)})",
                "tag_id": f"in.({tag_values})",
            },
        )
        pairs.update((row["contact_id"], row["tag_id"]) for row in rows or [])
    return pairs


def insert_contact_tags(api: SupabaseRest, rows: list[dict[str, str]]) -> None:
    for row_chunk in chunked(rows, 500):
        api.request(
            "POST",
            "contact_tags",
            body=row_chunk,
            extra_headers={"Prefer": "return=minimal"},
        )


def tag_color_for_name(name: str) -> str:
    palette = [
        "#3b82f6",
        "#10b981",
        "#f59e0b",
        "#ef4444",
        "#8b5cf6",
        "#06b6d4",
        "#84cc16",
        "#f97316",
    ]
    return palette[sum(ord(ch) for ch in name) % len(palette)]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Apply agent tags to existing contacts from a JSON phone/agent map."
    )
    parser.add_argument(
        "--json",
        default=str(ROOT / "scripts" / "userAgents.sample.json"),
        help="Path to the JSON file containing {phone, agent} rows.",
    )
    parser.add_argument("--user-id", required=True, help="Target auth.users/profile user_id UUID.")
    parser.add_argument(
        "--tag-name",
        default="agents",
        help="Fallback/common tag name to use when each row does not include an agent field.",
    )
    args = parser.parse_args()

    supabase_url = resolve_env("NEXT_PUBLIC_SUPABASE_URL")
    service_role_key = resolve_env("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment/.env."
        )

    json_path = Path(args.json)
    if not json_path.exists():
        raise RuntimeError(f"JSON file not found: {json_path}")

    rows = read_user_agents(json_path, args.tag_name)
    if not rows:
        raise RuntimeError("No valid {phone, agent} rows found in JSON.")

    api = SupabaseRest(supabase_url.rstrip("/"), service_role_key)
    contacts_by_phone = fetch_contacts_by_phones(
        api, args.user_id, [row["phone"] for row in rows]
    )

    tag_ids_by_agent: dict[str, str] = {}
    for row in rows:
        agent_key = row["agent"].casefold()
        if agent_key not in tag_ids_by_agent:
            tag_ids_by_agent[agent_key] = get_or_create_tag(
                api, args.user_id, row["agent"], tag_color_for_name(row["agent"])
            )

    matched_rows = [row for row in rows if row["phone"] in contacts_by_phone]
    existing_pairs = existing_contact_tag_pairs(
        api,
        [contacts_by_phone[row["phone"]]["id"] for row in matched_rows],
        list(tag_ids_by_agent.values()),
    )

    inserts: list[dict[str, str]] = []
    for row in matched_rows:
        contact_id = contacts_by_phone[row["phone"]]["id"]
        tag_id = tag_ids_by_agent[row["agent"].casefold()]
        if (contact_id, tag_id) in existing_pairs:
            continue
        inserts.append({"contact_id": contact_id, "tag_id": tag_id})

    if inserts:
        insert_contact_tags(api, inserts)

    print(f"Loaded JSON rows: {len(rows)}")
    print(f"Matched phones in contacts DB: {len(matched_rows)}")
    print(f"Missing phones in contacts DB: {len(rows) - len(matched_rows)}")
    print(f"Created/applied agent tags: {len(tag_ids_by_agent)}")
    print(f"Inserted contact_tags rows: {len(inserts)}")


if __name__ == "__main__":
    main()
