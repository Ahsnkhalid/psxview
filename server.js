// PSXView — Backend Server with Stripe Integration
// ─────────────────────────────────────────────────
// SETUP:
//   1. npm install
//   2. Fill in your .env file (copy .env.example → .env)
//   3. In Stripe Dashboard → Products → Create a $10/month recurring price → copy Price ID to .env
//   4. node server.js
//   5. For webhooks: stripe listen --forward-to localhost:3000/webhook

require('dotenv').config();
const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || `http://localhost:${PORT}`;

// In-memory user store — replace with MongoDB/Postgres for production
const users = {};

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ── Stripe webhook (needs raw body) ──
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      const email = s.customer_email || s.metadata?.email;
      if (email) {
        if (!users[email]) users[email] = { name: s.metadata?.name||email, email, passHash:'', trialStart: Date.now() };
        users[email].subActive = true;
        users[email].stripeCustomerId = s.customer;
        users[email].subExpiry = Date.now() + 30*86400000;
        console.log(`✓ Sub activated: ${email}`);
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const u = Object.values(users).find(u => u.stripeCustomerId === event.data.object.customer);
      if (u) { u.subExpiry = Date.now() + 30*86400000; u.subActive = true; }
      break;
    }
    case 'customer.subscription.deleted': {
      const u = Object.values(users).find(u => u.stripeCustomerId === event.data.object.customer);
      if (u) { u.subActive = false; }
      break;
    }
  }
  res.json({ received: true });
});

app.use(express.json());

// ── Helpers ──
function hashPass(p) { let h=0; for(let i=0;i<p.length;i++){h=(h<<5)-h+p.charCodeAt(i);h|=0;} return h.toString(36); }
function subStatus(u) {
  if (!u) return 'none';
  const now = Date.now();
  if (u.subActive && u.subExpiry && now < u.subExpiry) return 'paid';
  if (u.trialStart && now < u.trialStart + 30*86400000) return 'trial';
  if (u.trialStart) return 'expired';
  return 'none';
}

// ── Auth ──
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name||!email||!password) return res.status(400).json({ error:'Missing fields' });
  const e = email.toLowerCase();
  if (users[e]) return res.status(409).json({ error:'Email already registered' });
  users[e] = { name, email:e, passHash:hashPass(password), trialStart:Date.now(), subActive:false };
  res.json({ ok:true, name, email:e, subStatus:'trial', trialDaysLeft:30 });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const u = users[email?.toLowerCase()];
  if (!u || u.passHash !== hashPass(password)) return res.status(401).json({ error:'Invalid credentials' });
  const st = subStatus(u);
  const dl = u.trialStart ? Math.max(0, Math.ceil((u.trialStart+30*86400000-Date.now())/86400000)) : 0;
  res.json({ ok:true, name:u.name, email:u.email, subStatus:st, trialDaysLeft:dl });
});

app.post('/api/status', (req, res) => {
  const u = users[req.body.email?.toLowerCase()];
  if (!u) return res.status(404).json({ error:'Not found' });
  const st = subStatus(u);
  const dl = u.trialStart ? Math.max(0, Math.ceil((u.trialStart+30*86400000-Date.now())/86400000)) : 0;
  res.json({ subStatus:st, trialDaysLeft:dl, subExpiry:u.subExpiry });
});

// ── Stripe Checkout ──
app.post('/api/create-checkout', async (req, res) => {
  const { email, name } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      metadata: { email, name },
      success_url: `${HOST}/index.html?session_id={CHECKOUT_SESSION_ID}&email=${encodeURIComponent(email)}`,
      cancel_url:  `${HOST}/`,
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stripe Billing Portal ──
app.post('/api/billing-portal', async (req, res) => {
  const u = users[req.body.email?.toLowerCase()];
  if (!u?.stripeCustomerId) return res.status(400).json({ error:'No subscription' });
  try {
    const s = await stripe.billingPortal.sessions.create({ customer:u.stripeCustomerId, return_url:HOST });
    res.json({ url: s.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 PSXView running at ${HOST}`);
  console.log(`   Stripe key:  ${process.env.STRIPE_SECRET_KEY ? '✓' : '✗ MISSING'}`);
  console.log(`   Price ID:    ${process.env.STRIPE_PRICE_ID   ? '✓' : '✗ MISSING'}`);
  console.log(`\n   Open: ${HOST}\n`);
});
