import { createHmac,timingSafeEqual } from "node:crypto";
import { db } from "hatchable";

export const access="public";
export const methods=["POST"];

function verify(rawBody,secret,signature){
  if(!secret||!/^[0-9a-f]{64}$/.test(String(signature||""))) return false;
  const expected=createHmac("sha256",secret).update(rawBody).digest("hex");
  const a=Buffer.from(signature,"hex"),b=Buffer.from(expected,"hex");
  return a.length===b.length&&timingSafeEqual(a,b);
}

export default async function(req,res){
  const environment=String(req.params.environment||"").toLowerCase();
  if(!["sandbox","production"].includes(environment)) return res.status(404).json({error:"Unknown webhook environment."});
  const secret=environment==="production"
    ?process.env.COMPLYANCE_WEBHOOK_SECRET_PRODUCTION
    :process.env.COMPLYANCE_WEBHOOK_SECRET_SANDBOX;
  const raw=req.rawBody;
  const signature=req.headers["x-webhook-signature"];
  if(!Buffer.isBuffer(raw)) return res.status(400).json({error:"Raw webhook body is unavailable."});
  if(!verify(raw,secret,signature)) return res.status(401).json({error:"Invalid Complyance webhook signature."});

  const body=req.body||{};
  const eventId=String(req.headers["x-webhook-id"]||body.eventId||body.data?.id||"").trim();
  const eventType=String(req.headers["x-webhook-event"]||body.data?.type||body.type||"").trim();
  if(!eventId||!eventType) return res.status(400).json({error:"Webhook event ID and event type are required."});
  const eventData=body.data?.data||{};
  const companyId=eventData.attribution?.companyId||body.data?.data?.attribution?.companyId||null;
  const {rows:matched}=companyId?await db.query(
    "SELECT business_id FROM einvoice_connections WHERE provider_code='complyance' AND environment=$1 AND company_id=$2 LIMIT 1",
    [environment,String(companyId)]
  ):{rows:[]};
  const businessId=matched[0]?.business_id||null;

  try{
    const {rows:inserted}=await db.query(
      `INSERT INTO einvoice_webhook_events
       (provider_code,environment,provider_event_id,event_type,business_id,payload_json)
       VALUES ('complyance',$1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (provider_code,environment,provider_event_id) DO NOTHING
       RETURNING id`,
      [environment,eventId,eventType,businessId,JSON.stringify(body)]
    );
    if(!inserted[0]) return res.status(200).json({ok:true,duplicate:true});

    if(businessId&&eventType.startsWith("purchase.invoice.")){
      const documentId=eventData.documentId||null;
      if(documentId){
        await db.query(
          `INSERT INTO einvoice_inbox
           (business_id,provider_code,provider_document_id,sender_name,sender_tin,sender_trn,
            sender_endpoint,document_number,document_type,issue_date,currency,total,payload_json,
            status,environment,provider_event_id,provider_state,provider_errors)
           VALUES ($1,'complyance',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$13,$16::jsonb)
           ON CONFLICT (business_id,provider_code,provider_document_id) DO UPDATE SET
             sender_name=COALESCE(EXCLUDED.sender_name,einvoice_inbox.sender_name),
             document_number=COALESCE(EXCLUDED.document_number,einvoice_inbox.document_number),
             document_type=EXCLUDED.document_type,issue_date=COALESCE(EXCLUDED.issue_date,einvoice_inbox.issue_date),
             currency=EXCLUDED.currency,total=COALESCE(EXCLUDED.total,einvoice_inbox.total),
             payload_json=EXCLUDED.payload_json,status=EXCLUDED.status,environment=EXCLUDED.environment,
             provider_event_id=EXCLUDED.provider_event_id,provider_state=EXCLUDED.provider_state,
             provider_errors=EXCLUDED.provider_errors`,
          [businessId,String(documentId),eventData.sellerName||null,eventData.sellerTin||null,eventData.sellerTrn||null,
           eventData.sellerPeppolId||null,eventData.documentNumber||null,eventData.documentType||"invoice",
           eventData.issueDate||null,eventData.currency||"AED",eventData.totalAmount??null,JSON.stringify(body),
           eventType,environment,eventId,JSON.stringify(eventData.errors||[])]
        );
      }
    }
    await db.query("UPDATE einvoice_webhook_events SET processed_at=now() WHERE provider_code='complyance' AND environment=$1 AND provider_event_id=$2",[environment,eventId]);
    return res.status(200).json({ok:true,received:true,linked:!!businessId});
  }catch(error){
    await db.query(
      "UPDATE einvoice_webhook_events SET processing_error=$4 WHERE provider_code='complyance' AND environment=$1 AND provider_event_id=$2 AND event_type=$3",
      [environment,eventId,eventType,String(error.message||"Webhook processing failed").slice(0,1000)]
    ).catch(()=>{});
    return res.status(500).json({error:"Webhook could not be processed. Complyance may retry this event."});
  }
}
