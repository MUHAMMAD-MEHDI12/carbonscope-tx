"""
Capture real FortyGuard heatmaps for Dallas, Austin and San Antonio
(same recipe as the team's Houston capture: filter_type=3, granularity 100 m).

USAGE (from the repo root, needs `pip install requests`):
    python scripts/capture_metros.py --key YOUR_FORTYGUARD_API_KEY
    python scripts/capture_metros.py --key ... --metros dallas austin
    python scripts/capture_metros.py --key ... --date 2024-07-15
    python scripts/capture_metros.py --key ... --check-credits   # balance only, spends nothing

Then compact for the dashboard:
    node scripts/compact_tiles.mjs

Notes
-----
- Each metro is ONE /v1/heatmap call over a ~100 km² core AOI (~10,500 tiles),
  matching the Houston capture so results are comparable.
- Credits are charged only when a job completes. Check your balance first with
  --check-credits. If a call fails or times out, it costs nothing.
- Responses are cached to data/<metro>_day_<date>.json — never re-spend credits
  on a capture you already have (the script skips existing files).
- Hackathon submissions must list every API key used (organizer requirement).
"""
import argparse
import json
import pathlib
import sys
import time

import requests

BASE = "https://api.fortyguard.com"
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# ~0.14° x 0.07° (~100 km²) core AOIs, sized to match the Houston capture
AOIS = {
    "dallas": [-96.88, 32.72, -96.74, 32.79],       # Downtown / Uptown / Design District
    "austin": [-97.80, 30.22, -97.66, 30.29],       # Downtown / East Austin / SoCo
    "sanantonio": [-98.56, 29.37, -98.42, 29.44],   # Downtown / River Walk / Kelly
}


def polygon(bbox):
    w, s, e, n = bbox
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature", "properties": {},
            "geometry": {"type": "Polygon", "coordinates": [[
                [w, s], [e, s], [e, n], [w, n], [w, s],
            ]]},
        }],
    }


def check_credits(session):
    r = session.post(f"{BASE}/v1/system/fetch-api-key-usage",
                     json={"api_key": session.headers["api-key"]}, timeout=60)
    r.raise_for_status()
    body = r.json()
    print("Credit usage response:")
    print(json.dumps(body, indent=2)[:1500])


def capture(session, metro, date, granularity, timeout_s=900):
    out = DATA / f"{metro}_day_{date}.json"
    if out.exists():
        print(f"  {metro}: {out.name} already exists — skipping (no credits spent)")
        return
    payload = {
        "polygon_aoi": polygon(AOIS[metro]),
        "date_time": {"start_date": date, "filter_type": 3},
        "granularity": granularity,
    }
    print(f"  {metro}: submitting /v1/heatmap  (filter_type=3, {granularity} m)")
    r = session.post(f"{BASE}/v1/heatmap", json=payload, timeout=60)
    if r.status_code == 402:
        print("  !! 402 — out of credits:", r.text[:300])
        sys.exit(1)
    r.raise_for_status()
    body = r.json()
    if body.get("error"):
        raise RuntimeError(body.get("message", body))
    activity_id = body["data"]["activity_id"]
    print(f"    activity_id={activity_id} — polling…")

    deadline = time.monotonic() + timeout_s
    while True:
        s = session.get(f"{BASE}/v1/status/{activity_id}", timeout=60)
        if s.status_code == 404:            # not visible yet, keep polling
            time.sleep(4)
            continue
        s.raise_for_status()
        data = s.json().get("data", {})
        status = str(data.get("status", "")).lower()
        print(f"    status: {status}")
        if status in ("succeeded", "completed"):
            result = data.get("result", data)
            DATA.mkdir(exist_ok=True)
            json.dump({"activity_id": activity_id, "result": result}, open(out, "w"))
            n = len(result.get("map_data", {}).get("features", []))
            print(f"    saved {out.name} ({n} tiles)")
            return
        if status in ("failed", "error"):
            raise RuntimeError(f"activity {activity_id} failed (no credits charged)")
        if time.monotonic() > deadline:
            raise TimeoutError(f"activity {activity_id} still '{status}' after {timeout_s}s")
        time.sleep(5)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True, help="FortyGuard hackathon API key")
    ap.add_argument("--metros", nargs="+", default=["dallas", "austin", "sanantonio"],
                    choices=list(AOIS))
    ap.add_argument("--date", default="2024-07-15",
                    help="study date YYYY-MM-DD (2021-01-01 → today); default matches Houston")
    ap.add_argument("--granularity", type=int, default=100, choices=[60, 80, 100])
    ap.add_argument("--check-credits", action="store_true",
                    help="print credit balance and exit (spends nothing)")
    a = ap.parse_args()

    sess = requests.Session()
    sess.headers.update({"api-key": a.key, "Content-Type": "application/json"})

    check_credits(sess)
    if a.check_credits:
        sys.exit(0)

    print(f"\nCapturing {a.metros} for {a.date} — one heatmap call each…")
    for m in a.metros:
        capture(sess, m, a.date, a.granularity)
    print("\nDone. Next: node scripts/compact_tiles.mjs  → then commit & sync.")
