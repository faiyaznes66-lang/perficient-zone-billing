import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

async function business(uid){
  const {rows}=await db.query("SELECT id,currency,legal_name,trade_name FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(404).json({error:"Business not found"});

  const {rows:c}=await db.query("SELECT * FROM customers WHERE id=$1 AND business_id=$2",[req.params.id,b.id]);
  const customer=c[0];
  if(!customer) return res.status(404).json({error:"Customer not found"});

  const [{rows:invoices},{rows:quotes},{rows:payments},{rows:documents},{rows:reviews},{rows:refunds},{rows:badDebts}]=await Promise.all([
    db.query(
      `SELECT id,invoice_number,invoice_date,due_date,status,currency,total::float,amount_paid::float,bad_debt_amount::float,
              GREATEST(total-amount_paid-bad_debt_amount,0)::float AS balance,public_token,share_enabled
       FROM invoices
       WHERE business_id=$1 AND customer_id=$2
       ORDER BY invoice_date DESC,created_at DESC`,[b.id,customer.id]),
    db.query(
      `SELECT id,quote_number,quote_date,expiry_date,status,currency,total::float,converted_invoice_id
       FROM quotes
       WHERE business_id=$1 AND customer_id=$2
       ORDER BY quote_date DESC,created_at DESC`,[b.id,customer.id]),
    db.query(
      `SELECT p.id,p.payment_date,p.amount::float,p.method,p.reference,p.notes,
              i.id AS invoice_id,i.invoice_number,i.currency
       FROM payments p JOIN invoices i ON i.id=p.invoice_id
       WHERE p.business_id=$1 AND i.customer_id=$2
       ORDER BY p.payment_date DESC,p.created_at DESC`,[b.id,customer.id]),
    db.query(
      `SELECT id,file_name,content_type,size_bytes,storage_url,created_at
       FROM customer_documents WHERE business_id=$1 AND customer_id=$2
       ORDER BY created_at DESC`,[b.id,customer.id]),
    db.query(
      `SELECT id,review_date,rating,title,review_text,source,public_permission,created_at
       FROM customer_reviews WHERE business_id=$1 AND customer_id=$2
       ORDER BY review_date DESC,created_at DESC`,[b.id,customer.id]),
    db.query(
      `SELECT r.id,r.refund_date,r.amount::float,r.method,r.reference,r.reason,i.invoice_number,i.currency
       FROM refunds r LEFT JOIN invoices i ON i.id=r.invoice_id
       WHERE r.business_id=$1 AND r.customer_id=$2 ORDER BY r.refund_date DESC,r.created_at DESC`,[b.id,customer.id]),
    db.query(
      `SELECT bd.id,bd.writeoff_date,bd.amount::float,bd.reason,bd.notes,i.invoice_number,i.currency
       FROM bad_debts bd JOIN invoices i ON i.id=bd.invoice_id
       WHERE bd.business_id=$1 AND bd.customer_id=$2 ORDER BY bd.writeoff_date DESC,bd.created_at DESC`,[b.id,customer.id])
  ]);

  const issued=invoices.filter(x=>!["draft","cancelled"].includes(x.status));
  const totals=issued.reduce((a,x)=>{
    a.invoiced+=Number(x.total||0);
    a.paid+=Number(x.amount_paid||0);
    a.outstanding+=Math.max(0,Number(x.total||0)-Number(x.amount_paid||0)-Number(x.bad_debt_amount||0));
    if(x.due_date && new Date(String(x.due_date).slice(0,10)+"T23:59:59Z")<new Date() && Number(x.total)>Number(x.amount_paid)+Number(x.bad_debt_amount||0)) a.overdue+=Math.max(0,Number(x.total)-Number(x.amount_paid)-Number(x.bad_debt_amount||0));
    return a;
  },{invoiced:0,paid:0,outstanding:0,overdue:0});

  const statementEvents=[];
  for(const i of issued){
    statementEvents.push({
      type:"invoice",
      date:String(i.invoice_date).slice(0,10),
      document:i.invoice_number,
      description:"Invoice",
      debit:Number(i.total||0),
      credit:0,
      currency:i.currency
    });
  }
  for(const p of payments){
    statementEvents.push({
      type:"payment",
      date:String(p.payment_date).slice(0,10),
      document:p.invoice_number||p.reference||"Payment",
      description:"Payment received"+(p.method?" · "+String(p.method).replaceAll("_"," "):""),
      debit:0,
      credit:Number(p.amount||0),
      currency:p.currency||b.currency
    });
  }
  for(const r of refunds){
    statementEvents.push({type:"refund",date:String(r.refund_date).slice(0,10),document:r.invoice_number||r.reference||"Refund",description:"Refund issued"+(r.reason?" · "+r.reason:""),debit:Number(r.amount||0),credit:0,currency:r.currency||b.currency});
  }
  for(const w of badDebts){
    statementEvents.push({type:"bad_debt",date:String(w.writeoff_date).slice(0,10),document:w.invoice_number||"Write-off",description:"Bad-debt write-off"+(w.reason?" · "+w.reason:""),debit:0,credit:Number(w.amount||0),currency:w.currency||b.currency});
  }
  statementEvents.sort((a,b)=>a.date.localeCompare(b.date)||(a.type==="invoice"?-1:1));
  let running=0;
  const statement=statementEvents.map(x=>{
    running+=Number(x.debit||0)-Number(x.credit||0);
    return {...x,balance:Math.round((running+Number.EPSILON)*100)/100};
  });

  const transactions=[
    ...invoices.map(x=>({type:"invoice",date:String(x.invoice_date).slice(0,10),number:x.invoice_number,status:x.status,amount:Number(x.total||0),currency:x.currency,id:x.id})),
    ...payments.map(x=>({type:"payment",date:String(x.payment_date).slice(0,10),number:x.reference||x.invoice_number,status:"received",amount:Number(x.amount||0),currency:x.currency||b.currency,id:x.id})),
    ...refunds.map(x=>({type:"refund",date:String(x.refund_date).slice(0,10),number:x.reference||x.invoice_number||"Refund",status:"refunded",amount:Number(x.amount||0),currency:x.currency||b.currency,id:x.id})),
    ...badDebts.map(x=>({type:"bad_debt",date:String(x.writeoff_date).slice(0,10),number:x.invoice_number||"Write-off",status:"written_off",amount:Number(x.amount||0),currency:x.currency||b.currency,id:x.id}))
  ].sort((a,b)=>b.date.localeCompare(a.date));

  res.json({
    business:{name:b.trade_name||b.legal_name,currency:b.currency||"AED"},
    customer,
    summary:{
      ...totals,
      invoices:invoices.length,
      quotes:quotes.length,
      payments:payments.length,
      documents:documents.length,
      reviews:reviews.length
    },
    transactions,
    invoices,
    quotes,
    payments,
    statement,
    documents,
    reviews,
    contacts:Array.isArray(customer.contact_persons)?customer.contact_persons:[]
  });
}