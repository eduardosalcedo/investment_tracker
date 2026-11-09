# Investment Purchase Tracker PA2

Eduardo Salcedo
ed673399@ucf.edu
## Setup
1. Install the class-supported Node.js and npm.
2. Run `npm install express better-sqlite3 express-session argon2 dotenv`.
3. Copy `.env.example` to `.env`; set a new random SESSION_SECRET (at least 32 characters).
4. Run `npm start`; visit http://localhost:3000.
5. Run `npm test` for the validation unit tests.

Git Repository: https://github.com/eduardosalcedo/investment_tracker
Node version: 24.18.0

## Part 1: the path of one Add Purchase action
1. **Browser event:** clicking Add purchase fires the form's `submit` event. `script.js` calls `preventDefault()`, validates the inputs, and converts dollars to integer cents with `Math.round(dollars * 100)`.
2. **JSON request:** the shared `api()` helper sends `POST /api/purchases` with `JSON.stringify({name, quantity, unitPriceCents, categoryId})`, the session cookie, and the `X-CSRF-Token` header.
3. **Middleware:** `express.json()` parses the body (malformed JSON becomes a 400). The session middleware loads the session from the cookie. The CSRF middleware checks the Origin and the token. `requireAuth` rejects requests without a logged-in user (401).
4. **Route:** the `POST /api/purchases` handler reads the valid category IDs, runs `validatePurchase`, and takes the owner from `req.session.userId`, never from the body.
5. **SQL statement:** a parameterized prepared statement runs `INSERT INTO purchases(owner_id,name,quantity,unit_price_cents,category_id) VALUES (?,?,?,?,?)`. A second statement then selects the created record using a JOIN with `categories`, computing `costCents` as quantity x unit price.
6. **JSON response:** the server returns 201 and the complete created record, or `{"error":"message"}` with a 4xx/5xx status.
7. **UI refresh:** on success the client resets the form, calls `GET /api/purchases` for the authoritative list, rebuilds the history, recomputes the total and count, and shows "Purchase added."

**Node.js, npm and package-lock.json:** Node.js is the JavaScript runtime that runs `server.js` outside the browser. npm downloads and installs the packages listed in `package.json`. `package-lock.json` records the exact resolved versions so every installation gets the same dependency tree.

**async/await:** `await` pauses only the current async function until a promise settles (for example `argon2.hash` or `fetch`). Node's event loop keeps handling other requests meanwhile, so the server as a whole does not become synchronous or blocked.

## Part 2: keys, constraints and SQL vs NoSQL
- **Primary key:** `purchases.id INTEGER PRIMARY KEY` uniquely identifies each purchase (`users.id` and `categories.id` do the same for their tables).
- **Foreign keys:** `purchases.owner_id REFERENCES users(id)` links a purchase to its owner, and `purchases.category_id REFERENCES categories(id)` links it to a category. `PRAGMA foreign_keys = ON` makes SQLite enforce them.
- **CHECK constraint:** `quantity` must be an integer between 1 and 10,000 (similar checks cover the name length and the unit price in cents), so the database rejects bad data even if application code has a bug.
- **Why relational fits:** purchases, users and categories are structured records with fixed fields and clear relationships. A JOIN returns the category name without duplicating it, and constraints keep totals reliable.
- **SQL vs NoSQL:** a document database would likely store each purchase as one JSON document with the owner and category name embedded. That is flexible and simple to read, but the category name would be repeated in every document, so renaming a category means updating many documents. Referential integrity and checks would usually have to be enforced in application code. For small, uniform, related records like these, the relational model gives stronger guarantees with less code.
