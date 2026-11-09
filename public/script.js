// Investment Purchase Tracker (PA2). The server owns all data; this file is display and input handling.
const byId = id => document.getElementById(id);
let csrfToken = null;
let editingId = null;
let purchases = []; // Display cache only. Not persistent storage.

const form = byId('purchase-form');
const nameInput = byId('investment-name');
const quantityInput = byId('quantity');
const priceInput = byId('unit-price');
const categorySelect = byId('category');
const message = byId('message');
const saveButton = byId('save-button');
const cancelButton = byId('cancel-edit');
const listOutput = byId('purchase-list');
const totalOutput = byId('total-invested');
const countOutput = byId('purchase-count');
const authForm = byId('auth-form');
const emailInput = byId('email');
const passwordInput = byId('password');
const loginButton = byId('login-button');
const registerButton = byId('register-button');
const logoutButton = byId('logout-button');
const authMessage = byId('auth-message');
const accountStatus = byId('account-status');
const trackerSections = document.querySelectorAll('.summary, .entry, .purchases');

const CONNECTION_ERROR = 'Cannot reach the server. Your inputs were kept. If the change may have been saved, check the list before trying again.';

function money(cents) { return '$' + (cents / 100).toFixed(2); }
function show(output, text, isError) {
  output.textContent = text;
  output.classList.toggle('error', Boolean(isError));
}

async function refreshCsrf() {
  let response;
  try {
    response = await fetch('/api/csrf', {credentials: 'same-origin'});
  } catch (e) {
    throw new Error(CONNECTION_ERROR);
  }
  if (!response.ok) throw new Error('Could not initialize the session');
  csrfToken = (await response.json()).csrfToken;
}

