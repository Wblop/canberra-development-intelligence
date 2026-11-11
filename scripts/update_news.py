#!/usr/bin/env python3
"""Refresh a small, link-only development news digest for a static GitHub Pages site.

Sources: public publisher RSS feeds, official ACT Government RSS and Google News RSS.
No scraping of article text, API keys, tracking or external JavaScript dependencies.
"""
from __future__ import annotations

import datetime as dt
import email.utils
import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "news.json"
UTC = dt.timezone.utc
NOW = dt.datetime.now(UTC)
UA = "CanberraDevelopmentIntelligenceNewsReader/1.0 (+https://www.canberradevelopmentintel.com)"
MAX_AGE_DAYS = 45
FETCH_TIMEOUT = 16

# Targeted RSS queries avoid redistributing the publishers' article bodies.
def google_feed(q: str) -> str:
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode(
        {"q": q, "hl": "en-AU", "gl": "AU", "ceid": "AU:en"}
    )

FEEDS = [
    ("ACT Government / Our Canberra", "https://www.act.gov.au/our-canberra/rss", "Canberra"),
    ("Region Canberra", "https://region.com.au/feed/", "Canberra"),
    ("The Canberra Times", "https://www.canberratimes.com.au/rss.xml", "Canberra"),
    ("Canberra planning", google_feed('Canberra ("planning approval" OR rezoning OR "development application" OR "housing supply") when:30d'), "Canberra"),
    ("ACT land and development", google_feed('("ACT Government" OR Canberra) ("land release" OR "new suburb" OR "urban renewal" OR "precinct") when:30d'), "Canberra"),
    ("National property development", google_feed('Australia ("property development" OR "residential development" OR "rezoning" OR "housing approvals") when:30d'), "Australia"),
    ("National major precincts", google_feed('("Sydney" OR "Melbourne" OR "Brisbane" OR "Perth" OR "Adelaide") ("housing development" OR "urban renewal" OR "development approval" OR precinct) when:30d'), "Australia"),
    ("National industry updates", google_feed('site:propertycouncil.com.au ("housing" OR "approvals" OR "planning" OR "development") when:30d'), "Australia"),
]
KEYWORDS = re.compile(
    r"\b(?:housing|homes|dwelling|apartment|townhouse|residential|development|developer|"
    r"property|planning|rezon(?:e|ing)|precinct|urban|construction|building|"
    r"infrastructure|land release|suburb|density|station|rail|affordab|"
    r"housing supply|housing approvals|masterplan|master plan)\b", re.I
)
EXCLUDE = re.compile(r"\b(?:software development|game developer|app developer|"
                     r"personal development|web development)\b", re.I)
CANBERRA = re.compile(
    r"\b(?:Canberra|ACT|Australian Capital Territory|Belconnen|Woden|"
    r"Tuggeranong|Gungahlin|Molonglo|Braddon|Kingston|Dickson|"
    r"Fyshwick|Phillip|Civic|Ginninderra|Jerrabomberra)\b", re.I
)
TOPICS = [
    ("Planning & zoning", re.compile(r"approv|planning|rezon|zoning|code amendment|development application|DA\b|height limit", re.I)),
    ("Housing & residential", re.compile(r"housing|homes|apartment|dwelling|residential|townhouse|affordab", re.I)),
    ("Infrastructure", re.compile(r"transport|rail|metro|station|airport|road|bridge|infrastructure|hospital|school", re.I)),
    ("Land & precincts", re.compile(r"land|precinct|urban renew|masterplan|suburb|greenfield|redevelop", re.I))
]

def plain(value: str | None, limit=180) -> str:
    value = html.unescape(re.sub(r"<[^>]*>", " ", value or ""))
    return re.sub(r"\s+", " ", value).strip()[:limit].strip()

def parsed_date(value: str | None):
    if not value:
        return None
    try:
        d = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=UTC)
    return d.astimezone(UTC)

def safe_link(value: str | None):
    if not value:
        return None
    value = html.unescape(value.strip())
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname:
        return None
    if parsed.username or parsed.password or len(value) > 2000:
        return None
    return value

