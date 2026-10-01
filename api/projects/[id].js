import { db } from "hatchable";
export const access="user";export const methods=["GET","PUT","DELETE"];
async function business(uid){const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);return rows[0]||null}
export default async function(req,res){
  const b=await business(req.user.id);if(!b)return res.status(404).json({error:"Business not found"});
  const {rows:f}=await db.query("SELECT * FROM projects WHERE id=$1 AND business_id=$2",[req.params.id,b.id]);if(!f[0])return res.status(404).json({error:"Project not found"});
  if(req.method==="GET")return res.json({project:f[0]});
  if(req.method==="DELETE"){await db.query("DELETE FROM projects WHERE id=$1 AND business_id=$2",[req.params.id,b.id]);return res.json({ok:true})}
  const x=req.body||{},name=String(x.project_name||f[0].project_name).trim();
  const {rows}=await db.query(
    `UPDATE projects SET customer_id=$1,project_name=$2,project_code=$3,status=$4,start_date=$5,end_date=$6,budget=$7,billing_method=$8,hourly_rate=$9,description=$10,updated_at=now()
     WHERE id=$11 AND business_id=$12 RETURNING *`,
    [x.customer_id||null,name,x.project_code||null,x.status||"active",x.start_date||null,x.end_date||null,Math.max(0,Number(x.budget)||0),x.billing_method||"time_and_materials",Math.max(0,Number(x.hourly_rate)||0),x.description||null,req.params.id,b.id]);
  res.json({project:rows[0]});
}