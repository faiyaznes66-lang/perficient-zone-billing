import { db } from "hatchable";
import { calculateInvoice } from "lib/invoiceCalc.js";

export const access="user";
export const methods=["GET","POST"];

async function business(uid){
  const {rows}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const {rows}=await db.query(
      `SELECT q.id,q.quote_number,q.quote_date,q.expiry_date,q.status,q.currency,q.total::float,q.converted_invoice_id,
              COALESCE(c.company,c.name,'—') AS customer_name
       FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
       WHERE q.business_id=$1 ORDER BY q.created_at DESC`,[b.id]);
    return res.json({quotes:rows});
  }

  const x=req.body||{};
  if(!Array.isArray(x.items)||!x.items.length) return res.status(400).json({error:"Add at least one quote item"});
  const normalized=b.vat_registered?x:{...x,items:x.items.map(it=>({...it,tax_category:"out_of_scope",tax_rate:0}))};
  const calc=calculateInvoice(normalized);
  let number=(x.quote_number||"").trim();
  if(!number){
    const {rows:a}=await db.query(
      "UPDATE businesses SET next_quote_number=next_quote_number+1,updated_at=now() WHERE id=$1 RETURNING quote_prefix,next_quote_number-1 AS allocated",[b.id]);
    number=`${a[0].quote_prefix}${String(a[0].allocated).padStart(4,"0")}`;
  }
  const {rows:q}=await db.query(
    `INSERT INTO quotes
      (business_id,customer_id,quote_number,quote_date,expiry_date,status,currency,reference,notes,terms,vat_mode,discount_type,discount_value,discount_amount,subtotal,vat_amount,total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [b.id,x.customer_id||null,number,x.quote_date||new Date().toISOString().slice(0,10),x.expiry_date||null,x.status||"draft",
     x.currency||b.currency||"AED",x.reference||null,x.notes||null,x.terms||null,x.vat_mode||"exclusive",
     calc.discount_type,calc.discount_value,calc.discount_amount,calc.subtotal,calc.vat_amount,calc.total]);
  for(const it of calc.items){
    await db.query(
      `INSERT INTO quote_items
      (quote_id,position,item_name,description,quantity,unit,rate,discount_percent,tax_rate,tax_category,line_subtotal,line_tax,line_total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [q[0].id,it.position,it.item_name,it.description,it.quantity,it.unit,it.rate,it.discount_percent,it.tax_rate,it.tax_category,it.line_subtotal,it.line_tax,it.line_total]);
  }
  res.status(201).json({quote:{...q[0],items:calc.items}});
}