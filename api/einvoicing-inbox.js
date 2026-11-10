import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(404).json({error:"Business not found"});
  const {rows}=await db.query(
    `SELECT id,provider_document_id,provider_event_id,sender_name,sender_tin,sender_trn,
      sender_endpoint,document_number,document_type,issue_date,due_date,currency,total,tax_amount,
      status,environment,received_at,reviewed_at,linked_expense_id
     FROM einvoice_inbox WHERE business_id=$1 ORDER BY received_at DESC LIMIT 100`,
    [b[0].id]
  );
  res.json({inbox:rows});
}
