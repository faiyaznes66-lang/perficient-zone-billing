import { db } from "hatchable";
import { planState,PLANS } from "lib/plans.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Complete business setup first"});
  const state=await planState(db,b[0].id);
  res.json({plans:PLANS,...state,billing_connected:false,billing_message:"Live subscription billing is not connected yet."});
}