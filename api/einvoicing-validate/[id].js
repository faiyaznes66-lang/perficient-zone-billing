import { db } from "hatchable";
import { buildUaeInvoice,makeUnifyEnvelope,complyanceRequest } from "lib/complyance.js";

export const access="user";
export const methods=["GET"];

const providerErrors=body=>(Array.isArray(body?.errors)?body.errors:[]).map(x=>({
  code:x.code||null,path:x.payloadPath||x.getsPath||x.path||null,message:x.message||String(x)
}));

export default async function(req,res){
  const {rows:b}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(404).json({error:"Business not found"});
  const business=b[0];
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
  const {rows:items}=await db.query("SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY position",[invoice.id]);
  const {rows:connections}=await db.query("SELECT * FROM einvoice_connections WHERE business_id=$1 AND provider_code='complyance' LIMIT 1",[business.id]);
  const connection=connections[0]||null;
  const buyerType=invoice.customer_einvoice_buyer_type||(invoice.buyer_customer_type==="individual"?"consumer":"business");
  if(buyerType==="consumer") return res.json({
    applicable:false,can_submit:false,buyer_type:buyerType,errors:[],
    warnings:["B2C consumer invoices are outside the current UAE e-invoicing transaction scope. In-scope B2B invoices received by this business may still need to be received through its ASP."],
    message:"This invoice is classified as B2C and is not submitted through the UAE B2B/B2G e-invoicing flow."
  });

  const built=buildUaeInvoice({invoice,business,customer:invoice.buyer_id?{
    id:invoice.buyer_id,name:invoice.buyer_name,company:invoice.buyer_company,legal_name:invoice.buyer_legal_name,
    trn:invoice.buyer_trn,tin_number:invoice.buyer_tin,electronic_address:invoice.buyer_electronic_address,
    electronic_address_scheme:invoice.buyer_electronic_scheme,buyer_id_value:invoice.buyer_id_value,
    buyer_id_authority:invoice.buyer_id_authority,buyer_registration_type:invoice.buyer_registration_type,
    address_line1:invoice.buyer_address_line1,city:invoice.buyer_city,emirate:invoice.buyer_emirate,
    country:invoice.buyer_country,einvoice_buyer_type:buyerType
  }:null,items,connection});
  const errors=[...built.errors];
  const warnings=[];
  if(["draft","cancelled"].includes(invoice.status)) errors.push("Only issued invoices can be submitted. Save and issue this invoice first.");
  if(!connection) warnings.push("Connect Complyance in Business Settings before provider validation.");
  if(connection&&!connection.mapping_ready) warnings.push("The Complyance source mapping is not ready. Complete the Default GETS Mapping Testbed cases in the Complyance Developer Portal.");
  if(!connection?.mapping_ready) return res.json({
    applicable:true,can_submit:false,buyer_type:buyerType,errors,warnings,
    provider_validation:"not_run",
    message:errors.length?"Complete the missing fields before continuing.":"Local checks passed, but Complyance mapping is not ready."
  });
  if(errors.length) return res.json({
    applicable:true,can_submit:false,buyer_type:buyerType,errors,warnings,
    provider_validation:"not_run",
    message:"Complete the missing fields before provider validation."
  });

  const source=connection.source_name+":"+connection.source_version;
  const envelope=makeUnifyEnvelope({environment:connection.environment||"sandbox",source,payload:built.payload,modifiers:built.modifiers,purpose:"validate"});
  try{
    const provider=await complyanceRequest("/api/v3/unify",{environment:connection.environment||"sandbox",method:"POST",body:envelope});
    const valid=provider.valid===true||provider.data?.valid===true;
    const pErrors=providerErrors(provider);
    return res.json({
      applicable:true,can_submit:valid,buyer_type:buyerType,errors:valid?[]:pErrors,
      warnings:["Complyance validation does not store, exchange or report the invoice. The separate Send to Complyance action is required after reviewing the result."],
      provider_validation:valid?"passed":"failed",
      provider_response:provider,
      message:valid?"Complyance sandbox validation passed. The invoice has not been submitted.":"Complyance did not confirm that this payload is valid."
    });
  }catch(error){
    const pErrors=providerErrors(error.provider);
    return res.status(error.status||502).json({
      applicable:true,can_submit:false,buyer_type:buyerType,errors:pErrors.length?pErrors:[error.message],
      warnings:["No invoice submission was attempted. Correct the provider validation response before sending."],
      provider_validation:"failed",provider_code:error.code||"COMPLYANCE_VALIDATION_FAILED",
      message:"Complyance rejected or could not validate this invoice."
    });
  }
}
