import { db } from "hatchable";
import { complyanceRequest,sourceIdentity } from "lib/complyance.js";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT * FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  const business=b[0];
  if(!business) return res.status(400).json({error:"Complete business setup first."});
  const body=req.body||{};
  if(body.authorized_by_business!==true) return res.status(400).json({error:"Confirm that this business has authorised Complyance as its ASP in the FTA portal before onboarding."});
  if(!/^1\d{9}$/.test(String(business.tin_number||""))) return res.status(400).json({error:"Enter the business's valid 10-digit FTA TIN in Settings."});
  if(!business.legal_name||!business.trade_license_number||!business.trade_license_authority||!business.city||!business.emirate||!business.address) return res.status(400).json({error:"Complete the seller legal registration and UAE address details in Settings."});
  if(!["in_scope","voluntary"].includes(business.einvoice_scope_status)) return res.status(400).json({error:"Complete the UAE e-invoicing scope assessment before connecting an ASP."});
  if(!["below_50m","at_or_above_50m","government"].includes(business.einvoice_revenue_band)) return res.status(400).json({error:"Select the correct latest annual revenue band before connecting an ASP."});
  const contactEmail=String(business.einvoice_contact_email||"").trim().toLowerCase();
  const contactName=String(business.einvoice_contact_name||"").trim();
  const contactMobile=String(business.einvoice_contact_mobile||"").replace(/\s+/g,"");
  if(!contactEmail||!/^\S+@\S+\.\S+$/.test(contactEmail)) return res.status(400).json({error:"Enter the FTA administrator email that was used for the Complyance ASP authorisation."});
  if(!contactName) return res.status(400).json({error:"Enter the authorised contact person's name."});
  if(contactMobile&&!/^\+?\d{7,15}$/.test(contactMobile)) return res.status(400).json({error:"Contact mobile must contain 7–15 digits, with an optional leading +."});

  const environment="sandbox";
  const {sourceName,sourceVersion}=sourceIdentity(business.id);
  const branchName=String(business.emirate||"Main").trim();
  try{
    // Always check the workspace first. Complyance recommends listing companies
    // after a timeout rather than blindly repeating a create request.
    let found=null;
    for(let page=1;page<=20;page++){
      const params=new URLSearchParams({countryCode:"AE",sourceVersion,search:sourceName,limit:"100",page:String(page)});
      const listing=await complyanceRequest("/v3/connect/companies?"+params.toString(),{environment,connect:true});
      const rows=Array.isArray(listing.data)?listing.data:[];
      found=rows.find(x=>x.sourceName===sourceName&&x.sourceVersion===sourceVersion)||null;
      if(found) break;
      if(!listing.meta?.pagination?.hasMore) break;
    }

    let data=found;
    if(data){
      if(data.tin&&String(data.tin)!==String(business.tin_number)) return res.status(409).json({error:"A Complyance source with this application identity already exists but its TIN does not match this business. Contact support before continuing."});
      if(!data.companyId||!data.branchId) {
        const detail=await complyanceRequest("/v3/connect/companies/"+encodeURIComponent(sourceName)+"?sourceVersion="+encodeURIComponent(sourceVersion),{environment,connect:true});
        data=detail.data||detail;
      }
    }else{
      const request={
        sourceName,sourceVersion,countryCode:"AE",tin:String(business.tin_number),
        contactPersonEmail:contactEmail,contactPersonName:contactName,
        branchName,platformEnvironment:environment,
        ...(contactMobile?{contactPersonMobile:contactMobile}:{})
      };
      const created=await complyanceRequest("/v3/connect/companies",{environment,method:"POST",body:request,connect:true});
      const detail=await complyanceRequest("/v3/connect/companies/"+encodeURIComponent(sourceName)+"?sourceVersion="+encodeURIComponent(sourceVersion),{environment,connect:true});
      data=detail.data||detail||created.data||created;
    }

    const companyId=data.companyId;
    const branchId=data.branchId;
    if(!companyId||!branchId) throw new Error("Complyance did not return the company and branch identifiers. Check the provider portal before retrying.");
    const mappingReady=data.readyForInvoicing===true;
    const onboardingStatus=data.onboardingStatus||(data.readyForInvoicing===true?"onboarded":"draft");
    const connectionStatus=onboardingStatus==="onboarded"?"connected":"pending_authorization";
    const metadata={
      sourceName,sourceVersion,branchName,companyId,sourceId:data.sourceId||null,branchId,
      userGivenBranchId:data.userGivenBranchId||null,
      mappingReadiness:data.mappingReadiness||null,
      readyForInvoicing:mappingReady,
      peppolParticipantId:data.peppolParticipantId||data.peppolId||null,
      legalName:data.legalName||null,tin:data.tin||business.tin_number,
      contactPersonEmail:contactEmail,platformEnvironment:environment
    };
    await db.query(
      `INSERT INTO einvoice_connections
        (business_id,provider_name,provider_code,accreditation_number,status,external_account_ref,
         participant_id,environment,company_id,source_id,branch_id,source_name,source_version,
         branch_name,mapping_ready,onboarding_status,connected_at,last_checked_at,last_error,metadata,updated_at)
       VALUES ($1,'Complyance','complyance','112219',$12,$2,$3,'sandbox',$4,$5,$6,$7,$8,$9,$10,$11,now(),now(),NULL,$13::jsonb,now())
       ON CONFLICT (business_id) DO UPDATE SET
         provider_name='Complyance',provider_code='complyance',accreditation_number='112219',
         status=EXCLUDED.status,external_account_ref=EXCLUDED.external_account_ref,
         participant_id=EXCLUDED.participant_id,environment='sandbox',
         company_id=EXCLUDED.company_id,source_id=EXCLUDED.source_id,branch_id=EXCLUDED.branch_id,
         source_name=EXCLUDED.source_name,source_version=EXCLUDED.source_version,
         branch_name=EXCLUDED.branch_name,mapping_ready=EXCLUDED.mapping_ready,
         onboarding_status=EXCLUDED.onboarding_status,connected_at=now(),last_checked_at=now(),
         last_error=NULL,metadata=EXCLUDED.metadata,updated_at=now()`,
      [business.id,companyId,metadata.peppolParticipantId,companyId,metadata.sourceId,branchId,sourceName,sourceVersion,branchName,mappingReady,onboardingStatus,connectionStatus,JSON.stringify(metadata)]
    );
    return res.json({
      ok:true,provider:"Complyance",environment,companyId,branchId,sourceName,sourceVersion,
      participantId:metadata.peppolParticipantId,mappingReady,
      onboardingStatus,
      message:onboardingStatus!=="onboarded"
        ?"The Complyance company record exists, but ASP onboarding is not complete. Check the FTA authorisation and Complyance onboarding status before proceeding."
        :mappingReady
          ?"Complyance sandbox company is onboarded and its source reports ready for invoicing."
          :"Complyance sandbox company is onboarded. Complete the Default GETS Mapping setup and pass the required Testbed cases in the Complyance Developer Portal before sending invoices."
    });
  }catch(error){
    await db.query(
      "UPDATE einvoice_connections SET last_error=$2,last_checked_at=now(),updated_at=now() WHERE business_id=$1",
      [business.id,String(error.message||"Complyance onboarding failed").slice(0,1000)]
    ).catch(()=>{});
    return res.status(error.status||502).json({error:error.message||"Complyance onboarding failed",code:error.code||"COMPLYANCE_ONBOARDING_FAILED"});
  }
}
