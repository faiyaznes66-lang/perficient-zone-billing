import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const {rows:r}=await db.query(
    `SELECT i.id,b.id AS business_id
     FROM invoices i JOIN businesses b ON b.id=i.business_id
     WHERE i.id=$1 AND b.owner_user_id=$2 LIMIT 1`,[req.params.id,req.user.id]);
  if(!r[0]) return res.status(404).json({error:"Invoice not found"});
  const {rows}=await db.query(
    "SELECT event_type,recipient,metadata,created_at FROM document_events WHERE business_id=$1 AND invoice_id=$2 ORDER BY created_at DESC LIMIT 100",
    [r[0].business_id,r[0].id]);
  res.json({events:rows});
}