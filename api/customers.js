import { db } from "hatchable";

export const access="user";
export const methods=["GET","POST"];

async function businessFor(uid){
  const {rows}=await db.query("SELECT id,currency FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
const cleanType=v=>v==="individual"?"individual":"business";
const cleanLang=v=>v==="ar"?"ar":"en";
const paymentDays=v=>[0,7,15,30,45,60,90].includes(Number(v))?Number(v):0;
const safeArray=v=>Array.isArray(v)?v.slice(0,20):[];

export default async function(req,res){
  const business=await businessFor(req.user.id);
  if(!business) return res.status(400).json({error:"Complete business setup first"});

  if(req.method==="GET"){
    const {rows}=await db.query("SELECT * FROM customers WHERE business_id=$1 ORDER BY created_at DESC",[business.id]);
    return res.json({customers:rows});
  }

  const c=req.body||{};
  const first=(c.first_name||"").trim(),last=(c.last_name||"").trim(),company=(c.company||"").trim(),legal=(c.legal_name||"").trim();
  const display=(c.display_name_primary||c.display_name||company||[first,last].filter(Boolean).join(" ")||legal||"").trim();
  if(!display) return res.status(400).json({error:"Display name, company name or contact name is required"});
  const billing=[c.address_line1,c.address_line2,c.city,c.emirate,c.postal_code,c.country||"United Arab Emirates"].filter(Boolean).join(", ");

  const {rows}=await db.query(
    `INSERT INTO customers (
      business_id,name,company,email,phone,billing_address,trn,currency,notes,
      customer_type,salutation,first_name,last_name,display_name_primary,display_name_ar,
      work_phone,mobile,customer_language,other_details,address_line1,address_line2,city,emirate,postal_code,country,
      contact_persons,custom_fields,remarks,tin_number,buyer_id_value,buyer_id_authority,legal_name,
      location_code_type,location_code_value,electronic_address,payment_terms_days,portal_enabled,
      customer_owner_user_id,customer_owner_email
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
      $26::jsonb,$27::jsonb,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39
    ) RETURNING *`,
    [business.id,display,company||null,c.email||null,c.phone||null,billing||null,c.trn||null,business.currency||"AED",c.notes||null,
     cleanType(c.customer_type),c.salutation||null,first||null,last||null,display,c.display_name_ar||null,
     c.work_phone||null,c.mobile||null,cleanLang(c.customer_language),c.other_details||null,c.address_line1||null,c.address_line2||null,
     c.city||null,c.emirate||null,c.postal_code||null,c.country||"United Arab Emirates",
     JSON.stringify(safeArray(c.contact_persons)),JSON.stringify(safeArray(c.custom_fields)),c.remarks||null,c.tin_number||null,
     c.buyer_id_value||null,c.buyer_id_authority||null,legal||null,c.location_code_type||null,c.location_code_value||null,
     c.electronic_address||null,paymentDays(c.payment_terms_days),c.portal_enabled!==false,req.user.id,req.user.email||null]
  );

  res.status(201).json({customer:rows[0]});
}