import { db } from "hatchable";
import { requireFeature } from "lib/plans.js";

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
      `SELECT r.*,COALESCE(c.company,c.name,'—') AS customer_name
       FROM recurring_invoices r LEFT JOIN customers c ON c.id=r.customer_id
       WHERE r.business_id=$1 ORDER BY r.created_at DESC`,[b.id]);
    return res.json({recurring:rows});
  }
  const x=req.body||{};
  try{await requireFeature(db,b.id,"recurring")}catch(e){return res.status(e.status||402).json({error:e.message,code:e.code||"PLAN_FEATURE"})}
  if(!x.customer_id||!x.name||!Array.isArray(x.items)||!x.items.length) return res.status(400).json({error:"Name, customer and at least one item are required"});
  const frequency=["weekly","monthly","quarterly","yearly"].includes(x.frequency)?x.frequency:"monthly";
  const recurringCurrency=x.currency||b.currency||"AED";
  if(b.vat_registered && recurringCurrency!=="AED") return res.status(400).json({error:"Recurring VAT invoices currently require AED because the applicable exchange rate must be determined for each invoice date"});
  const format=x.invoice_format==="simplified"?"simplified":"full";
  const display=b.vat_registered?(format==="simplified"?"totals":"line"):(["line","totals","hidden"].includes(x.tax_display)?x.tax_display:"hidden");
  const recurringItems=b.vat_registered?x.items:x.items.map(it=>({...it,tax_category:"out_of_scope",tax_rate:0}));
  const {rows}=await db.query(
    `INSERT INTO recurring_invoices
      (business_id,customer_id,name,frequency,next_run_date,end_date,active,currency,template_key,vat_mode,invoice_format,tax_display,discount_type,discount_value,notes,terms,items_json)
     VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb) RETURNING *`,
    [b.id,x.customer_id,String(x.name).trim(),frequency,x.next_run_date||new Date().toISOString().slice(0,10),x.end_date||null,
     x.currency||b.currency||"AED",x.template_key||"classic",x.vat_mode||"exclusive",format,display,
     x.discount_type==="percent"?"percent":"fixed",Math.max(0,Number(x.discount_value)||0),x.notes||null,x.terms||null,JSON.stringify(recurringItems)]);
  res.status(201).json({recurring:rows[0]});
}