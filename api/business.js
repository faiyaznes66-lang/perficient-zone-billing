import { db } from "hatchable";
import { planState } from "lib/plans.js";

export const access = "user";
export const methods = ["GET","POST"];

function accent(v){
  return /^#[0-9a-fA-F]{6}$/.test(String(v||""))?String(v):"#0e7568";
}
function font(v){
  return ["inter","system","serif"].includes(v)?v:"inter";
}

export default async function(req,res){
  const uid=req.user.id;
  if(req.method==="GET"){
    const {rows}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 ORDER BY created_at LIMIT 1",[uid]);
    return res.json({business:rows[0]||null});
  }

  const b=req.body||{};
  const legal=(b.legal_name||"").trim();
  if(!legal) return res.status(400).json({error:"Business name is required"});

  const vals=[
    uid,legal,(b.trade_name||"").trim()||null,b.country||"United Arab Emirates",b.emirate||null,
    b.address||null,b.phone||null,b.email||req.user.email||null,b.website||null,b.trn||null,
    !!b.vat_registered,Number.isFinite(Number(b.default_tax_rate))?Number(b.default_tax_rate):5,
    b.currency||"AED",b.invoice_prefix||"INV-",b.quote_prefix||"QUO-",b.default_language||"en",
    b.bank_name||null,b.account_name||null,b.iban||null,b.swift||null,b.payment_instructions||null,
    accent(b.invoice_accent),font(b.invoice_font),b.invoice_footer||null,!!b.hide_platform_branding
  ];

  const {rows}=await db.query(
    `INSERT INTO businesses
      (owner_user_id,legal_name,trade_name,country,emirate,address,phone,email,website,trn,vat_registered,default_tax_rate,
       currency,invoice_prefix,quote_prefix,default_language,bank_name,account_name,iban,swift,payment_instructions,
       invoice_accent,invoice_font,invoice_footer,hide_platform_branding)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     ON CONFLICT (owner_user_id) DO UPDATE SET
      legal_name=EXCLUDED.legal_name,trade_name=EXCLUDED.trade_name,country=EXCLUDED.country,
      emirate=EXCLUDED.emirate,address=EXCLUDED.address,phone=EXCLUDED.phone,email=EXCLUDED.email,
      website=EXCLUDED.website,trn=EXCLUDED.trn,vat_registered=EXCLUDED.vat_registered,
      default_tax_rate=EXCLUDED.default_tax_rate,currency=EXCLUDED.currency,
      invoice_prefix=EXCLUDED.invoice_prefix,quote_prefix=EXCLUDED.quote_prefix,
      default_language=EXCLUDED.default_language,bank_name=EXCLUDED.bank_name,
      account_name=EXCLUDED.account_name,iban=EXCLUDED.iban,swift=EXCLUDED.swift,
      payment_instructions=EXCLUDED.payment_instructions,invoice_accent=EXCLUDED.invoice_accent,
      invoice_font=EXCLUDED.invoice_font,invoice_footer=EXCLUDED.invoice_footer,
      hide_platform_branding=EXCLUDED.hide_platform_branding,updated_at=now()
     RETURNING *`,vals);

  await db.query(
    "INSERT INTO subscriptions (business_id,plan_key,status) VALUES ($1,'free','active') ON CONFLICT (business_id) DO NOTHING",
    [rows[0].id]);
  const plan=await planState(db,rows[0].id);
  if(plan.plan.branding && rows[0].hide_platform_branding){
    const {rows:fixed}=await db.query("UPDATE businesses SET hide_platform_branding=false WHERE id=$1 RETURNING *",[rows[0].id]);
    return res.json({business:fixed[0],notice:"Removing Perficient Zone Billing branding requires the Pro or Business plan."});
  }
  res.json({business:rows[0]});
}