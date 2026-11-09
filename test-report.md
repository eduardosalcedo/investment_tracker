# Test report

Environment: Node v24 on macOS, local server at http://localhost:3000, fictional users `a@example.com` (A) and `b@example.com` (B). Screenshots: add `evidence-two-user.png` and `evidence-persistence.png` to the submission (no passwords, cookies or tokens visible).

| # | Check | Result | Observed |
|---|-------|--------|----------|
| 1 | Register A and B; duplicate email; invalid password; incorrect login | Pass | Register returned 201 `{id,email}` and did not log in. Duplicate email returned 409. A 5-character password returned 400. A wrong password and an unknown email both returned the same generic 401 `Invalid email or password`. |
| 2 | Logged out requests; missing or wrong CSRF token | Pass | Logged-out GET and POST of purchases returned 401 `Login required`. Login with no token, and a POST with a missing or wrong token, returned 403 `CSRF token rejected`. The stored list stayed unchanged. |
| 3 | As A add Example Index Fund (5 x $20.00, Fund) and Example Company (3 x $15.50, Stock) | Pass | Both returned 201 with full records (`costCents` 10000 and 4650). The list had 2 records and the total was $146.50. Client-supplied `ownerId`, `costCents` and `id` were ignored. |
| 4 | Reload, then restart the server and log in again | Pass | After a reload and after a server restart, both records and $146.50 were still shown once logged in again (stored in SQLite). Evidence: `evidence-persistence.png`. |
| 5 | Edit the company purchase to quantity 4; delete the fund purchase | Pass | PUT returned 200 and the total became $162.00. DELETE returned 200 `{"ok":true}`. One record remained and the total was $62.00. |
| 6 | As B: no A records; direct PUT/DELETE of A's purchase; A's ID in a body | Pass | B's list was empty. B's PUT and DELETE for A's purchase returned 404 and A's record was unchanged. A POST by B with `ownerId` set to A's ID created a record owned by B only. Evidence: `evidence-two-user.png`. |
| 7 | Invalid input: blank name; quantity 1.5, 0, 10001, "5", true, null; priceCents 0, 1.5, 100000001, "100"; unknown category | Pass | Every invalid POST returned 400 with `{"error":...}` and the record count did not change. A PUT with quantity 0 returned 400. A route ID of `abc` or `0` returned 400; ID 99999 returned 404. |
| 8 | Literal name `<b>Example</b>`; repeated name | Pass | The name displayed as literal text with no bold element created. A repeated name created a separate record. |
| 9 | Stop the server and attempt a save | Pass | The page showed "Cannot reach the server. Your inputs were kept. If the change may have been saved, check the list before trying again." Inputs were preserved and the submit button was restored. A connection loss after a server commit can leave an uncertain result, so inspect the list before retrying; exactly-once behavior is not promised. |
| 10 | Malformed JSON; unknown API route; secrets and excluded folders | Pass | Malformed JSON returned 400 `{"error":"Invalid JSON"}`. `GET /api/nothing` returned 404 `{"error":"API route not found"}`. `.env`, `node_modules`, `.git` and database files are ignored by Git and left out of the ZIP. |

Unit tests: `npm test` runs 7 validation tests and all pass.
