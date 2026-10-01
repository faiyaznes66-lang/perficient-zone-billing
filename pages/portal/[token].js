import { db } from "hatchable";
import { planState } from "lib/plans.js";

export const access="public";
const e=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const m=(n,c)=>`${e(c)} ${Number(n||0).toLocaleString("en-AE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default async function(req,res){
  const {rows:c}=await db.query(
    `SELECT c.*,b.legal_name,b.trade_name,b.currency AS business_currency,b.logo_url,b.invoice_accent
     FROM customers c JOIN businesses b ON b.id=c.business_id
     WHERE c.portal_token=$1 AND c.portal_enabled=true LIMIT 1`,[req.params.token]);
  const customer=c[0];
  if(!customer) return res.status(404).send("<h1>Customer portal unavailable</h1>");
  const plan=await planState(db,customer.business_id);
  if(!plan.plan.portal) return res.status(403).send("<h1>Customer portal is not enabled on this account plan.</h1>");

  const {rows:invoices}=await db.query(
    `SELECT invoice_number,invoice_date,due_date,status,currency,total,amount_paid,public_token,share_enabled
     FROM invoices WHERE business_id=$1 AND customer_id=$2 AND status<>'cancelled'
     ORDER BY invoice_date DESC,created_at DESC`,[customer.business_id,customer.id]);
  const {rows:quotes}=await db.query(
    `SELECT quote_number,quote_date,expiry_date,status,currency,total
     FROM quotes WHERE business_id=$1 AND customer_id=$2
     ORDER BY quote_date DESC,created_at DESC`,[customer.business_id,customer.id]);

  const brand=customer.trade_name||customer.legal_name,accent=/^#[0-9a-fA-F]{6}$/.test(customer.invoice_accent||"")?customer.invoice_accent:"#0e7568";
  const outstanding=invoices.reduce((s,x)=>s+Math.max(0,Number(x.total)-Number(x.amount_paid)),0);
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Customer Portal · ${e(brand)}</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#f4f7f7;color:#203542;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{width:min(1020px,calc(100% - 28px));margin:auto}.top{padding:28px 0;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:12px;font-weight:900;color:#102a43}.brand img{max-width:140px;max-height:54px}.hero{background:#fff;border:1px solid #dfe8e6;border-radius:20px;padding:28px;margin-bottom:18px}.hero h1{margin:0;color:#102a43}.hero p{color:#667985}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}.metric{background:#f6faf9;border-radius:14px;padding:16px}.metric span{display:block;color:#71848e;font-size:12px}.metric strong{font-size:24px;color:#102a43;display:block;margin-top:6px}.panel{background:#fff;border:1px solid #dfe8e6;border-radius:18px;overflow:hidden;margin:16px 0}.panel h2{font-size:18px;margin:0;padding:18px 20px;border-bottom:1px solid #e6eeec}.table{width:100%;border-collapse:collapse}.table th,.table td{padding:13px 16px;border-bottom:1px solid #edf2f1;text-align:left;font-size:13px}.table th{font-size:10px;text-transform:uppercase;color:#758791}.status{padding:5px 8px;border-radius:999px;background:#edf2f1;font-size:10px;text-transform:capitalize;font-weight:800}.view{color:${accent};font-weight:800;text-decoration:none}.empty{padding:30px;text-align:center;color:#71848e}.foot{padding:24px 0 40px;color:#82929b;font-size:11px}.accent{color:${accent}}@media(max-width:700px){.metrics{grid-template-columns:1fr}.table-wrap{overflow:auto}.top{align-items:flex-start;flex-direction:column;gap:10px}}</style></head><body>
  <div class="wrap"><header class="top"><div class="brand">${customer.logo_url?`<img src="${e(customer.logo_url)}" alt="">`:""}<span>${e(brand)}</span></div><span>Customer portal</span></header>
  <section class="hero"><h1>Hello, ${e(customer.company||customer.name)}</h1><p>View your invoices, balances and quotations from ${e(brand)}.</p><div class="metrics"><div class="metric"><span>Invoices</span><strong>${invoices.length}</strong></div><div class="metric"><span>Outstanding</span><strong>${m(outstanding,customer.business_currency)}</strong></div><div class="metric"><span>Quotes</span><strong>${quotes.length}</strong></div></div></section>
  <section class="panel"><h2>Invoices</h2>${invoices.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th>Total</th><th>Balance</th><th></th></tr></thead><tbody>${invoices.map(x=>`<tr><td><strong>${e(x.invoice_number)}</strong></td><td>${e(String(x.invoice_date).slice(0,10))}</td><td><span class="status">${e(x.status)}</span></td><td>${m(x.total,x.currency)}</td><td>${m(Math.max(0,Number(x.total)-Number(x.amount_paid)),x.currency)}</td><td>${x.share_enabled?`<a class="view" href="/invoice/${e(x.public_token)}">View</a>`:"Unavailable"}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No invoices available.</div>`}</section>
  <section class="panel"><h2>Quotes</h2>${quotes.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Quote</th><th>Date</th><th>Expiry</th><th>Status</th><th>Total</th></tr></thead><tbody>${quotes.map(x=>`<tr><td><strong>${e(x.quote_number)}</strong></td><td>${e(String(x.quote_date).slice(0,10))}</td><td>${e(x.expiry_date?String(x.expiry_date).slice(0,10):"—")}</td><td><span class="status">${e(x.status)}</span></td><td>${m(x.total,x.currency)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">No quotations available.</div>`}</section>
  <div class="foot">This secure portal link should be kept private. Contact ${e(brand)} if you believe it was shared unintentionally.</div></div></body></html>`);
}