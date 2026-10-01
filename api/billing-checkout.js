import { db } from "hatchable";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Business not found"});
  const plan=(req.body&&req.body.plan)||"";
  if(!["starter","pro","business"].includes(plan)) return res.status(400).json({error:"Choose a valid paid plan"});
  res.status(409).json({
    error:"Billing provider not connected",
    code:"BILLING_NOT_CONFIGURED",
    requested_plan:plan,
    message:"No payment has been attempted. Connect a merchant payment provider before enabling checkout."
  });
}