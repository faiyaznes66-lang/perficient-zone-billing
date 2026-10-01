import { db } from "hatchable";

export const access="user";
export const methods=["GET","POST"];

async function business(uid){
  const {rows}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(400).json({error:"Complete business setup first"});
  if(req.method==="GET"){
    const {rows}=await db.query(
      `SELECT d.*,COALESCE(c.company,c.name,'—') AS customer_name
       FROM delivery_challans d LEFT JOIN customers c ON c.id=d.customer_id
       WHERE d.business_id=$1 ORDER BY d.challan_date DESC,d.created_at DESC`,[b.id]);
    return res.json({challans:rows});
  }

  const x=req.body||{};
  if(!x.customer_id) return res.status(400).json({error:"Customer is required"});
  if(!Array.isArray(x.items)||!x.items.length) return res.status(400).json({error:"Add at least one delivery item"});

  const {rows:a}=await db.query(
    "UPDATE businesses SET next_challan_number=next_challan_number+1,updated_at=now() WHERE id=$1 RETURNING challan_prefix,next_challan_number-1 AS allocated",
    [b.id]);
  const number=(x.challan_number||"").trim()||`${a[0].challan_prefix}${String(a[0].allocated).padStart(4,"0")}`;
  const {rows:d}=await db.query(
    `INSERT INTO delivery_challans (business_id,customer_id,challan_number,challan_date,reference,status,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.id,x.customer_id,number,x.challan_date||new Date().toISOString().slice(0,10),x.reference||null,x.status||"draft",x.notes||null]);
  for(let i=0;i<x.items.length;i++){
    const it=x.items[i]||{};
    await db.query(
      `INSERT INTO delivery_challan_items (challan_id,position,item_name,description,quantity,unit)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [d[0].id,i,String(it.item_name||"Item").trim()||"Item",it.description||null,Math.max(0,Number(it.quantity)||0),it.unit||null]);
  }
  res.status(201).json({challan:d[0]});
}