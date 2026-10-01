import { db } from "hatchable";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id,legal_name,trn,vat_registered FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Business not found"});
  const business=b[0];
  const {rows:c}=await db.query("SELECT * FROM einvoice_connections WHERE business_id=$1 LIMIT 1",[business.id]);
  const conn=c[0]||null;
  res.json({
    connected:!!(conn&&conn.status==="connected"),
    connection:conn,
    readiness:{
      business_name:!!business.legal_name,
      trn:!business.vat_registered||!!business.trn,
      vat_configuration:true,
      asp_provider_connected:!!(conn&&conn.status==="connected")
    },
    message:conn&&conn.status==="connected"
      ?"An external e-invoicing provider connection is recorded."
      :"No UAE Accredited Service Provider is connected. The app does not claim e-invoicing accreditation."
  });
}