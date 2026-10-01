import { db } from "hatchable";

export const access="user";
export const methods=["PUT","DELETE"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(404).json({error:"Business not found"});
  const id=req.params.id;
  if(req.method==="DELETE"){
    const out=await db.query("DELETE FROM recurring_invoices WHERE id=$1 AND business_id=$2",[id,b[0].id]);
    if(!out.rowCount) return res.status(404).json({error:"Recurring schedule not found"});
    return res.json({ok:true});
  }
  const x=req.body||{};
  const {rows}=await db.query(
    `UPDATE recurring_invoices SET active=$1,next_run_date=COALESCE($2,next_run_date),end_date=$3,updated_at=now()
     WHERE id=$4 AND business_id=$5 RETURNING *`,
    [x.active!==false,x.next_run_date||null,x.end_date||null,id,b[0].id]);
  if(!rows[0]) return res.status(404).json({error:"Recurring schedule not found"});
  res.json({recurring:rows[0]});
}