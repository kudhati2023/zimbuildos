"""
The tamper-evident audit chain must stay a single chain when the threaded server logs events from
concurrent requests. A fork (two blocks claiming the same predecessor) makes verify_audit_log_integrity()
report tampering that never happened, which would hide real tampering in the noise.
"""
import importlib
import threading
import time

# src.security re-exports an object called security_guard, which hides the module of the same name.
sg = importlib.import_module("src.security.security_guard")


def test_concurrent_events_never_fork_the_chain(monkeypatch):
    guard = sg.SecurityGuard()
    guard.audit_log_path = None  # keep this test off the shared log file

    # Widen the window between reading the chain head and appending (the block hash is computed in
    # between), as a busy server would. Without serialisation this reliably forks the chain.
    real_hashlib = sg.hashlib

    class SlowHashlib:
        @staticmethod
        def sha256(data=b""):
            time.sleep(0.001)
            return real_hashlib.sha256(data)

    monkeypatch.setattr(sg, "hashlib", SlowHashlib)

    threads, per_thread = 12, 25
    barrier = threading.Barrier(threads)

    def worker(n):
        barrier.wait()
        for k in range(per_thread):
            guard.log_security_event("ceo", "CONCURRENCY_TEST", f"thread {n} event {k}")

    workers = [threading.Thread(target=worker, args=(i,)) for i in range(threads)]
    for w in workers:
        w.start()
    for w in workers:
        w.join()

    result = guard.verify_audit_log_integrity()
    indices = [b["index"] for b in guard.audit_log]
    assert len(guard.audit_log) == 1 + threads * per_thread
    assert len(indices) == len(set(indices)), "two blocks share an index: the chain forked"
    assert result["valid"], f"false tamper alarm at blocks {result['tampered_indices'][:10]}"
