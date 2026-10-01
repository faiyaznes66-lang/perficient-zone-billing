import { db } from "hatchable";
import { planState } from "lib/plans.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Business not found"});
  const state=await planState(db,b[0].id);
  res.json({
    provider:null,
    connected:false,
    live_charging:false,
    plan:state.plan,
    subscription:state.subscription,
    message:"Payment gateway is intentionally disabled until merchant credentials and webhook verification are configured."
  });
}