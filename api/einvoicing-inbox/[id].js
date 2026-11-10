import { db } from "hatchable";
import { complyanceRequest } from "lib/complyance.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(404).json({error:"Business not found"});
  const {rows:r}=await db.query(
    "SELECT * FROM einvoice_inbox WHERE id=$1 AND business_id=$2 LIMIT 1",
    [req.params.id,b[0].id]
  );
  if(!r[0]) return res.status(404).json({error:"Incoming invoice not found"});
  const row=r[0];
  try{
    const response=await complyanceRequest(
      "/api/v3/documents/"+encodeURIComponent(row.provider_document_id)+"?type=purchases",
      {environment:row.environment||"sandbox"}
    );
    const data=response.data||response;
    await db.query(
      `UPDATE einvoice_inbox SET payload_json=$3::jsonb,xml_payload=$4,
       provider_state=$5,provider_errors=$6::jsonb,status=$5
       WHERE id=$1 AND business_id=$2`,
      [row.id,b[0].id,JSON.stringify(data.invoice||data),data.xml||data.xmlResponse||null,data.state||row.status,JSON.stringify(data.errors||[])]
    );
    return res.json({ok:true,document:data});
  }catch(error){
    return res.status(error.status||502).json({error:error.message||"Could not retrieve the incoming invoice.",code:error.code||"COMPLYANCE_PURCHASE_FETCH_FAILED"});
  }
}