// F1: shared request helper. Throws Error (with .status for HTTP failures) on any failure.
async function api(path, options = {}, retried = false) {
  const method = (options.method || 'GET').toUpperCase();
  const mutating = method !== 'GET';
  if (mutating && !csrfToken) await refreshCsrf();
  const headers = {};
  let body;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (mutating) headers['X-CSRF-Token'] = csrfToken;
  let response;
  try {
    response = await fetch(path, {method, headers, body, credentials: 'same-origin'});
  } catch (e) {
    throw new Error(CONNECTION_ERROR); // fetch rejects only for network failures
  }
  let data = null;
  try { data = await response.json(); } catch (e) { /* non-JSON body */ }
  if (!response.ok) {
    // A rejected CSRF token (for example after a server restart) is safe to retry once with a new token.
    if (response.status === 403 && mutating && !retried && data && /CSRF/.test(data.error || '')) {
      csrfToken = null;
      return api(path, options, true);
    }
    const error = new Error((data && data.error) || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

// F2
async function loadPurchases() {
  purchases = await api('/api/purchases');
  renderHistory();
  updateSummary();
}

// F3
async function showTracker(user) {
  const categories = await api('/api/categories');
  categorySelect.textContent = '';
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = String(category.id);
    option.textContent = category.name;
    categorySelect.append(option);
  }
  accountStatus.textContent = 'Logged in as ' + user.email;
  authForm.hidden = true;
  logoutButton.hidden = false;
  for (const section of trackerSections) section.hidden = false;
  await loadPurchases();
}

function showSignedOut(text) {
  purchases = [];
  csrfToken = null;
  renderHistory();
  updateSummary();
  resetEdit();
  show(message, '');
  categorySelect.textContent = '';
  for (const section of trackerSections) section.hidden = true;
  authForm.hidden = false;
  logoutButton.hidden = true;
  emailInput.value = '';
  passwordInput.value = '';
  accountStatus.textContent = 'Not logged in.';
  show(authMessage, text || '');
}

// If the session expired or the server restarted, return to the signed-out view.
function handleError(output, error) {
  if (error.status === 401) {
    showSignedOut('Your session ended. Please log in again.');
    return;
  }
  show(output, error.message, true);
}

function resetEdit() {
  editingId = null;
  form.reset();
  saveButton.textContent = 'Add purchase';
  cancelButton.hidden = true;
  byId('entry-heading').textContent = 'Add a purchase';
}

function renderHistory() {
  listOutput.textContent = '';
  for (const purchase of purchases) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${purchase.name} / Quantity: ${purchase.quantity} / Unit price: ${money(purchase.unitPriceCents)} / Cost: ${money(purchase.costCents)} / ${purchase.categoryName} `;
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => beginEdit(purchase));
    const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Delete';
    del.addEventListener('click', () => deletePurchase(purchase.id, del));
    li.append(text, edit, del);
    listOutput.append(li);
  }
}

// F4
function updateSummary() {
  let total = 0;
  for (const purchase of purchases) total += purchase.costCents;
  totalOutput.textContent = money(total);
  countOutput.textContent = purchases.length;
}

// F5
function beginEdit(purchase) {
  editingId = purchase.id;
  nameInput.value = purchase.name;
  quantityInput.value = purchase.quantity;
  priceInput.value = (purchase.unitPriceCents / 100).toFixed(2);
  categorySelect.value = String(purchase.categoryId);
  saveButton.textContent = 'Save changes';
  cancelButton.hidden = false;
  byId('entry-heading').textContent = 'Edit purchase';
  show(message, 'Editing a purchase. Choose Save changes or Cancel edit.');
  nameInput.focus();
}

async function deletePurchase(id, button) {
  button.disabled = true;
  try {
    await api('/api/purchases/' + id, {method: 'DELETE'});
    if (editingId === id) resetEdit();
    await loadPurchases();
    show(message, 'Purchase deleted.');
  } catch (error) {
    handleError(message, error);
  } finally {
    button.disabled = false;
  }
}

// F6
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const quantity = Number(quantityInput.value);
  const dollars = Number(priceInput.value);
  if (name === '' || name.length > 100) return show(message, 'Name must be 1-100 characters.', true);
  if (quantityInput.value.trim() === '' || !Number.isFinite(quantity) || quantity < 1 || quantity > 10000) {
    return show(message, 'Quantity must be a number from 1 to 10,000.', true);
  }
  if (!Number.isInteger(quantity)) return show(message, 'Quantity must be a whole number of units.', true);
  if (priceInput.value.trim() === '' || !Number.isFinite(dollars) || dollars <= 0 || dollars > 1000000) {
    return show(message, 'Price per unit must be greater than $0 and no more than $1,000,000.', true);
  }
  if (Math.abs(dollars * 100 - Math.round(dollars * 100)) > 1e-6) {
    return show(message, 'Price per unit can have at most two decimal places.', true);
  }
  const payload = {
    name,
    quantity,
    unitPriceCents: Math.round(dollars * 100),
    categoryId: Number(categorySelect.value)
  };
  saveButton.disabled = true;
  try {
    if (editingId === null) {
      await api('/api/purchases', {method: 'POST', body: payload});
      form.reset();
      await loadPurchases();
      show(message, 'Purchase added.');
    } else {
      await api('/api/purchases/' + editingId, {method: 'PUT', body: payload});
      resetEdit();
      await loadPurchases();
      show(message, 'Purchase updated.');
    }
  } catch (error) {
    handleError(message, error); // inputs are preserved
  } finally {
    saveButton.disabled = false;
  }
});
cancelButton.addEventListener('click', () => { resetEdit(); show(message, ''); });

// F7
authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  registerButton.disabled = true;
  try {
    if (!csrfToken) await refreshCsrf();
    const user = await api('/api/login', {method: 'POST', body: {email: emailInput.value, password: passwordInput.value}});
    await refreshCsrf(); // login regenerates the session, so the old token is no longer valid
    passwordInput.value = '';
    show(authMessage, '');
    await showTracker(user);
  } catch (error) {
    show(authMessage, error.message, true);
  } finally {
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
});
registerButton.addEventListener('click', async () => {
  loginButton.disabled = true;
  registerButton.disabled = true;
  try {
    await api('/api/register', {method: 'POST', body: {email: emailInput.value, password: passwordInput.value}});
    passwordInput.value = '';
    show(authMessage, 'Registration complete. Please log in.');
  } catch (error) {
    show(authMessage, error.message, true);
  } finally {
    loginButton.disabled = false;
    registerButton.disabled = false;
  }
});
logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await api('/api/logout', {method: 'POST'});
    showSignedOut('Logged out.');
  } catch (error) {
    if (error.status === 401) showSignedOut('Logged out.');
    else show(authMessage, error.message, true);
  } finally {
    logoutButton.disabled = false;
  }
});
async function initialize() {
  try {
    const user = await api('/api/me');
    await showTracker(user);
  } catch (error) {
    if (error.status !== 401) show(authMessage, error.message, true); // 401 just means signed out
  }
}
initialize();
