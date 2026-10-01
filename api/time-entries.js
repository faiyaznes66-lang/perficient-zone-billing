import { db } from "hatchable";

export const access="user";
export const methods=["GET","POST"];

async function business(uid){
  const {rows}=await db.query("SELECT id,currency FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const {rows}=await db.query(
      `SELECT t.*,COALESCE(c.company,c.display_name_primary,c.name,'—') AS customer_name,p.project_name
       FROM time_entries t
       LEFT JOIN customers c ON c.id=t.customer_id
       LEFT JOIN projects p ON p.id=t.project_id
       WHERE t.business_id=$1 ORDER BY t.entry_date DESC,t.created_at DESC`,[b.id]);
    return res.json({entries:rows});
  }
  const x=req.body||{};
  if(!x.customer_id) return res.status(400).json({error:"Customer is required"});
  if(!(x.description||"").trim()) return res.status(400).json({error:"Description is required"});
  const hours=Math.max(0,Number(x.hours)||0),rate=Math.max(0,Number(x.hourly_rate)||0);
  if(hours<=0) return res.status(400).json({error:"Hours must be greater than zero"});
  const {rows}=await db.query(
    `INSERT INTO time_entries (business_id,customer_id,project_id,entry_date,description,hours,hourly_rate,billable,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.id,x.customer_id,x.project_id||null,x.entry_date||new Date().toISOString().slice(0,10),String(x.description).trim(),hours,rate,x.billable!==false,x.notes||null]);
  res.status(201).json({entry:rows[0]});
}