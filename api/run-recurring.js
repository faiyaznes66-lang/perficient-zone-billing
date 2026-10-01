import { db } from "hatchable";
import { calculateInvoice } from "lib/invoiceCalc.js";
import { planState } from "lib/plans.js";

export const access="scheduler";
export const schedule="15 2 * * *";

function nextDate(date,freq){
  const d=new Date(String(date).slice(0,10)+"T12:00:00Z");
  if(freq==="weekly") d.setUTCDate(d.getUTCDate()+7);
  else if(freq==="quarterly") d.setUTCMonth(d.getUTCMonth()+3);
  else if(freq==="yearly") d.setUTCFullYear(d.getUTCFullYear()+1);
  else d.setUTCMonth(d.getUTCMonth()+1);
  return d.toISOString().slice(0,10);
}

export default async function(req,res){
  const today=new Date().toISOString().slice(0,10);
  const {rows:schedules}=await db.query(
    `SELECT r.*,b.invoice_prefix,b.next_invoice_number,b.vat_registered,b.default_tax_rate,b.currency AS business_currency
     FROM recurring_invoices r JOIN businesses b ON b.id=r.business_id
     WHERE r.active=true AND r.next_run_date<=$1 AND (r.end_date IS NULL OR r.next_run_date<=r.end_date)
     ORDER BY r.next_run_date LIMIT 100`,[today]);
  let created=0;
  for(const r of schedules){
    const ps=await planState(db,r.business_id);
    if(!ps.plan.recurring) continue;
    const items=Array.isArray(r.items_json)?r.items_json:[];
    if(!items.length) continue;
    const calc=calculateInvoice({...r,items,discount_type:r.discount_type,discount_value:r.discount_value});
    const {rows:a}=await db.query(
      "UPDATE businesses SET next_invoice_number=next_invoice_number+1,updated_at=now() WHERE id=$1 RETURNING invoice_prefix,next_invoice_number-1 AS allocated",[r.business_id]);
    const number=`${a[0].invoice_prefix}${String(a[0].allocated).padStart(4,"0")}`;
    const {rows:inv}=await db.query(
      `INSERT INTO invoices
       (business_id,customer_id,invoice_number,invoice_date,due_date,supply_date,status,currency,notes,terms,tax_display,vat_mode,
        subtotal,discount_amount,taxable_amount,vat_amount,total,amount_paid,template_key,invoice_format,discount_type,discount_value,vat_amount_aed)
       VALUES ($1,$2,$3,$4,$4,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,$15,$16,$17,$18,$19) RETURNING id`,
      [r.business_id,r.customer_id,number,today,r.currency||r.business_currency||"AED",r.notes,r.terms,r.tax_display,r.vat_mode,
       calc.subtotal,calc.discount_amount,calc.taxable_amount,calc.vat_amount,calc.total,r.template_key,r.invoice_format,calc.discount_type,calc.discount_value,calc.vat_amount]);
    for(const it of calc.items){
      await db.query(
        `INSERT INTO invoice_items
         (invoice_id,position,item_name,description,quantity,unit,rate,discount_percent,tax_rate,tax_category,line_subtotal,line_tax,line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [inv[0].id,it.position,it.item_name,it.description,it.quantity,it.unit,it.rate,it.discount_percent,it.tax_rate,it.tax_category,it.line_subtotal,it.line_tax,it.line_total]);
    }
    const next=nextDate(r.next_run_date,r.frequency);
    const active=!(r.end_date&&next>String(r.end_date).slice(0,10));
    await db.query("UPDATE recurring_invoices SET next_run_date=$1,active=$2,updated_at=now() WHERE id=$3",[next,active,r.id]);
    created++;
  }
  res.json({ok:true,created});
}