import { db } from "hatchable";

export const access="user";
export const methods=["GET","PUT","DELETE"];

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
  if(!business) return res.status(404).json({error:"Business not found"});
  const id=req.params.id;
  const {rows:found}=await db.query("SELECT * FROM customers WHERE id=$1 AND business_id=$2",[id,business.id]);
  if(!found[0]) return res.status(404).json({error:"Customer not found"});

  if(req.method==="GET"){
    const {rows:docs}=await db.query("SELECT id,file_name,content_type,size_bytes,storage_url,created_at FROM customer_documents WHERE customer_id=$1 AND business_id=$2 ORDER BY created_at DESC",[id,business.id]);
    return res.json({customer:found[0],documents:docs});
  }
  if(req.method==="DELETE"){
    await db.query("DELETE FROM customers WHERE id=$1 AND business_id=$2",[id,business.id]);
    return res.json({ok:true});
  }

  const c=req.body||{};
  const first=(c.first_name||"").trim(),last=(c.last_name||"").trim(),company=(c.company||"").trim();
  const legal=(c.legal_name||"").trim();
  const display=(c.display_name_primary||c.display_name||company||[first,last].filter(Boolean).join(" ")||legal||found[0].name||"").trim();
  if(!display) return res.status(400).json({error:"Display name, company name or contact name is required"});

  const billing=[c.address_line1,c.address_line2,c.city,c.emirate,c.postal_code,c.country||"United Arab Emirates"].filter(Boolean).join(", ");
  const {rows}=await db.query(
    `UPDATE customers SET
      name=$1,company=$2,email=$3,phone=$4,billing_address=$5,trn=$6,
      customer_type=$7,salutation=$8,first_name=$9,last_name=$10,display_name_primary=$11,display_name_ar=$12,
      work_phone=$13,mobile=$14,customer_language=$15,other_details=$16,address_line1=$17,address_line2=$18,
      city=$19,emirate=$20,postal_code=$21,country=$22,contact_persons=$23::jsonb,custom_fields=$24::jsonb,
      remarks=$25,tin_number=$26,buyer_id_value=$27,buyer_id_authority=$28,legal_name=$29,
      location_code_type=$30,location_code_value=$31,electronic_address=$32,payment_terms_days=$33,
      portal_enabled=$34,customer_owner_user_id=$35,customer_owner_email=$36,notes=$37,updated_at=now()
     WHERE id=$38 AND business_id=$39 RETURNING *`,
    [display,company||null,c.email||null,c.phone||null,billing||c.billing_address||null,c.trn||null,
     cleanType(c.customer_type),c.salutation||null,first||null,last||null,display,c.display_name_ar||null,
     c.work_phone||null,c.mobile||null,cleanLang(c.customer_language),c.other_details||null,
     c.address_line1||null,c.address_line2||null,c.city||null,c.emirate||null,c.postal_code||null,c.country||"United Arab Emirates",
     JSON.stringify(safeArray(c.contact_persons)),JSON.stringify(safeArray(c.custom_fields)),c.remarks||null,c.tin_number||null,
     c.buyer_id_value||null,c.buyer_id_authority||null,legal||null,c.location_code_type||null,c.location_code_value||null,
     c.electronic_address||null,paymentDays(c.payment_terms_days),c.portal_enabled!==false,req.user.id,
     req.user.email||found[0].customer_owner_email||null,c.notes||null,id,business.id]);

  res.json({customer:rows[0]});
}