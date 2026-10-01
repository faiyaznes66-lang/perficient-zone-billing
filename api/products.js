import { db } from "hatchable";

export const access="user";
export const methods=["GET","POST"];

async function business(uid){
  const {rows}=await db.query("SELECT id,default_tax_rate,vat_registered FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const {rows}=await db.query("SELECT * FROM products WHERE business_id=$1 ORDER BY name",[b.id]);
    return res.json({products:rows});
  }
  const x=req.body||{};
  const name=(x.name||"").trim();
  if(!name) return res.status(400).json({error:"Product or service name is required"});
  const requested=["standard","zero","exempt","out_of_scope"].includes(x.tax_category)?x.tax_category:"standard";
  const category=b.vat_registered?requested:"out_of_scope";
  const taxRate=b.vat_registered&&category==="standard"?Math.max(0,Number(x.tax_rate)||Number(b.default_tax_rate)||5):0;
  const {rows}=await db.query(
    `INSERT INTO products (business_id,name,description,sku,rate,unit,tax_category,tax_rate)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.id,name,x.description||null,x.sku||null,Math.max(0,Number(x.rate)||0),x.unit||null,category,taxRate]);
  res.status(201).json({product:rows[0]});
}