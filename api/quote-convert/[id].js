import { db } from "hatchable";
import { calculateInvoice } from "lib/invoiceCalc.js";
import { requireInvoiceCapacity } from "lib/plans.js";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Business not found"});
  const business=b[0],id=req.params.id;
  try{await requireInvoiceCapacity(db,business.id)}catch(e){return res.status(e.status||402).json({error:e.message,code:e.code||"PLAN_LIMIT"})}
  const {rows:q}=await db.query("SELECT * FROM quotes WHERE id=$1 AND business_id=$2",[id,business.id]);
  if(!q[0]) return res.status(404).json({error:"Quote not found"});
  if(q[0].converted_invoice_id) return res.status(400).json({error:"Quote has already been converted"});
  const {rows:items}=await db.query("SELECT * FROM quote_items WHERE quote_id=$1 ORDER BY position",[id]);
  const calc=calculateInvoice({...q[0],items,discount_type:q[0].discount_type,discount_value:q[0].discount_value});
  if(business.vat_registered && q[0].currency!=="AED") return res.status(400).json({error:"Convert this foreign-currency quote manually so the applicable AED exchange rate can be entered for the tax invoice"});

  const {rows:a}=await db.query(
    "UPDATE businesses SET next_invoice_number=next_invoice_number+1,updated_at=now() WHERE id=$1 RETURNING invoice_prefix,next_invoice_number-1 AS allocated",[business.id]);
  const number=`${a[0].invoice_prefix}${String(a[0].allocated).padStart(4,"0")}`;
  const compliance=business.vat_registered?{format:"full",display:"line"}:{format:"full",display:"hidden"};

  const {rows:inv}=await db.query(
    `INSERT INTO invoices
      (business_id,customer_id,invoice_number,invoice_date,due_date,supply_date,status,currency,reference,notes,terms,tax_display,vat_mode,
       subtotal,discount_amount,taxable_amount,vat_amount,total,amount_paid,invoice_format,discount_type,discount_value,vat_amount_aed,language)
     VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE,CURRENT_DATE,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,$15,$16,$17,$18,$19)
     RETURNING *`,
    [business.id,q[0].customer_id,number,q[0].currency,q[0].reference,q[0].notes,q[0].terms,compliance.display,q[0].vat_mode,
     calc.subtotal,calc.discount_amount,calc.taxable_amount,calc.vat_amount,calc.total,compliance.format,calc.discount_type,calc.discount_value,calc.vat_amount,business.default_language==="ar"?"ar":"en"]);
  for(const it of calc.items){
    await db.query(
      `INSERT INTO invoice_items
      (invoice_id,position,item_name,description,quantity,unit,rate,discount_percent,tax_rate,tax_category,line_subtotal,line_tax,line_total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [inv[0].id,it.position,it.item_name,it.description,it.quantity,it.unit,it.rate,it.discount_percent,it.tax_rate,it.tax_category,it.line_subtotal,it.line_tax,it.line_total]);
  }
  await db.query("UPDATE quotes SET status='accepted',converted_invoice_id=$1,updated_at=now() WHERE id=$2 AND business_id=$3",[inv[0].id,id,business.id]);
  res.status(201).json({invoice:inv[0]});
}