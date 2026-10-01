import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).send("Business not found");
  const type=(req.query&&req.query.type)||"invoices";
  let headers=[],rows=[];
  if(type==="customers"){
    headers=["Name","Company","Email","Phone","TRN","Currency","Billing Address"];
    const out=await db.query("SELECT name,company,email,phone,trn,currency,billing_address FROM customers WHERE business_id=$1 ORDER BY created_at",[b[0].id]);
    rows=out.rows.map(x=>[x.name,x.company,x.email,x.phone,x.trn,x.currency,x.billing_address]);
  }else if(type==="payments"){
    headers=["Date","Invoice","Amount","Method","Reference","Notes"];
    const out=await db.query(
      `SELECT p.payment_date,i.invoice_number,p.amount,p.method,p.reference,p.notes
       FROM payments p JOIN invoices i ON i.id=p.invoice_id
       WHERE p.business_id=$1 ORDER BY p.payment_date,p.created_at`,[b[0].id]);
    rows=out.rows.map(x=>[x.payment_date,x.invoice_number,x.amount,x.method,x.reference,x.notes]);
  }else{
    headers=["Invoice","Date","Due Date","Status","Currency","Subtotal","Discount","VAT","Total","Paid","Balance"];
    const out=await db.query(
      `SELECT invoice_number,invoice_date,due_date,status,currency,subtotal,discount_amount,vat_amount,total,amount_paid
       FROM invoices WHERE business_id=$1 ORDER BY invoice_date,created_at`,[b[0].id]);
    rows=out.rows.map(x=>[x.invoice_number,x.invoice_date,x.due_date,x.status,x.currency,x.subtotal,x.discount_amount,x.vat_amount,x.total,x.amount_paid,Number(x.total)-Number(x.amount_paid)]);
  }
  const csv=[headers,...rows].map(r=>r.map(q).join(",")).join("\r\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="${type}-export.csv"`);
  res.send("\ufeff"+csv);
}