def node_text(element: ET.Element, tag: str):
    child = element.find(tag)
    return (child.text or "").strip() if child is not None else ""

def items_from_feed(xml: bytes, label: str, group: str):
    root = ET.fromstring(xml)
    items = root.findall(".//item")
    results = []
    for item in items:
        title = plain(node_text(item, "title"), 170)
        url = safe_link(node_text(item, "link"))
        publisher = plain(node_text(item, "source"), 70) or label
        if not title or not url:
            continue
        if label in ("ACT Government / Our Canberra", "Region Canberra", "The Canberra Times"):
            publisher = label
        if title.endswith(" - " + publisher):
            title = title[:-(len(publisher)+3)].strip()
        if len(title) < 18 or EXCLUDE.search(title) or not KEYWORDS.search(title):
            continue
        published = parsed_date(node_text(item, "pubDate"))
        if not published or published > NOW + dt.timedelta(days=1):
            continue
        if (NOW - published).days > MAX_AGE_DAYS:
            continue
        scope = "Canberra" if group == "Canberra" or CANBERRA.search(title) else "Australia"
        if group == "Canberra" and publisher not in (
            "ACT Government / Our Canberra", "Region Canberra", "The Canberra Times"
        ):
            # Targeted Canberra searches may contain Australian national results; require a location.
            if not CANBERRA.search(title):
                continue
        topic = next((name for name, pattern in TOPICS if pattern.search(title)), "Development")
        results.append({
            "title": title, "source": publisher, "url": url,
            "published_at": published.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "region": scope, "topic": topic
        })
    return results

def retrieve(url: str):
    request = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "application/rss+xml,application/xml,text/xml;q=0.9"
    })
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT) as response:
        # Bound RSS memory use; a few hundred KB would be sufficient for each feed.
        payload = response.read(1800000)
        if len(payload) >= 1800000:
            raise ValueError("RSS feed response exceeded size limit")
        return payload

def dedupe(entries):
    seen = set()
    clean = []
    for item in sorted(entries, key=lambda a: a["published_at"], reverse=True):
        canonical = re.sub(r"[^a-z0-9]", "", item["title"].lower())
        if canonical in seen:
            continue
        seen.add(canonical)
        clean.append(item)
    return clean

def main():
    collected, diagnostics = [], []
    for label, url, region in FEEDS:
        try:
            articles = items_from_feed(retrieve(url), label, region)
            collected.extend(articles)
            diagnostics.append({"feed": label, "items": len(articles), "ok": True})
            print(f"{label}: {len(articles)} matching items")
        except Exception as error:
            diagnostics.append({"feed": label, "items": 0, "ok": False})
            print(f"{label}: error ({type(error).__name__}) {error}")

    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass

    merged = collected + (previous.get("articles") or [])
    fresh = dedupe(merged)
    cutoff = (NOW - dt.timedelta(days=MAX_AGE_DAYS)).isoformat()
    fresh = [x for x in fresh if x.get("published_at", "") >= cutoff
             and all(k in x for k in ("title", "url", "source", "region", "topic"))]
    # Preserve a mix of national and Canberra coverage.
    regional = [x for x in fresh if x["region"] == "Canberra"][:32]
    national = [x for x in fresh if x["region"] != "Canberra"][:32]
    result = sorted(regional + national, key=lambda x: x["published_at"], reverse=True)
    if not result and previous.get("articles"):
        # Keep last working snapshot rather than deleting the entire site feed.
        print("No new items; retaining existing snapshot")
        return
    if not result:
        raise RuntimeError("No usable RSS articles; not replacing published news with empty feed.")
    output = {
        "updated_at": NOW.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "refresh_method": "GitHub Actions; publisher and Google News RSS",
        "note": "Headlines from external publishers; linked sources are responsible for accuracy. Not independently fact-checked.",
        "feeds_ok": sum(x["ok"] for x in diagnostics),
        "feeds_checked": len(FEEDS),
        "articles": result
    }
    # Retain publication dates, no unlicensed full article content.
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(result)} linked headlines, including {len(regional)} ACT items.")

if __name__ == "__main__":
    main()
