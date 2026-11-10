import { db } from "hatchable";
import { complyanceRequest } from "lib/complyance.js";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(404).json({error:"Business not found."});
  const {rows:c}=await db.query("SELECT * FROM einvoice_connections WHERE business_id=$1 AND provider_code='complyance' LIMIT 1",[b[0].id]);
  const conn=c[0];
  if(!conn||!conn.source_name||!conn.source_version) return res.status(409).json({error:"No Complyance sandbox company is linked yet."});
  try{
    const path="/v3/connect/companies/"+encodeURIComponent(conn.source_name)+"?sourceVersion="+encodeURIComponent(conn.source_version);
    const response=await complyanceRequest(path,{environment:conn.environment||"sandbox",connect:true});
    const data=response.data||response;
    const mappingReady=data.readyForInvoicing===true;
    const onboardingStatus=data.onboardingStatus||(data.status==="active"?"onboarded":conn.onboarding_status||"draft");
    const connectionStatus=onboardingStatus==="onboarded"?"connected":"pending_authorization";
    const metadata={
      ...(conn.metadata||{}),
      companyId:data.companyId||conn.company_id,
      sourceId:data.sourceId||conn.source_id,
      branchId:data.branchId||conn.branch_id,
      mappingReadiness:data.mappingReadiness||conn.metadata?.mappingReadiness||null,
      readyForInvoicing:mappingReady,
      peppolParticipantId:data.peppolParticipantId||data.peppolId||conn.participant_id||null,
      legalName:data.legalName||conn.metadata?.legalName||null,
      tin:data.tin||conn.metadata?.tin||null,
      refreshedAt:new Date().toISOString()
    };
    await db.query(
      `UPDATE einvoice_connections SET
        status=$2,company_id=$3,source_id=$4,branch_id=$5,participant_id=$6,
        mapping_ready=$7,onboarding_status=$8,metadata=$9::jsonb,
        last_checked_at=now(),last_error=NULL,updated_at=now()
       WHERE business_id=$1`,
      [b[0].id,connectionStatus,metadata.companyId,metadata.sourceId,metadata.branchId,metadata.peppolParticipantId,mappingReady,onboardingStatus,JSON.stringify(metadata)]
    );
    return res.json({ok:true,mappingReady,onboardingStatus,mappingReadiness:metadata.mappingReadiness,message:onboardingStatus!=="onboarded"?"Complyance onboarding is not complete. Verify the FTA ASP authorisation and provider onboarding status.":mappingReady?"Complyance source is ready for sandbox invoice validation.":"Complyance source is linked but its mapping is not yet ready. Complete the Default GETS Mapping Testbed cases in the Developer Portal."});
  }catch(error){
    await db.query("UPDATE einvoice_connections SET last_error=$2,last_checked_at=now(),updated_at=now() WHERE business_id=$1",[b[0].id,String(error.message||"Refresh failed").slice(0,1000)]).catch(()=>{});
    return res.status(error.status||502).json({error:error.message||"Could not refresh Complyance status.",code:error.code||"COMPLYANCE_REFRESH_FAILED"});
  }
}
