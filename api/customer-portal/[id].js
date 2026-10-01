import { db } from "hatchable";
import { requireFeature } from "lib/plans.js";

export const access="user";
export const methods=["GET","PUT"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(404).json({error:"Business not found"});
  try{await requireFeature(db,b[0].id,"portal")}catch(e){return res.status(e.status||402).json({error:e.message,code:e.code||"PLAN_FEATURE"})}
  const {rows:c}=await db.query("SELECT * FROM customers WHERE id=$1 AND business_id=$2",[req.params.id,b[0].id]);
  if(!c[0]) return res.status(404).json({error:"Customer not found"});
  if(req.method==="PUT"){
    const enabled=req.body&&req.body.enabled!==false;
    const {rows:u}=await db.query("UPDATE customers SET portal_enabled=$1 WHERE id=$2 AND business_id=$3 RETURNING *",[enabled,req.params.id,b[0].id]);
    return res.json({customer:u[0]});
  }
  const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0],host=req.headers["x-forwarded-host"]||req.headers.host||"invoiceflow-uae.hatchable.site";
  res.json({enabled:c[0].portal_enabled,url:`${proto}://${host}/portal/${c[0].portal_token}`});
}