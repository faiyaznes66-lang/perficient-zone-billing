import { db } from "hatchable";
import { complyanceRequest } from "lib/complyance.js";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(404).json({error:"Business not found"});
  const {rows:i}=await db.query("SELECT id,invoice_number,einvoice_provider_document_id FROM invoices WHERE id=$1 AND business_id=$2 LIMIT 1",[req.params.id,b[0].id]);
  if(!i[0]) return res.status(404).json({error:"Invoice not found"});
  const {rows:d}=await db.query("SELECT * FROM einvoice_documents WHERE invoice_id=$1 AND direction='outbound' AND provider_code='complyance' LIMIT 1",[i[0].id]);
  const doc=d[0];
  const documentId=doc?.provider_document_id||i[0].einvoice_provider_document_id;
  if(!documentId) return res.status(409).json({error:"This invoice has not been submitted to Complyance.",code:"EINVOICE_NOT_SUBMITTED"});
  const {rows:c}=await db.query("SELECT environment FROM einvoice_connections WHERE business_id=$1 AND provider_code='complyance' LIMIT 1",[b[0].id]);
  const environment=c[0]?.environment||doc.provider_environment||"sandbox";
  try{
    const response=await complyanceRequest("/api/v3/documents/"+encodeURIComponent(documentId)+"?type=sales",{environment});
    const data=response.data||response;
    const status=data.state||"processing";
    await db.query(
      `UPDATE einvoice_documents SET status=$2,provider_state=$2,
       provider_is_terminal=$3,provider_compliance=$4::jsonb,provider_errors=$5::jsonb,
       provider_response=$6::jsonb,last_error=NULL,updated_at=now() WHERE id=$1`,
      [doc.id,status,!!data.isTerminal,JSON.stringify(data.compliance||{}),JSON.stringify(data.errors||[]),JSON.stringify(response)]
    );
    await db.query("UPDATE invoices SET einvoice_status=$2,einvoice_last_error=$3 WHERE id=$1",[i[0].id,status,(data.errors||[]).map(x=>x.message||x.code).join("; ").slice(0,2000)||null]);
    await db.query(
      `INSERT INTO einvoice_events (business_id,invoice_id,provider_name,status,external_document_ref,message,direction,event_type,status_code,external_message_ref,payload)
       VALUES ($1,$2,'Complyance',$3,$4,$5,'outbound','document.status_updated',$3,$4,$6::jsonb)`,
      [b[0].id,i[0].id,status,documentId,"Complyance status refreshed: "+status,JSON.stringify(response)]
    );
    return res.json({ok:true,documentId,status,isTerminal:!!data.isTerminal,compliance:data.compliance||null,errors:data.errors||[],message:data.isTerminal?(status==="final_valid"?"Complyance reports final_valid: the buyer ASP and FTA have accepted the document.":"Complyance reports a terminal non-valid state. Review the provider errors before taking corrective action."):"The document is still processing. Refresh again later; do not resubmit it."});
  }catch(error){
    return res.status(error.status||502).json({error:error.message||"Could not retrieve Complyance document status.",code:error.code||"COMPLYANCE_STATUS_FAILED"});
  }
}
