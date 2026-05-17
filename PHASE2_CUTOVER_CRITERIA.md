# Phase 2 Cutover Criteria — Balanced Approach

**Goal**: Safely switch from `__syncBookmarksLegacy` to `__syncBookmarksRefactored` for production traffic using the `USE_REFACTORED_SYNC` feature flag.

**Approach**: Balanced (not Conservative, not Pragmatic)

---

## 1. What Has Been Validated (as of April 2026)

### 1.1 Hand-Written Multi-Harness Resume Differential Tests (Primary Confidence Source)

These tests use two independent `SyncTestHarness` instances and the `run*Step` + `resetXState` + `activate` pattern. They are the most trustworthy because they isolate state properly.

| Test | Key Invariants Validated | Status |
|------|---------------------------|--------|
| `basic partial + resume (new + existing items across steps)` | Correct `thisRunCreated` tracking, resumeToken generation, classification of items created in previous partial sync | ✓ Pass |
| `hidden bookmarks across resume boundary` | Hidden items are never turned into new bookmarks even when they appear on a resume step | ✓ Pass |
| `rate limit on the resume step itself` | Correct behavior when rate limited on continuation pages (multiple resumeTokens) | ✓ Pass |
| `folder items on the resume step` | Folder mirroring + collection syncing works correctly when triggered during a resume flow | ✓ Pass |

### 1.2 Property-Based Testing

- **Simple PBT**: 500 randomized runs — legacy and refactored produce equivalent results for basic scenarios.
- **Resume Flow PBT**: 15 randomized runs exercising resume token flows with varying combinations of new/existing/hidden items (increased from 5 after harness stabilization).

### 1.3 Harness Quality

- The `SyncTestHarness` was significantly hardened during this phase:
  - `activate()` / `resetXState()` pattern for reliable multi-step testing
  - Unified `mockImplementation` for X API calls (no more mixing `mockResolvedValueOnce`)
  - Robust folder mocking with ID-based lookup
  - Proper per-harness isolation for Prisma mutations (`createMany`, `updateMany`)

---

## 2. Remaining Risks & Gaps

### 2.1 Known Limitations (Accepted for Balanced Cutover)

| Area | Current State | Risk Level | Mitigation |
|------|---------------|------------|----------|
| Single-harness `compare(scenario)` tests | Several tests fail for refactored path when `initialExisting`/`initialHidden` are used | Medium | De-prioritized. Multi-harness tests cover the critical resume paths. |
| Folder + hidden + resume combinations | Only tested separately, not in one complex scenario | Low–Medium | Can be added later. Core folder-on-resume and hidden-on-resume are covered. |
| Very large bookmark libraries (> 10k–20k) | Not directly tested in harness | Medium | Relies on property-based testing + real canary |
| Collection/folder performance under load | Not measured | Low | Not a correctness risk |

### 2.2 Areas We Have Good Confidence In

- Resume token generation and consumption
- Correct handling of items created earlier in the same sync run (`thisRunCreated`)
- Never recreating hidden bookmarks
- Basic folder mirroring during resume
- Rate limit behavior across resume boundaries

---

## 3. Balanced Cutover Criteria

We will consider the refactored sync ready for a **Balanced** cutover when **all** of the following are true:

### Must-Have (Blocking)

1. **All four core multi-harness resume differential tests pass consistently** (currently true).
2. **Resume Flow PBT runs at least 15 times** without differential failures (currently true).
3. **Simple PBT** (500 runs) continues to pass.
4. **No new critical bugs** found in the refactored path during manual canary on real accounts.
5. **Monitoring** in place for:
   - `newBookmarks`, `updatedBookmarks`, `totalFetched` per sync
   - Rate limit frequency
   - Sync duration
   - Error rate on the refactored path

### Strong Recommendation (Not Blocking for Balanced)

- At least one real small-account canary (few hundred bookmarks)
- At least one real medium-account canary (a few thousand bookmarks)
- Folder-heavy account canary (if available)

---

## 4. Cutover Status (Updated April 2026)

We have entered the **Cutover Phase**.

- The refactored sync engine (`__syncBookmarksRefactored`) is now the **default**.
- The legacy engine can still be forced by setting `USE_REFACTORED_SYNC=false`.
- Real canary testing has been performed on the developer’s main account (408 bookmarks) with successful results.
- All core multi-harness resume differential tests pass.
- Resume Flow PBT is running at 15 runs.

We are treating the current state as a **controlled internal canary** while we continue to monitor behavior.

### Current Recommended Stance

| Environment       | Recommended Setting          | Notes |
|-------------------|------------------------------|-------|
| Local Development | `true` (default)             | Use the refactored engine |
| Production        | `true` (default)             | With easy rollback via env var |
| Emergency Rollback| `USE_REFACTORED_SYNC=false`  | Forces legacy engine |

**Rollback trigger**: Any of the following in production:
- Sudden increase in failed syncs
- Users reporting missing or incorrect bookmarks
- Significant divergence in `newBookmarks` / `updatedBookmarks` vs expected behavior

---

## 5. Current Cutover Phase (April 2026)

We have officially entered the **cleanup / legacy removal phase**:

- The refactored engine (`__syncBookmarksRefactored`) is now the **default**.
- The legacy engine (`__syncBookmarksLegacy`) is kept **only** for emergency rollback.
- Calling the legacy engine now produces loud warnings in both the code and logs.
- The dispatcher has been simplified — the refactored path is taken unless `USE_REFACTORED_SYNC=false` is explicitly set.

---

## 6. Future Cutover Steps (When Ready)

When we have higher confidence (more real-user canaries, higher PBT volume, longer production runtime), we can proceed with:

- Remove the legacy code path entirely (`__syncBookmarksLegacy` and related tests/helpers).
- Remove the `USE_REFACTORED_SYNC` environment variable.
- Update all documentation and deployment scripts.
- Declare **Phase 2 officially complete**.

Current confidence level: **Balanced / Internal Use** (not yet ready for wide public rollout without further real-user canaries).

---

## 7. Exit Criteria for Phase 2 (Full Confidence)

We would only move to a more aggressive cutover (or remove the flag entirely) after:

- Resume PBT at 50+ runs
- Additional combined stress tests (hidden + folder + rate limit in one flow)
- Multiple real-user canaries (small + large libraries)
- At least 2 weeks of production traffic with no correctness issues

---

## 6. Current Recommendation (April 2026)

**We are close to Balanced cutover readiness.**

**Recommended next actions before starting Phase 1 canary:**

1. Run the full differential + PBT suite one more time (clean).
2. Perform a manual canary on 1–2 real accounts (ideally one folder-heavy).
3. Confirm monitoring dashboards for SyncRun metrics are ready.

Once the above are done, we can confidently begin a controlled rollout using the `USE_REFACTORED_SYNC` flag.

---

**Document Owner**: Engineering (sync team)  
**Last Updated**: April 2026  
**Status**: Draft — ready for review and iteration as more data comes in.