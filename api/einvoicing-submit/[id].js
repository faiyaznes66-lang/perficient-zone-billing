import { db } from "hatchable";
import { buildUaeInvoice,makeUnifyEnvelope,complyanceRequest,payloadHash,apiKeyFor } from "lib/complyance.js";

export const access="user";
export const methods=["POST"];

const errorsFrom=body=>(Array.isArray(body?.errors)?body.errors:[]).map(x=>({
  code:x.code||null,path:x.payloadPath||x.getsPath||x.path||null,message:x.message||String(x)
}));

export default async function(req,res){
  if(req.body?.confirm_submit!==true) return res.status(400).json({error:"Explicit confirmation is required before sending an invoice to Complyance."});
  const {rows:b}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  const business=b[0];
  if(!business) return res.status(404).json({error:"Business not found"});
  const {rows:r}=await db.query(
    `SELECT i.*,c.id AS buyer_id,c.name AS buyer_name,c.company AS buyer_company,
       c.legal_name AS buyer_legal_name,c.trn AS buyer_trn,c.tin_number AS buyer_tin,
       c.electronic_address AS buyer_electronic_address,c.electronic_address_scheme AS buyer_electronic_scheme,
       c.buyer_id_value,c.buyer_id_authority,c.buyer_registration_type,
       c.address_line1 AS buyer_address_line1,c.city AS buyer_city,c.emirate AS buyer_emirate,
       c.country AS buyer_country,c.customer_type AS buyer_customer_type,
       c.einvoice_buyer_type AS customer_einvoice_buyer_type
     FROM invoices i
     LEFT JOIN customers c ON c.id=i.customer_id AND c.business_id=i.business_id
     WHERE i.id=$1 AND i.business_id=$2 LIMIT 1`,
    [req.params.id,business.id]
  );
  if(!r[0]) return res.status(404).json({error:"Invoice not found"});
  const invoice=r[0];
  if(["draft","cancelled"].includes(invoice.status)) return res.status(409).json({error:"Only issued invoices can be sent to Complyance.",code:"EINVOICE_INVOICE_NOT_ISSUED"});
  if(invoice.einvoice_provider_document_id) return res.status(409).json({error:"This invoice already has a Complyance document ID. Refresh its status instead of resubmitting.",code:"EINVOICE_ALREADY_SUBMITTED"});
  const {rows:items}=await db.query("SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position",[invoice.id]);
  const {rows:connections}=await db.query("SELECT * FROM einvoice_connections WHERE business_id=$1 AND provider_code='complyance' LIMIT 1",[business.id]);
  const connection=connections[0];
  if(!connection||connection.status!=="connected") return res.status(409).json({error:"Connect Complyance in Business Settings first.",code:"EINVOICE_PROVIDER_REQUIRED"});
  if(!connection.mapping_ready) return res.status(409).json({error:"Complyance source mapping is not ready. Complete and pass the Default GETS Mapping Testbed cases before submitting.",code:"COMPLYANCE_MAPPING_NOT_READY"});
  const environment=connection.environment||"sandbox";
  if(!apiKeyFor(environment)) return res.status(503).json({error:"Configure the Complyance "+environment+" API key in Hostinger server environment variables before submitting.",code:"COMPLYANCE_API_KEY_MISSING"});
  const buyerType=invoice.customer_einvoice_buyer_type||(invoice.buyer_customer_type==="individual"?"consumer":"business");
  const customer=invoice.buyer_id?{
    id:invoice.buyer_id,name:invoice.buyer_name,company:invoice.buyer_company,legal_name:invoice.buyer_legal_name,
    trn:invoice.buyer_trn,tin_number:invoice.buyer_tin,electronic_address:invoice.buyer_electronic_address,
    electronic_address_scheme:invoice.buyer_electronic_scheme,buyer_id_value:invoice.buyer_id_value,
    buyer_id_authority:invoice.buyer_id_authority,buyer_registration_type:invoice.buyer_registration_type,
    address_line1:invoice.buyer_address_line1,city:invoice.buyer_city,emirate:invoice.buyer_emirate,
    country:invoice.buyer_country,einvoice_buyer_type:buyerType
  }:null;
  const built=buildUaeInvoice({invoice,business,customer,items,connection});
  if(built.errors.length){
    await db.query("UPDATE invoices SET einvoice_status='validation_failed',einvoice_last_error=$2 WHERE id=$1",[invoice.id,built.errors.join("; ").slice(0,2000)]);
    return res.status(422).json({error:"Complete the UAE PINT AE fields before submission.",code:"EINVOICE_LOCAL_VALIDATION_FAILED",errors:built.errors});
  }

  const source=connection.source_name+":"+connection.source_version;
  const envelope=makeUnifyEnvelope({environment,source,payload:built.payload,modifiers:built.modifiers,purpose:"invoicing"});
  const hash=payloadHash(envelope);
  let doc;
  const {rows:existing}=await db.query("SELECT * FROM einvoice_documents WHERE invoice_id=$1 AND direction='outbound' LIMIT 1",[invoice.id]);
  if(existing[0]){
    doc=existing[0];
    if(doc.provider_document_id||["submitting","submission_unknown","submitted","processing","final_valid","final_invalid"].includes(doc.status)){
      return res.status(409).json({error:"A submission record already exists for this invoice. Refresh status or reconcile the existing provider request; do not submit it again.",code:"EINVOICE_SUBMISSION_ALREADY_RECORDED",provider_document_id:doc.provider_document_id||null,status:doc.status});
    }
    await db.query(
      `UPDATE einvoice_documents SET status='submitting',provider_code='complyance',provider_environment=$2,
       payload_json=$3::jsonb,payload_sha256=$4,last_error=NULL,validation_response=NULL,provider_response=NULL,
       updated_at=now() WHERE id=$1`,
      [doc.id,environment,JSON.stringify(envelope),hash]
    );
  }else{
    const inserted=await db.query(
      `INSERT INTO einvoice_documents
       (business_id,invoice_id,direction,document_type,status,provider_code,provider_environment,
        payload_json,payload_sha256,issued_at)
       VALUES ($1,$2,'outbound','invoice','submitting','complyance',$3,$4::jsonb,$5,$6)
       ON CONFLICT (invoice_id) WHERE direction='outbound' AND invoice_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [business.id,invoice.id,environment,JSON.stringify(envelope),hash,invoice.invoice_date]
    );
    doc=inserted.rows[0];
    if(!doc) return res.status(409).json({error:"A submission record already exists for this invoice. Refresh status before attempting anything else.",code:"EINVOICE_SUBMISSION_ALREADY_RECORDED"});
  }

  await db.query("UPDATE invoices SET einvoice_status='submitting',einvoice_last_error=NULL WHERE id=$1",[invoice.id]);
  let submissionStarted=false;
  try{
    const validation=await complyanceRequest("/api/v3/unify",{environment,method:"POST",body:{...envelope,purpose:"validate"}});
    const valid=validation.valid===true||validation.data?.valid===true;
    if(!valid){
      const providerErrors=errorsFrom(validation);
      await db.query(
        `UPDATE einvoice_documents SET status='validation_failed',validation_response=$2::jsonb,
         provider_errors=$3::jsonb,last_error=$4,updated_at=now() WHERE id=$1`,
        [doc.id,JSON.stringify(validation),JSON.stringify(providerErrors),providerErrors.map(x=>x.message).join("; ")||"Complyance did not return valid=true"]
      );
      await db.query("UPDATE invoices SET einvoice_status='validation_failed',einvoice_last_error=$2 WHERE id=$1",[invoice.id,providerErrors.map(x=>x.message).join("; ").slice(0,2000)||"Complyance validation did not pass"]);
      return res.status(422).json({error:"Complyance sandbox validation did not pass. No invoice was submitted.",code:"COMPLYANCE_VALIDATION_FAILED",errors:providerErrors,provider_response:validation});
    }

    submissionStarted=true;
    const submitted=await complyanceRequest("/api/v3/unify",{environment,method:"POST",body:envelope});
    const data=submitted.data||submitted;
    const documentId=data.documentId||submitted.documentId;
    if(!documentId){
      await db.query("UPDATE einvoice_documents SET status='submission_unknown',provider_response=$2::jsonb,last_error='Provider returned success without a documentId',updated_at=now() WHERE id=$1",[doc.id,JSON.stringify(submitted)]);
      await db.query("UPDATE invoices SET einvoice_status='submission_unknown',einvoice_last_error='Provider response did not include a document ID' WHERE id=$1",[invoice.id]);
      return res.status(502).json({error:"Complyance response did not include a document ID. Do not retry automatically; check the Complyance portal first.",code:"EINVOICE_SUBMISSION_UNKNOWN"});
    }
    const providerState=data.state||"submitted";
    await db.query(
      `UPDATE einvoice_documents SET status=$2,provider_document_id=$3,provider_state=$2,
       provider_is_terminal=$4,provider_compliance=$5::jsonb,provider_errors=$6::jsonb,
       provider_response=$7::jsonb,validation_response=$8::jsonb,submitted_at=now(),
       last_error=NULL,updated_at=now() WHERE id=$1`,
      [doc.id,providerState,documentId,!!data.isTerminal,JSON.stringify(data.compliance||{}),JSON.stringify(data.errors||[]),JSON.stringify(submitted),JSON.stringify(validation)]
    );
    await db.query(
      "UPDATE invoices SET einvoice_status=$2,einvoice_provider_document_id=$3,einvoice_submitted_at=now(),einvoice_last_error=NULL WHERE id=$1",
      [invoice.id,providerState,documentId]
    );
    await db.query(
      `INSERT INTO einvoice_events (business_id,invoice_id,provider_name,status,external_document_ref,message,direction,event_type,status_code,external_message_ref,payload)
       VALUES ($1,$2,'Complyance',$3,$4,$5,'outbound','document.submitted',$3,$4,$6::jsonb)`,
      [business.id,invoice.id,providerState,documentId,"Submitted to Complyance "+environment+" environment.",JSON.stringify(submitted)]
    );
    return res.json({ok:true,submitted:true,environment,documentId,status:providerState,isTerminal:!!data.isTerminal,compliance:data.compliance||null,message:"Invoice accepted by Complyance for asynchronous processing. Refresh its status to confirm final FTA and buyer-ASP acceptance."});
  }catch(error){
    const providerErrors=errorsFrom(error.provider);
    const knownRejection=error.status===400||error.status===401||error.status===403||error.status===404||error.status===412||error.status===422||error.status===429;
    const status=!submissionStarted?"validation_failed":(knownRejection?"submission_failed":"submission_unknown");
    const message=String(error.message||"Complyance request failed").slice(0,2000);
    await db.query(
      `UPDATE einvoice_documents SET status=$2,provider_errors=$3::jsonb,provider_response=$4::jsonb,
       last_error=$5,updated_at=now() WHERE id=$1`,
      [doc.id,status,JSON.stringify(providerErrors),JSON.stringify(error.provider||{}),message]
    );
    await db.query("UPDATE invoices SET einvoice_status=$2,einvoice_last_error=$3 WHERE id=$1",[invoice.id,status,message]);
    return res.status(error.status||502).json({
      error:!submissionStarted?"Complyance validation was unavailable or rejected the payload. No invoice submission was attempted.":(knownRejection?message:"The provider request may have reached Complyance but its result is not confirmed. Do not resubmit until the provider portal has been checked."),
      code:!submissionStarted?(error.code||"COMPLYANCE_VALIDATION_FAILED"):(knownRejection?(error.code||"COMPLYANCE_SUBMISSION_FAILED"):"EINVOICE_SUBMISSION_UNKNOWN"),
      status,errors:providerErrors
    });
  }
}
