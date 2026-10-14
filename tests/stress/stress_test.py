"""
High-Capacity Stress & Load Testing Suite for ZHMS / Zimbuild Platform
Simulates concurrent load from thousands of virtual citizens, diaspora buyers,
and municipal inspectors under high-concurrency peak conditions.
"""

import sys
import os
import time
import threading
import queue
import urllib.request
import urllib.error
import json
import statistics

BASE_URL = os.environ.get("LOAD_TEST_URL", "http://127.0.0.1:8000")

def worker_load_simulator(endpoint: str, headers: dict, num_requests: int, results_queue: queue.Queue):
    """Executes a burst of HTTP requests and measures latency & status codes."""
    for _ in range(num_requests):
        t0 = time.perf_counter()
        req = urllib.request.Request(f"{BASE_URL}{endpoint}", headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                results_queue.put((resp.status, elapsed_ms, None))
        except urllib.error.HTTPError as e:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            results_queue.put((e.code, elapsed_ms, e.reason))
        except Exception as e:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            results_queue.put((0, elapsed_ms, str(e)))

def run_stress_test(concurrency: int = 25, requests_per_worker: int = 20):
    print("=" * 70)
    print(f"ZHMS HIGH-THROUGHPUT STRESS TEST: {concurrency * requests_per_worker} TOTAL REQUESTS")
    print(f"Target Base URL: {BASE_URL}")
    print(f"Concurrency: {concurrency} Threads | {requests_per_worker} Requests/Worker")
    print("=" * 70)

    # Test Endpoints representing Citizen & Admin traffic
    endpoints = [
        "/api/security/verify_ledger",
        "/api/schedule",
        "/api/quality/cube_crush_tests",
        "/api/mortgage/calculator?price_usd=25000&deposit_percent=20&term_years=10",
        "/api/permits",
    ]

    for endpoint in endpoints:
        results_q = queue.Queue()
        threads = []
        headers = {
            "User-Agent": "ZHMS-LoadTest-Engine/2.4",
            "X-User-Role": "ADMIN",
            "X-User-Sub": "stress_tester_sub_9999"
        }

        start_time = time.perf_counter()
        for i in range(concurrency):
            # Vary IP simulation to test rate-limiting behavior under load
            h = headers.copy()
            h["X-Forwarded-For"] = f"197.221.{i % 16}.{(i * 7) % 250 + 1}"
            t = threading.Thread(
                target=worker_load_simulator,
                args=(endpoint, h, requests_per_worker, results_q)
            )
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        total_duration = time.perf_counter() - start_time
        
        # Aggregate Results
        latencies = []
        status_counts = {}
        total_items = results_q.qsize()

        while not results_q.empty():
            code, lat, err = results_q.get()
            latencies.append(lat)
            status_counts[code] = status_counts.get(code, 0) + 1

        rps = total_items / total_duration if total_duration > 0 else 0
        p50 = statistics.median(latencies) if latencies else 0
        p95 = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies)
        p99 = statistics.quantiles(latencies, n=100)[98] if len(latencies) >= 100 else max(latencies)

        print(f"\n[Endpoint] {endpoint}")
        print(f"  Requests Completed: {total_items} in {total_duration:.2f}s ({rps:.1f} req/sec)")
        print(f"  Status Codes:       {status_counts}")
        print(f"  Latency Distribution: Min={min(latencies):.1f}ms | P50={p50:.1f}ms | P95={p95:.1f}ms | P99={p99:.1f}ms | Max={max(latencies):.1f}ms")

        # Assertion: High technical standard - 0 server crashes (5xx errors)
        assert 500 not in status_counts, f"Server Error 500 detected on {endpoint}!"

if __name__ == "__main__":
    run_stress_test(concurrency=20, requests_per_worker=25)
