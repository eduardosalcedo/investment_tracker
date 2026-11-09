# Investment Purchase Tracker PA2

Eduardo Salcedo, UCF ID 5592087
ed673399@ucf.edu

Node version tested: 24.18.0. Repository: https://github.com/eduardosalcedo/investment_tracker (history also in `git-log.txt`).

## Setup
1. Run `npm install`.
2. Copy `.env.example` to `.env` and set a new random `SESSION_SECRET` (at least 32 characters). Never commit or submit `.env`.
3. Run `npm start` and visit http://localhost:3000.
4. Run `npm test` for the validation unit tests.

`schema.sql` runs at startup and creates `tracker.db` with the categories Fund, Stock and Other. Use only fictional data.

## Part 1: Express and the HTTP flow
`GET /api/health` returns `{"ok":true}`. One Add Purchase action:
1. **Browser event:** the form's `submit` event runs `preventDefault()`, validates the inputs, and converts dollars to cents with `Math.round(dollars * 100)`.
2. **JSON request:** `api()` sends `POST /api/purchases` with `JSON.stringify({name, quantity, unitPriceCents, categoryId})`, the session cookie, and an `X-CSRF-Token` header.
3. **Middleware:** `express.json()` parses the body (bad JSON gives 400), the session middleware loads the session, the CSRF middleware checks Origin and token, and `requireAuth` rejects anonymous requests (401).
4. **Route:** the handler runs `validatePurchase` and takes the owner from `req.session.userId`, never from the body.
5. **SQL:** a parameterized `INSERT INTO purchases(owner_id,name,quantity,unit_price_cents,category_id) VALUES (?,?,?,?,?)`, then a JOIN `SELECT` returns the created record.
6. **JSON response:** 201 with the complete record, or `{"error":"message"}`.
7. **UI refresh:** the client resets the form, reloads `GET /api/purchases`, rebuilds the history, total and count, and shows "Purchase added."

**Node.js, npm, package-lock.json:** Node.js runs `server.js` outside the browser. npm installs the packages in `package.json`. `package-lock.json` pins the exact versions so every install matches.

**async/await:** `await` pauses only the current async function until a promise settles (for example `argon2.hash`). Node keeps serving other requests meanwhile, so the server does not become synchronous.

## Part 2: Data and validation
- **Primary key:** `purchases.id INTEGER PRIMARY KEY` identifies each purchase.
- **Foreign keys:** `owner_id REFERENCES users(id)` and `category_id REFERENCES categories(id)`, enforced by `PRAGMA foreign_keys = ON`.
- **CHECK constraint:** `quantity` must be an integer from 1 to 10,000 (other checks cover name length and price), so the database rejects bad data even if application code misses it.
- **Why relational fits:** the records are uniform and related. A JOIN supplies the category name without repeating it, and constraints keep totals reliable.
- **SQL vs NoSQL:** a document database would likely store each purchase as one JSON document with the category name embedded. That is flexible, but renaming a category would mean updating many documents, and integrity checks would move into application code. For small, uniform, related records, the relational model gives stronger guarantees with less code.

`validatePurchase(body, validCategoryIds)` rejects non-object bodies, requires a trimmed name of 1-100 characters, an integer quantity from 1 to 10,000, an integer `unitPriceCents` from 1 to 100,000,000, and an existing integer category ID. Booleans, strings, null, NaN and infinity are rejected. Cost is always calculated on the server as `quantity × unitPriceCents`.

## Part 3: REST API
| Route | Behavior |
|-------|----------|
| `GET /api/categories` | Array of `{id,name}` |
| `GET /api/purchases` | The user's purchases only, with `categoryName` and `costCents`, ordered by ID |
| `POST /api/purchases` | Validate and create; returns 201 and the full record |
| `PUT /api/purchases/:id` | Replace the four editable fields of an owned purchase; returns 200 and the record |
| `DELETE /api/purchases/:id` | Delete an owned purchase; returns `{"ok":true}` |

Status codes: 200 for reads, updates and deletes; 201 for creation; 400 for bad JSON, invalid fields or an invalid ID; 401 when login is required; 404 when the purchase is missing or owned by someone else; generic 500 for unexpected errors. Errors are `{"error":"message"}`. PUT and DELETE include `owner_id` in the SQL, and error cases do not change data.

## Part 4: Frontend
The page keeps the PA1 layout and adds login, category and edit controls. One `api()` helper uses Fetch with async/await, `JSON.stringify` for request bodies, and the CSRF token. It checks `response.ok`, shows server error messages for HTTP failures, and shows a separate connection message when the request cannot reach the server. After login, create, edit or delete, the client reloads the purchase list from the server and rebuilds the history and totals. Names are displayed with `textContent`. Failed submissions keep the inputs, the submit button is disabled while a request is pending and restored in `finally`, Logout clears the private data, and `/api/me` restores a live session on reload.

## Part 5: Authentication and authorization
- Registration validates the email and password and stores only an Argon2id hash. A duplicate email returns 409, and registration does not log the user in.
- Login returns one generic 401 for any bad credentials, then regenerates and saves the session before responding. Logout destroys the session and clears the cookie.
- Every mutating request needs a valid CSRF token from `/api/csrf`, fetched again after login. The cookie is `httpOnly`, `SameSite=Lax`, with a one-hour expiry; `secure=false` is for local HTTP only and HTTPS would need `secure: true`.

**Authentication vs authorization (two-user test):** authentication proves who the user is: A and B each log in and the session holds their user ID. Authorization decides what that user may do: when B sends PUT or DELETE for A's purchase, B is logged in, but `WHERE id = ? AND owner_id = ?` finds nothing, so the server returns 404 and A's record is unchanged. Sending A's ID as `ownerId` in a body changes nothing, because ownership comes only from the session.

## Part 6: Tests and Git
`test-report.md` records each check with its observed result, and the screenshots `evidence-two-user.png` and `evidence-persistence.png` are included. The Git history has commits for setup, validation, the API, the frontend integration and the documentation.

**Why client-side validation is not enough:** browser checks improve usability, but anyone can bypass the page with Postman, curl or edited JavaScript and send values like `quantity: "5"` or a made-up `costCents`. The server must validate every field itself, calculate cost itself, and check ownership and CSRF. The database CHECK constraints are a last safety net.

## Known limitations
- Sessions use the default in-memory store, so a server restart logs everyone out. Purchases stay in SQLite.
- If the connection is lost after the server commits a change, the result is uncertain. The UI shows a connection error and keeps the inputs; check the list before retrying, because exactly-once behavior is not guaranteed.
- No rate limiting, password reset or deployment setup (not required for this local exercise).
