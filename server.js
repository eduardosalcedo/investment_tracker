require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const fs = require('node:fs');
const path = require('node:path');
const {configureSecurity,requireAuth} = require('./security');
const {validatePurchase} = require('./validation');
const app=express();
const db=new Database(path.join(__dirname,'tracker.db'));
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
app.use(express.json({limit:'16kb'}));
configureSecurity(app);
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

// S1: health check.
app.get('/api/health',(req,res)=>res.json({ok:true}));

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bodyOf=req=>(req.body&&typeof req.body==='object'&&!Array.isArray(req.body))?req.body:{};
const wrap=fn=>new Promise((resolve,reject)=>fn(e=>e?reject(e):resolve()));

// S2: register. Only the email is normalized; the password is hashed with Argon2id.
app.post('/api/register',asyncRoute(async(req,res)=>{
  const {email:rawEmail,password}=bodyOf(req);
  if (typeof rawEmail!=='string'||typeof password!=='string') return res.status(400).json({error:'Email and password are required'});
  const email=rawEmail.trim().toLowerCase();
  if (email.length<3||email.length>254||!EMAIL_RE.test(email)) return res.status(400).json({error:'Enter a valid email address'});
  if (password.length<8||password.length>128) return res.status(400).json({error:'Password must be 8-128 characters'});
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({error:'Email is already registered'});
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  try {
    const result=db.prepare('INSERT INTO users(email,password_hash) VALUES (?,?)').run(email,hash);
    res.status(201).json({id:Number(result.lastInsertRowid),email});
  } catch (e) {
    if (e&&String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({error:'Email is already registered'});
    throw e;
  }
}));

// S3: login. Generic 401 for unknown email or wrong password; new session id on success.
app.post('/api/login',asyncRoute(async(req,res)=>{
  const {email:rawEmail,password}=bodyOf(req);
  if (typeof rawEmail!=='string'||typeof password!=='string') return res.status(400).json({error:'Email and password are required'});
  const email=rawEmail.trim().toLowerCase();
  const user=db.prepare('SELECT id,email,password_hash FROM users WHERE email = ?').get(email);
  let valid=false;
  if (user) {
    try { valid=await argon2.verify(user.password_hash,password); } catch { valid=false; }
  }
  if (!valid) return res.status(401).json({error:'Invalid email or password'});
  await wrap(cb=>req.session.regenerate(cb));
  req.session.userId=user.id;
  await wrap(cb=>req.session.save(cb));
  res.json({id:user.id,email:user.email});
}));
app.get('/api/me',requireAuth,(req,res)=> {
  // S4
  const user=db.prepare('SELECT id,email FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({error:'Login required'});
  res.json({id:user.id,email:user.email});
});
app.post('/api/logout',requireAuth,(req,res,next)=> {
  // S5
  req.session.destroy(err=> {
    if (err) return next(err);
    res.clearCookie('sid',{path:'/'});
    res.json({ok:true});
  });
});
app.get('/api/categories',requireAuth,(req,res)=> {
  // S6
  res.json(db.prepare('SELECT id,name FROM categories ORDER BY id').all());
});

// S7: reusable joined SELECT; every query using it is restricted by owner_id.
const PURCHASE_SELECT=`SELECT p.id AS id, p.name AS name, p.quantity AS quantity,
  p.unit_price_cents AS unitPriceCents, p.category_id AS categoryId, c.name AS categoryName,
  p.quantity * p.unit_price_cents AS costCents
  FROM purchases p JOIN categories c ON c.id = p.category_id`;
const listStmt=db.prepare(`${PURCHASE_SELECT} WHERE p.owner_id = ? ORDER BY p.id ASC`);
const getOwnedStmt=db.prepare(`${PURCHASE_SELECT} WHERE p.id = ? AND p.owner_id = ?`);
const categoryIds=()=>db.prepare('SELECT id FROM categories ORDER BY id').all().map(r=>r.id);
const parseId=raw=>/^[1-9]\d{0,14}$/.test(raw)?Number(raw):null;

app.get('/api/purchases',requireAuth,(req,res)=> {
  // S8
  res.json(listStmt.all(req.session.userId));
});
app.post('/api/purchases',requireAuth,(req,res)=> {
  // S9
  const result=validatePurchase(req.body,categoryIds());
  if (result.error) return res.status(400).json({error:result.error});
  const v=result.value;
  const info=db.prepare('INSERT INTO purchases(owner_id,name,quantity,unit_price_cents,category_id) VALUES (?,?,?,?,?)')
    .run(req.session.userId,v.name,v.quantity,v.unitPriceCents,v.categoryId);
  res.status(201).json(getOwnedStmt.get(Number(info.lastInsertRowid),req.session.userId));
});
app.put('/api/purchases/:id',requireAuth,(req,res)=> {
  // S10
  const id=parseId(req.params.id);
  if (id===null) return res.status(400).json({error:'Invalid purchase ID'});
  if (!getOwnedStmt.get(id,req.session.userId)) return res.status(404).json({error:'Purchase not found'});
  const result=validatePurchase(req.body,categoryIds());
  if (result.error) return res.status(400).json({error:result.error});
  const v=result.value;
  db.prepare('UPDATE purchases SET name = ?, quantity = ?, unit_price_cents = ?, category_id = ? WHERE id = ? AND owner_id = ?')
    .run(v.name,v.quantity,v.unitPriceCents,v.categoryId,id,req.session.userId);
  res.json(getOwnedStmt.get(id,req.session.userId));
});
app.delete('/api/purchases/:id',requireAuth,(req,res)=> {
  // S11
  const id=parseId(req.params.id);
  if (id===null) return res.status(400).json({error:'Invalid purchase ID'});
  const info=db.prepare('DELETE FROM purchases WHERE id = ? AND owner_id = ?').run(id,req.session.userId);
  if (info.changes===0) return res.status(404).json({error:'Purchase not found'});
  res.json({ok:true});
});

app.use('/api',(req,res)=>res.status(404).json({error:'API route not found'}));
app.use(express.static(path.join(__dirname,'public')));
app.use((err,req,res,next)=> {
  if (err.type==='entity.parse.failed') return res.status(400).json({error:'Invalid JSON'});
  if (err.type==='entity.too.large') return res.status(413).json({error:'Request too large'});
  console.error('Request failed');
  res.status(500).json({error:'Internal server error'});
});
app.listen(Number(process.env.PORT)||3000,()=>console.log('Open http://localhost:3000'));
